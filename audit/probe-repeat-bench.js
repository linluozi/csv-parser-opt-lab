'use strict'
/*
 * Rerun the whole benchmark N times in independent processes and look at the
 * SPREAD of the headline number, not the average.
 *
 * A single run reports one number; that number is a draw from a distribution.
 * If the distribution straddles zero, no run (including a favorable one) is
 * evidence. Usage: RUNS=12 node audit/probe-repeat-bench.js
 */

const { execFileSync } = require('child_process')
const path = require('path')

const RUNS = Number(process.env.RUNS || 12)
const script = path.join(__dirname, '..', 'benchmark.js')

const pcts = []
const rows = []
for (let i = 0; i < RUNS; i++) {
  const out = execFileSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, ROUNDS: '7', WARMUPS: '2', MODE: 'process' }
  })
  const j = JSON.parse(out)
  const pct = ((j.armBestMs.original / j.armBestMs.optimized) - 1) * 100
  pcts.push(pct)
  rows.push(pct)
  console.log(`run ${String(i + 1).padStart(2)}: orig=${j.armBestMs.original} opt=${j.armBestMs.optimized} pct=${pct.toFixed(2)}`)
}

const sorted = [...pcts].sort((a, b) => a - b)
const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length
const sd = Math.sqrt(pcts.reduce((a, b) => a + (b - mean) ** 2, 0) / pcts.length)
const q = p => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2)

console.log('\n--- headline speedup% across independent runs ---')
console.log(JSON.stringify({
  runs: RUNS,
  min: +sorted[0].toFixed(2),
  p25: q(0.25),
  median: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
  p75: q(0.75),
  max: +sorted[sorted.length - 1].toFixed(2),
  mean: +mean.toFixed(2),
  sd: +sd.toFixed(2),
  negativeRuns: pcts.filter(v => v < 0).length,
  straddlesZero: sorted[0] < 0 && sorted[sorted.length - 1] > 0
}, null, 2))
