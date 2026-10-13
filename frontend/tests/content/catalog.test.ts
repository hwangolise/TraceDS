// content/catalog.ts must be a faithful transcription of docs/EXERCISES.md §0.4–0.5
// (validation rule 9 depends on it).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/content/catalog'

const exercisesMd = readFileSync(new URL('../../../docs/EXERCISES.md', import.meta.url), 'utf8')

/** Returns the backticked ids in the first column of the table under `heading`. */
function tableIds(heading: string): string[] {
  const start = exercisesMd.indexOf(heading)
  expect(start, `heading "${heading}" not found in EXERCISES.md`).toBeGreaterThanOrEqual(0)
  const section = exercisesMd.slice(start + heading.length).split(/\n### /)[0]
  return [...section.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1])
}

describe('content catalog', () => {
  it('concepts match EXERCISES.md §0.4 exactly, in order', () => {
    const fromDocs = tableIds('### 0.4 Concepts')
    expect(fromDocs.length).toBeGreaterThan(0)
    expect([...catalog.concepts]).toEqual(fromDocs)
  })

  it('misconceptions match EXERCISES.md §0.5 exactly, in order', () => {
    const fromDocs = tableIds('### 0.5 Misconception catalog')
    expect(fromDocs.length).toBeGreaterThan(0)
    expect([...catalog.misconceptions]).toEqual(fromDocs)
  })

  it('ids are unique', () => {
    expect(new Set(catalog.concepts).size).toBe(catalog.concepts.length)
    expect(new Set(catalog.misconceptions).size).toBe(catalog.misconceptions.length)
  })
})
