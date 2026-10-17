'use strict'
// Edge-case differential test: original vs optimized, field-by-field.
// Targets the cases the bundled suite does not cover.
const upstream = require('../upstream/index.js')
const optimized = require('../optimized/index.js')

function parse(factory, input, options = {}, chunks = null) {
  return new Promise((resolve, reject) => {
    const p = factory(options)
    const rows = []
    let headers = null
    let err = null
    p.on('headers', h => { headers = h })
    p.on('data', r => rows.push(r))
    p.on('error', e => { err = e.message })
    p.once('end', () => resolve({ headers, rows, err }))
    const buf = Buffer.from(input)
    if (!chunks) { p.end(buf); return }
    let off = 0, i = 0
    while (off < buf.length) {
      const n = chunks[i % chunks.length]
      p.write(buf.subarray(off, Math.min(off + n, buf.length)))
      off += n; i++
    }
    p.end()
  })
}

const cases = [
  ['row has more cells than headers (_N fallback)', 'a,b\n1,2,3,4\n'],
  ['row longer than headers + headers:false', '1,2,3\n', { headers: false }],
  ['external headers array shorter than data', '1,2,3\n', { headers: ['x', 'y'] }],
  ['external headers array longer than data', '1,2\n', { headers: ['x', 'y', 'z'] }],
  ['external headers array + empty cells', '1,,3\n', { headers: ['x', 'y', 'z'] }],
  ['header row only, no data', 'a,b,c\n'],
  ['empty input', ''],
  ['newline only', '\n'],
  ['trailing comma', 'a,b\n1,2,\n'],
  ['consecutive blank lines', 'a,b\n1,2\n\n\n3,4\n'],
  ['leading BOM', '\uFEFFa,b\n1,2\n'],
  ['duplicate header names', 'a,a\n1,2\n'],
  ['empty header name', 'a,,c\n1,2,3\n'],
  ['header mapped to number', 'a,b\n1,2\n', { mapHeaders: ({ index }) => index }],
  ['mapValues returns an object', 'a,b\n1,2\n', { mapValues: ({ value }) => ({ v: value }) }],
  ['skipLines:1', 'junk\na,b\n1,2\n', { skipLines: 1 }],
  ['skipLines skips everything', 'junk\n', { skipLines: 5 }],
  ['raw mode + headers:false', 'a,b\n1,2\n', { raw: true, headers: false }],
  ['outputByteOffset + headers:false', 'a,b\n1,2\n', { outputByteOffset: true, headers: false }],
  ['strict mode, mismatched column count', 'a,b\n1,2,3\n', { strict: true }],
  ['single column, no separator', 'a\n1\n2\n'],
  ['single column headers:false', '1\n2\n', { headers: false }],
  ['embedded newline in quotes + headers:false', '1,"x\ny"\n', { headers: false }],
  ['CRLF + headers:false', '1,2\r\n3,4\r\n', { headers: false }],
  ['tab separator', 'a\tb\n1\t2\n', { separator: '\t' }],
  ['headers:false with mapHeaders passed', '1,2\n', { headers: false, mapHeaders: h => h.header }]
]

;(async () => {
  let same = 0, diff = 0
  for (const [name, input, opts, chunks] of cases) {
    const a = await parse(upstream, input, opts || {}, chunks)
    const b = await parse(optimized, input, opts || {}, chunks)
    const ja = JSON.stringify(a), jb = JSON.stringify(b)
    if (ja === jb) { same++; console.log(`SAME  ${name}`) }
    else {
      diff++
      console.log(`DIFF  ${name}`)
      console.log(`      baseline : ${ja.slice(0, 300)}`)
      console.log(`      optimized: ${jb.slice(0, 300)}`)
    }
  }
  console.log(`\n${same} same / ${diff} differ  (total ${cases.length})`)
})()
