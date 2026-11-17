// Lists translation keys used in src/ that are missing from shared/i18n (en + ui.en).
//   node scripts/i18n-keys.mjs            -> prints missing keys, exits 1 if any
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const shared = join(root, '..', 'shared', 'i18n')
const en = { ...JSON.parse(readFileSync(join(shared, 'en.json'), 'utf8')), ui: JSON.parse(readFileSync(join(shared, 'ui.en.json'), 'utf8')) }

function has(key) {
  let node = en
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) node = node[part]
    else return false
  }
  return true
}
const hasAny = (k) => has(k) || has(`${k}_one`) || has(`${k}_other`)

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|mjs)$/.test(f) && !f.endsWith('.test.ts')) out.push(p)
  }
  return out
}

const missing = new Set()
for (const file of walk(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z_][\w.]*)'/g)) {
    if (!hasAny(m[1])) missing.add(`${m[1]}   (${file.split(/[\\/]src[\\/]/)[1]})`)
  }
}
if (missing.size) {
  console.log([...missing].sort().join('\n'))
  process.exit(1)
}
console.log('all static keys present')
