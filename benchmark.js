'use strict'

/*
 * Benchmark: original vs optimized.
 * Run: node benchmark.js
 *
 * Env controls:
 *   ROWS=180000 COLS=8 ROUNDS=7 WARMUPS=2      size / sampling
 *   HEADERS=false                              numeric-key mode
 *   DATA=varied|identical                      input distribution (default varied)
 *   MODE=process|inproc                        process mode = fresh process per
 *                                              measurement (default, immune to
 *                                              in-process allocator drift);
 *                                              inproc = all in one process
 *   OUT=input-data.csv                         also write the generated CSV
 *
 * Two fixes over the original harness:
 *   1. DATA defaults to `varied` (per-row distinct values). The original fed
 *      180,000 byte-identical lines, which measured V8's best case, not a
 *      realistic CSV: identical input ran 192 ms, varied input ran 426 ms.
 *   2. writeRow cost share is measured by hollowing out the method, so the
 *      report can state the end-to-end *ceiling* next to the measured gain.
 */

const { execFileSync } = require('child_process')
const path = require('path')

const ROWS = Number(process.env.ROWS || 180000)
const COLS = Number(process.env.COLS || 8)
const ROUNDS = Number(process.env.ROUNDS || 7)
const WARMUPS = Number(process.env.WARMUPS || 2)
const MODE = process.env.MODE || 'process'
const DATA = process.env.DATA || 'varied'

const RUNNER = path.join(__dirname, 'audit', 'run-arm.js')

function runArm (armFile, mode, hollow) {
  const out = execFileSync(process.execPath, [RUNNER, path.join(__dirname, armFile), mode], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ROWS: String(ROWS),
      COLS: String(COLS),
      MEASURE: String(ROUNDS),
      WARMUP: String(WARMUPS),
      DATA,
      HOLLOW_WRITEROW: hollow ? '1' : ''
    }
  })
  return JSON.parse(out)
}

function median (a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
function min (a) { return Math.min(...a) }
function quantile (a, q) { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] }
function sd (a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) }

function interleave (rounds) {
  const mode = process.env.HEADERS === 'false' ? 'noheaders' : 'normal'
  const res = { A: [], B: [], C: [], noop: [] }
  for (let i = 0; i < rounds; i++) {
    const order = i % 2 === 1 ? ['C', 'B', 'A', 'noop'] : ['A', 'B', 'C', 'noop']
    for (const key of order) {
      const j = runArm('audit/arms/arm' + (key === 'noop' ? 'A' : key) + '.js', mode, key === 'noop')
      res[key].push(j.best)
    }
  }
  return res
}

function inproc () {
  const res = { A: [], B: [], C: [], noop: [] }
  // All four arms in one process, interleaved inside each round.
  const { onceInproc } = require('./audit/inproc-runner.js')
  const rows = ROWS
  ;(async () => {
    for (let i = 0; i < WARMUPS; i++) await onceInproc('A'); await onceInproc('B'); await onceInproc('C')
    for (let i = 0; i < ROUNDS; i++) {
      const order = i % 2 === 1 ? ['C', 'A', 'B', 'noop'] : ['A', 'B', 'C', 'noop']
      for (const k of order) res[k].push(await onceInproc(k))
    }
  })()
  return res
}

function report (res, mode) {
  const { A, B, C, noop } = res
  const rBA = A.map((v, i) => v / B[i])
  const rCB = B.map((v, i) => v / C[i])
  const rCA = A.map((v, i) => v / C[i])

  // Cost share of writeRow, from hollowing the method out (min-of-N: transient
  // slowdowns can only inflate a sample, never deflate it).
  const share = (min(A) - min(noop)) / min(A)

  // Ceiling: if writeRow's isolated speedup is s, the end-to-end ceiling is
  // share x (1 - 1/s). The isolated speedup is measured separately
  // (audit/probe-writerow2.js) because the in-stream signal is below noise.
  const isolated = Number(process.env.ISOLATED_SPEEDUP || 0)
  const ceiling = isolated > 1 ? share * (1 - 1 / isolated) : null

  const payload = {
    benchmark: 'writeRow optimization: three-arm attribution + end-to-end ceiling',
    rows: ROWS, columns: COLS,
    headerMode: process.env.HEADERS === 'false' ? 'headers:false (numeric keys)' : 'first CSV row is headers',
    dataDistribution: DATA,
    timingMode: mode,
    measuredRounds: ROUNDS,
    node: process.version,
    platform: process.platform + ' ' + process.arch,
    armMediansMs: { original: +median(A).toFixed(1), mapRemovedOnly: +median(B).toFixed(1), optimized: +median(C).toFixed(1) },
    armBestMs: { original: +min(A).toFixed(1), mapRemovedOnly: +min(B).toFixed(1), optimized: +min(C).toFixed(1) },
    attribution: {
      'B/A reduce->for only': ratio(rBA),
      'C/B map removal only': ratio(rCB),
      'C/A total': ratio(rCA)
    },
    writeRow: {
      hollowedOutBestMs: +min(noop).toFixed(1),
      costBestMs: +(min(A) - min(noop)).toFixed(1),
      shareOfEndToEndPercent: +(share * 100).toFixed(2),
      isolatedSpeedup: isolated || null,
      isolatedSpeedupNote: isolated ? 'from audit/probe-writerow2.js (pass via ISOLATED_SPEEDUP)' : 'not measured in this run',
      endToEndCeilingPercent: ceiling === null ? null : +(ceiling * 100).toFixed(2)
    },
    noise: { cvOriginalPercent: +(sd(A) / median(A) * 100).toFixed(1), cvOptimizedPercent: +(sd(C) / median(C) * 100).toFixed(1) },
    samples: res
  }
  console.log(JSON.stringify(payload, null, 2))
}

function ratio (r) {
  return { median: +median(r).toFixed(4), p10: +quantile(r, 0.1).toFixed(4), p90: +quantile(r, 0.9).toFixed(4) }
}

if (MODE === 'inproc') report(inproc(), 'inproc (single process, interleaved rounds)')
else report(interleave(ROUNDS), 'process (fresh process per measurement, interleaved order, best-of-N)')
