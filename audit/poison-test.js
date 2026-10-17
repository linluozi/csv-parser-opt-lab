'use strict'
// Poison test: inject 4 realistic bugs into the optimized build; can the suite catch them?
// A miss means the test is blind to that class of defect.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const pkg = path.join(__dirname, '..')
const optSrc = fs.readFileSync(path.join(pkg, 'optimized', 'index.js'), 'utf8')
const tmpDir = path.join(__dirname, 'poison')
fs.mkdirSync(path.join(tmpDir, 'upstream'), { recursive: true })
fs.mkdirSync(path.join(tmpDir, 'optimized'), { recursive: true })
fs.copyFileSync(path.join(pkg, 'upstream', 'index.js'), path.join(tmpDir, 'upstream', 'index.js'))

// verify.js requires ../upstream and ../optimized, so mirror the layout under poison/
const verifySrc = fs.readFileSync(path.join(pkg, 'test', 'verify.js'), 'utf8')
fs.writeFileSync(path.join(tmpDir, 'verify.js'), verifySrc)

const poisons = [
  {
    name: 'P1: headers:false keys degrade to _N instead of numeric index (fallback misused)',
    from: 'const header = headers === null ? index : headers[index]',
    to: 'const header = headers === null ? undefined : headers[index]'
  },
  {
    name: 'P2: drop the header===null column-skip (mapHeaders null columns no longer removed)',
    from: 'if (header === null) continue // skip columns',
    to: 'if (header === null) { row[`_${index}`] = cells[index]; continue }'
  },
  {
    name: 'P3: drop the header===undefined _N fallback (extra columns silently dropped)',
    from: '} else {\n        row[`_${index}`] = cells[index]\n      }',
    to: '}'
  },
  {
    name: 'P4: break the outputByteOffset branch (byteOffset replaced with constant)',
    from: 'this.push({ row, byteOffset })',
    to: 'this.push({ row, byteOffset: 0 })'
  }
]

let caught = 0
for (const p of poisons) {
  if (!optSrc.includes(p.from)) {
    console.log(`SKIP  ${p.name}  (anchor not found)`)
    continue
  }
  const mutated = optSrc.replace(p.from, p.to)
  fs.writeFileSync(path.join(tmpDir, 'optimized', 'index.js'), mutated)
  let pass = false
  try {
    execFileSync(process.execPath, [path.join(tmpDir, 'verify.js')], { stdio: 'pipe', encoding: 'utf8' })
    pass = true
  } catch (e) { pass = false }
  if (pass) console.log(`MISS  ${p.name}  <-- test did NOT catch it`)
  else { caught++; console.log(`CAUGHT ${p.name}`) }
}
console.log(`\n${caught}/${poisons.length} injected bugs caught`)
