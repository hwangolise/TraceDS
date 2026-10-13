// F-A14 analytics dependency boundary (docs/ARCHITECTURE.md §3: "analytics ─▶
// nothing app-specific except event types"; ADR-7; M7A decision A). Static
// scan of src/analytics/** and its importers. A regression guard, in the
// style of A1 and R3. The UI side of the boundary is U1.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const analyticsDir = fileURLToPath(new URL('../../src/analytics/', import.meta.url))
const srcDir = fileURLToPath(new URL('../../src/', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : /\.(ts|tsx)$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  )
}

function importSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/\bimport\s[^'"]*?from\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\bexport\s[^'"]*?from\s*['"]([^'"]+)['"]/g),
  ].map((m) => m[1])
}

/** Allowed: other analytics modules and engine *types* (the Outcome shape). No packages, no UI, no content. */
function isAllowed(spec: string, file: string): boolean {
  if (!spec.startsWith('.')) return false
  const resolved = relative(analyticsDir, join(file, '..', spec)).replace(/\\/g, '/')
  if (resolved === '../engine/types') return true
  return !resolved.startsWith('..')
}

describe('F-A14 analytics depends on nothing app-specific', () => {
  const files = sourceFiles(analyticsDir)

  it('finds the analytics sources', () => {
    const names = files.map((f) => relative(analyticsDir, f).replace(/\\/g, '/'))
    expect(names).toEqual(expect.arrayContaining(['session.ts', 'client.ts', 'events.ts']))
  })

  it('delivery (client.ts) and storage (session.ts) are imported only by analytics modules and main.tsx', () => {
    const offenders = sourceFiles(srcDir)
      .filter((file) => !file.startsWith(analyticsDir) && relative(srcDir, file) !== 'main.tsx')
      .flatMap((file) =>
        importSpecifiers(readFileSync(file, 'utf8'))
          .filter((spec) => spec.startsWith('.'))
          .map((spec) => relative(srcDir, join(file, '..', spec)).replace(/\\/g, '/').replace(/\.(ts|tsx)$/, ''))
          .filter((target) => target === 'analytics/client' || target === 'analytics/session')
          .map((target) => `${relative(srcDir, file)} → ${target}`),
      )
    expect(offenders).toEqual([])
  })

  it.each(files.map((f) => [relative(analyticsDir, f).replace(/\\/g, '/'), f]))(
    '%s imports only analytics modules and engine types',
    (_name, file) => {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        expect(isAllowed(spec, file), `forbidden import "${spec}"`).toBe(true)
      }
    },
  )

  it('engine and viz never import analytics', () => {
    const offenders = [...sourceFiles(join(srcDir, 'engine')), ...sourceFiles(join(srcDir, 'viz'))].filter((file) =>
      importSpecifiers(readFileSync(file, 'utf8')).some((spec) => /(^|\/)analytics(\/|$)/.test(spec)),
    )
    expect(offenders.map((f) => relative(srcDir, f))).toEqual([])
  })
})
