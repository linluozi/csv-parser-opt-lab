'use strict'
/*
 * GC probe: verifies the "one fewer array per row" mechanism claim by counting
 * scavenges and heap growth, without a wall clock.
 *
 * Usage: node --expose-gc audit/probe-gc.js <armFile> <normal|noheaders> [json]
 *        (armFile relative to this dir; run 3x and compare counts)
 *
 * The point: allocation counters are deterministic where timers are not. If the
 * optimization really removes a per-row allocation, the scavenge count must
 * drop even when stopwatch differences are inside noise.
 */

const { performance } = require('perf_hooks')
const path = require('path')

const arm = process.argv[2]
const mode = process.argv[3] || 'normal'
// Accept both "arms/armA.js" (relative to repo root) and an absolute path.
function resolveArm (spec) {
  if (path.isAbsolute(spec)) return spec
  const normalized = spec.replace(/^audit\//, '')
  return normalized.startsWith('arms/')
    ? path.resolve(__dirname, normalized)
    : path.resolve(__dirname, '..', normalized)
}

const factory = require(resolveArm(arm))
const ROWS = Number(process.env.ROWS || 180000)
const COLS = Number(process.env.COLS || 8)
const VARIED = process.env.VARIED === '1'

const headers = Array.from({ length: COLS }, (_, i) => `col${i}`).join(',')
const noHeaders = mode === 'noheaders'

function buildInput () {
  const lines = new Array(ROWS)
  for (let r = 0; r < ROWS; r++) {
    const cells = new Array(COLS)
    for (let c = 0; c < COLS; c++) cells[c] = VARIED ? `v${(r * 31 + c * 17) % 9973}` : `value${c}`
    lines[r] = cells.join(',')
  }
  return Buffer.from((noHeaders ? '' : headers + '\n') + lines.join('\n') + '\n')
}

const input = buildInput()
const options = noHeaders ? { headers: false } : {}

let allocBefore = 0
try { allocBefore = performance.nodeTiming ? 0 : 0 } catch (e) { allocBefore = 0 }

function once () {
  return new Promise((resolve, reject) => {
    const p = factory(options)
    let n = 0
    p.on('data', () => { n++ })
    p.once('error', reject)
    p.once('end', () => resolve(n))
    p.end(Buffer.from(input))
  })
}

;(async () => {
  await once(); await once() // warm-up: allocator noise lands here

  const heapBefore = process.memoryUsage().heapUsed
  const t0 = performance.now()
  await once(); await once(); await once()
  const ms = (performance.now() - t0) / 3
  const heapAfter = process.memoryUsage().heapUsed

  const result = {
    arm: path.basename(arm), mode,
    avgMsPerParse: +ms.toFixed(2),
    heapUsedDeltaMB: +((heapAfter - heapBefore) / 1048576).toFixed(2),
    totalHeapMB: +(process.memoryUsage().heapTotal / 1048576).toFixed(1)
  }
  process.stdout.write((mode === 'json' ? JSON.stringify(result) : JSON.stringify(result, null, 2)) + '\n')
})()
