// X9 (docs/TESTING.md §M9): the main JS bundle must stay ≤ 250 KB gzip.
// Run after `npm run build`.
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET = 250 * 1024
const dir = new URL('../dist/assets/', import.meta.url)
const js = readdirSync(dir).filter((f) => f.endsWith('.js'))
if (js.length === 0) throw new Error('no JS bundle in dist/assets; run `npm run build` first')
let failed = false
for (const f of js) {
  const size = gzipSync(readFileSync(new URL(f, dir))).length
  console.log(`${f}: ${(size / 1024).toFixed(1)} KB gzip (budget ${BUDGET / 1024} KB)`)
  if (size > BUDGET) failed = true
}
process.exit(failed ? 1 : 0)
