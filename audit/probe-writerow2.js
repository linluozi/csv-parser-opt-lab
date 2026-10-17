'use strict'
// Isolated writeRow benchmark: high iteration, best-of-N, interleaved arms.
// Separates the two changes that the bundled harness bundles into one number.
const { performance } = require('perf_hooks')
const upstream = require('../upstream/index.js')
const optimized = require('../optimized/index.js')

const COLS = Number(process.env.COLS || 8)
const BATCH = Number(process.env.BATCH || 20000) // rows per timed sample
const REPS = Number(process.env.REPS || 8)       // repeats per arm per round
const ROUNDS = Number(process.env.ROUNDS || 9)
const VARIED = process.env.VARIED === '1'

function makeCells(n, cols, varied) {
  const out = new Array(n)
  for (let r = 0; r < n; r++) {
    const row = new Array(cols)
    for (let c = 0; c < cols; c++) {
      row[c] = varied ? `v${(r * 31 + c * 17) % 9973}x` : `value${c}`
    }
    out[r] = row
  }
  return out
}

const cellsBatch = makeCells(BATCH, COLS, VARIED)
const headersArr = Array.from({ length: COLS }, (_, i) => `col${i}`)

function makeParser(factory, hdr) {
  const p = factory(hdr === false ? { headers: false } : { headers: headersArr })
  p.push = function (r) { this.__last = r; return true }
  p.headers = hdr
  return p
}

function run(factory, hdr) {
  const p = makeParser(factory, hdr)
  const t0 = performance.now()
  for (let i = 0; i < BATCH; i++) p.writeRow(cellsBatch[i], 0)
  return performance.now() - t0
}

function best(factory, hdr, reps) {
  let m = Infinity
  for (let i = 0; i < reps; i++) { const v = run(factory, hdr); if (v < m) m = v }
  return m
}

function bench(hdr, label) {
  for (let i = 0; i < 3; i++) { run(upstream, hdr); run(optimized, hdr) }
  const up = [], op = [], ratios = []
  for (let i = 0; i < ROUNDS; i++) {
    let a, b
    if (i % 2 === 0) { a = best(upstream, hdr, REPS); b = best(optimized, hdr, REPS) }
    else { b = best(optimized, hdr, REPS); a = best(upstream, hdr, REPS) }
    up.push(a); op.push(b); ratios.push(a / b)
  }
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  const mn = a => Math.min(...a)
  const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) }
  console.log(JSON.stringify({
    label, cols: COLS, variedData: VARIED,
    rowsPerSample: BATCH, repsPerRound: REPS, rounds: ROUNDS,
    upBestMs: +mn(up).toFixed(2), opBestMs: +mn(op).toFixed(2),
    upMedianMs: +med(up).toFixed(2), opMedianMs: +med(op).toFixed(2),
    bestRatio: +(mn(up) / mn(op)).toFixed(4),
    ratioMedian: +med(ratios).toFixed(4),
    ratioSd: +sd(ratios).toFixed(4),
    upNsPerCell: +(mn(up) * 1e6 / (BATCH * COLS)).toFixed(1),
    opNsPerCell: +(mn(op) * 1e6 / (BATCH * COLS)).toFixed(1)
  }))
}

bench(headersArr, 'writeRow isolated / headers')
bench(false, 'writeRow isolated / headers:false')
