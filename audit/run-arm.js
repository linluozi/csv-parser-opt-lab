'use strict'
// Single-arm timing process, spawned by benchmark.js (one process = one sample).
// argv[2]=arm file, argv[3]=mode(normal|noheaders)
// HOLLOW_WRITEROW=1 empties writeRow (keeps push shape) to measure its cost share.

const { performance } = require('perf_hooks')
const path = require('path')

const armFile = process.argv[2]
const mode = process.argv[3] || 'normal'
const factory = require(path.resolve(armFile))

const ROWS = Number(process.env.ROWS || 180000)
const COLS = Number(process.env.COLS || 8)
const WARMUP = Number(process.env.WARMUP || 2)
const MEASURE = Number(process.env.MEASURE || 5)
const DATA = process.env.DATA || 'varied'
const HOLLOW = process.env.HOLLOW_WRITEROW === '1'

const headers = Array.from({ length: COLS }, (_, i) => `col${i}`).join(',')
const noHeaders = mode === 'noheaders'

function buildInput () {
  const lines = new Array(ROWS)
  for (let r = 0; r < ROWS; r++) {
    const cells = new Array(COLS)
    for (let c = 0; c < COLS; c++) cells[c] = DATA === 'varied' ? `v${(r * 31 + c * 17) % 9973}` : `value${c}`
    lines[r] = cells.join(',')
  }
  return Buffer.from((noHeaders ? '' : headers + '\n') + lines.join('\n') + '\n')
}

const input = buildInput()
const options = noHeaders ? { headers: false } : {}

function once () {
  return new Promise((resolve, reject) => {
    const p = factory(options)
    if (HOLLOW) {
      p.writeRow = function (cells, byteOffset) {
        if (this.options.outputByteOffset) this.push({ row: cells.length, byteOffset })
        else this.push(cells.length)
      }
    }
    let n = 0
    p.on('data', () => { n++ })
    p.once('error', reject)
    p.once('end', () => resolve(n))
    p.end(Buffer.from(input))
  })
}

;(async () => {
  for (let i = 0; i < WARMUP; i++) await once()
  const times = []
  for (let i = 0; i < MEASURE; i++) {
    const t0 = performance.now()
    const n = await once()
    if (n !== ROWS) throw new Error('rowcount ' + n)
    times.push(performance.now() - t0)
  }
  const sorted = [...times].sort((a, b) => a - b)
  process.stdout.write(JSON.stringify({
    arm: path.basename(armFile), mode,
    best: +sorted[0].toFixed(2),
    median: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
    all: times.map(v => +v.toFixed(2)),
    hollowed: HOLLOW
  }))
})().catch(e => { console.error(e); process.exit(1) })
