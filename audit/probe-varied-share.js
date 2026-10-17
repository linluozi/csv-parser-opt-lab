'use strict'
// writeRow cost share, measured under both input distributions.
const { performance } = require('perf_hooks')
const upstream = require('../upstream/index.js')
const ROWS = Number(process.env.ROWS || 180000), COLS = 8, ROUNDS = 5
const headers = Array.from({length:COLS},(_,i)=>`col${i}`).join(',')
function build(varied) {
  const lines = []
  for (let r = 0; r < ROWS; r++) {
    const cells = []
    for (let c = 0; c < COLS; c++) cells.push(varied ? `v${(r*31+c*17)%9973}` : `value${c}`)
    lines.push(cells.join(','))
  }
  return Buffer.from(headers + '\n' + lines.join('\n') + '\n')
}
function once(input, noop) {
  return new Promise((res, rej) => {
    const p = upstream({}); let n = 0
    if (noop) p.writeRow = function (cells, off) { this.push(cells.length) }
    p.on('data', () => n++); p.once('error', rej)
    p.once('end', () => res(n)); p.end(Buffer.from(input))
  })
}
async function timed(input, noop) { const t = performance.now(); const n = await once(input, noop); if (n !== ROWS) throw new Error('rc'); return performance.now() - t }
const med = a => { const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)] }
async function bench(varied) {
  const input = build(varied)
  for (let i=0;i<2;i++){ await once(input,false); await once(input,true) }
  const full=[],noop=[]
  for (let i=0;i<ROUNDS;i++){
    if(i%2===0){full.push(await timed(input,false));noop.push(await timed(input,true))}
    else{noop.push(await timed(input,true));full.push(await timed(input,false))}
  }
  const f=med(full), n0=med(noop)
  console.log(JSON.stringify({varied, fullMs:+f.toFixed(1), noWriteRowMs:+n0.toFixed(1), writeRowMs:+(f-n0).toFixed(1), writeRowSharePct:+((f-n0)/f*100).toFixed(1)}))
}
;(async()=>{ await bench(false); await bench(true) })()
