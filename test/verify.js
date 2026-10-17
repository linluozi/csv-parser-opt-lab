'use strict'

/*
 * Correctness harness: original upstream vs optimized.
 * Run: node test/verify.js
 *
 * Covers: basic rows, quoted commas, escaped quotes, multiline quoted fields,
 * CRLF / custom separators, split input chunks, missing final newline,
 * headers:false, header/value mapping, removed columns, byte offsets, raw
 * Buffer mode, comments, prototype-sensitive header names, plus deterministic
 * randomized parity over 350 records with UTF-8 and embedded delimiters/newlines.
 */

const assert = require('assert')
const crypto = require('crypto')
const originalFactory = require('../upstream/index.js')
const optimizedFactory = require('../optimized/index.js')

function parse (factory, input, options = {}, chunkSizes = null) {
  return new Promise((resolve, reject) => {
    const parser = factory(options)
    const rows = []
    let headers = null
    parser.on('headers', value => { headers = value })
    parser.on('data', row => rows.push(row))
    parser.once('error', reject)
    parser.once('end', () => resolve({ headers, rows }))

    const buffer = Buffer.from(input)
    if (!chunkSizes || chunkSizes.length === 0) {
      parser.end(buffer)
      return
    }
    let offset = 0
    let i = 0
    while (offset < buffer.length) {
      const size = chunkSizes[i % chunkSizes.length]
      parser.write(buffer.subarray(offset, Math.min(offset + size, buffer.length)))
      offset += size
      i++
    }
    parser.end()
  })
}

function csvCell (value) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

async function assertParity (input, options, chunkSizes) {
  const before = await parse(originalFactory, input, options, chunkSizes)
  const after = await parse(optimizedFactory, input, options, chunkSizes)
  assert.deepStrictEqual(after, before)
  return after
}

async function main () {
  // Known-value correctness checks.
  const basic = await assertParity('name,age\nAda,36\nLinus,55\n')
  assert.deepStrictEqual(basic.rows, [{ name: 'Ada', age: '36' }, { name: 'Linus', age: '55' }])

  const quoted = await assertParity('id,comment\n1,"comma, inside"\n2,"say ""hello"""\n3,"line one\nline two"\n')
  assert.deepStrictEqual(quoted.rows, [
    { id: '1', comment: 'comma, inside' },
    { id: '2', comment: 'say "hello"' },
    { id: '3', comment: 'line one\nline two' }
  ])

  await assertParity('left|right\r\none|two\r\n', { separator: '|', newline: '\r\n' }, [1, 2, 3, 5])
  await assertParity('alpha,beta\nA,B\nC,D', {}, [1, 1, 2, 7]) // no final newline
  await assertParity('a,b\n1,2\n3,4\n', { headers: false }, [3, 1, 8])
  await assertParity('name,age\nAda,36\n', { mapHeaders: ({ header }) => header.toUpperCase(), mapValues: ({ value }) => value.toLowerCase() })
  await assertParity('name,skip,city\nAda,x,London\n', { mapHeaders: ({ header }) => header === 'skip' ? null : header })
  await assertParity('id,value\n1,alpha\n2,beta\n', { outputByteOffset: true })
  await assertParity('id,value\n1,alpha\n', { raw: true })
  await assertParity('# comment\na,b\n1,2\n', { skipComments: true })

  // Row with more cells than headers (exercises the `_N` fallback key path).
  await assertParity('a,b\n1,2,3,4\n')
  await assertParity('a,b\n1,2,3,4\n', { raw: true }, [1, 3, 9])

  // Deterministic randomized parity test, including delimiters, escapes, CR/LF and UTF-8.
  let seed = 0xC0FFEE
  const rnd = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % max
  }
  const atoms = ['plain', '', 'comma,value', 'say "hi"', 'line\nbreak', 'carriage\rreturn', '東京', 'emoji🙂', '0001', '#hash']
  const records = []
  for (let row = 0; row < 350; row++) {
    const record = []
    for (let col = 0; col < 7; col++) record.push(atoms[rnd(atoms.length)] + (rnd(4) === 0 ? `-${row}-${col}` : ''))
    records.push(record)
  }
  const input = ['c0,c1,c2,c3,c4,c5,c6', ...records.map(r => r.map(csvCell).join(','))].join('\r\n') + '\r\n'
  const fuzz = await assertParity(input, {}, [1, 2, 3, 5, 13, 64, 7])
  assert.strictEqual(fuzz.rows.length, 350)

  // headers:false randomized parity too - the path the optimization actually targets.
  const nano = records.slice(0, 120).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
  await assertParity(nano, { headers: false }, [2, 7, 3, 31])
  await assertParity(nano, { headers: false, outputByteOffset: true }, [5, 1, 64])

  // Security-relevant keys are removed by the same original sanitizer.
  await assertParity('__proto__,constructor,prototype,ok\nx,y,z,yes\n')
  await assertParity('__proto__,constructor,prototype,ok\nx,y,z,yes\n', { headers: false })

  // Stable content hash makes the generated test fixture easier to audit.
  const hash = crypto.createHash('sha256').update(input).digest('hex')
  console.log(`PASS: correctness fixtures + 350-row randomized split-chunk parity; fixture_sha256=${hash}`)
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
