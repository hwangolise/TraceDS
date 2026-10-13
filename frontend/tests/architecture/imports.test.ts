// A1 engine purity (docs/TESTING.md §M1, docs/ARCHITECTURE.md §3 and §4.3).
// Static scan of src/engine/**: no React, viz, analytics, content, or packages,
// and no clock, randomness, network, storage, or DOM access.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const engineDir = fileURLToPath(new URL('../../src/engine/', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : /\.(ts|tsx)$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  )
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function importSpecifiers(source: string): string[] {
  const specs = [
    ...source.matchAll(/\bimport\s[^'"]*?from\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\bexport\s[^'"]*?from\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]
  return specs.map((m) => m[1])
}

const FORBIDDEN_GLOBALS: [RegExp, string][] = [
  [/\bDate\b/, 'Date'],
  [/\bMath\.random\b/, 'Math.random'],
  [/\bcrypto\b/, 'crypto'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bnavigator\b/, 'navigator'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/\bwindow\b/, 'window'],
  [/\bdocument\b/, 'document'],
  [/\bsetTimeout\b|\bsetInterval\b/, 'timers'],
  [/\bperformance\b/, 'performance'],
  [/\basync\b|\bawait\b|\bPromise\b/, 'asynchrony'],
]

describe('A1 engine purity', () => {
  const files = sourceFiles(engineDir)

  it('finds the engine sources', () => {
    const names = files.map((f) => f.slice(engineDir.length)).sort()
    expect(names).toEqual(expect.arrayContaining(['engine.ts', 'types.ts', 'validate.ts']))
  })

  it.each(files.map((f) => [f.slice(engineDir.length), f]))(
    '%s imports only sibling engine modules',
    (_name, file) => {
      const specs = importSpecifiers(readFileSync(file, 'utf8'))
      for (const spec of specs) {
        expect(spec, `forbidden import "${spec}"`).toMatch(/^\.\/[\w./-]+$/)
      }
    },
  )

  it.each(files.map((f) => [f.slice(engineDir.length), f]))(
    '%s uses no clock, randomness, network, storage, DOM, or async APIs',
    (_name, file) => {
      const code = stripComments(readFileSync(file, 'utf8'))
      for (const [pattern, label] of FORBIDDEN_GLOBALS) {
        expect(pattern.test(code), `engine must not use ${label}`).toBe(false)
      }
    },
  )
})
