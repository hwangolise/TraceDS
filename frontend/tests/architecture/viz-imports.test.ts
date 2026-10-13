// R3 no business logic in the visualization (docs/TESTING.md §M2,
// docs/ARCHITECTURE.md §3 and §5.3). Static scan of src/viz/**.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const vizDir = fileURLToPath(new URL('../../src/viz/', import.meta.url))

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

/** Allowed: React, React Flow (and its stylesheet), other viz modules, and engine *types* only. */
function isAllowed(spec: string, file: string): boolean {
  if (spec === 'react' || spec === 'react/jsx-runtime') return true
  if (spec === '@xyflow/react' || spec === '@xyflow/react/dist/style.css') return true
  if (!spec.startsWith('.')) return false
  const resolved = relative(vizDir, join(file, '..', spec)).replace(/\\/g, '/')
  if (resolved === '../engine/types') return true
  return !resolved.startsWith('..')
}

describe('R3 visualization contains no exercise or business logic', () => {
  const files = sourceFiles(vizDir)

  it('finds the visualization sources', () => {
    const names = files.map((f) => relative(vizDir, f).replace(/\\/g, '/'))
    expect(names).toEqual(
      expect.arrayContaining(['layout.ts', 'diff.ts', 'describe.ts', 'reachability.ts', 'types.ts', 'linkedlist/LinkedListView.tsx', 'linkedlist/toFlow.ts']),
    )
  })

  it.each(files.map((f) => [relative(vizDir, f).replace(/\\/g, '/'), f]))(
    '%s imports only React, React Flow, viz modules, and engine types',
    (_name, file) => {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        expect(isAllowed(spec, file), `forbidden import "${spec}"`).toBe(true)
      }
    },
  )

  it.each(files.map((f) => [relative(vizDir, f).replace(/\\/g, '/'), f]))(
    '%s never references checkpoints, choices, correctness, exercises, or analytics',
    (_name, file) => {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      expect(code).not.toMatch(/\b(checkpoints?|correctChoiceId|choices?|misconception|Exercise|ExerciseRun|submitAnswer|analytics|fetch|localStorage)\b/)
    },
  )
})
