// Builders for hand-written ProgramStates, and loaders for the states written
// in docs/EXERCISES.md, used by the M2 visualization tests.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HeapObject, ProgramState, Value, Variable } from '../../src/engine/types'
import { parseExerciseStates } from '../../src/dev/notation'

// Resolved via a path rather than a URL object: under jsdom the global URL is
// jsdom's, which node:fs does not accept.
export const exercisesMarkdown = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/EXERCISES.md'),
  'utf8',
)

/** Every state written in EXERCISES.md LL-01..LL-04, keyed "ll01-initial", "ll03-c3", … */
export function docStates(): Map<string, ProgramState> {
  return new Map(parseExerciseStates(exercisesMarkdown).map((s) => [s.key, s.state]))
}

export function docState(key: string): ProgramState {
  const state = docStates().get(key)
  if (!state) throw new Error(`no state "${key}" in EXERCISES.md`)
  return state
}

export const ref = (target: string | null): Value => ({ kind: 'ref', target })
export const int = (value: number): Value => ({ kind: 'int', value })
export const unspecified: Value = { kind: 'unspecified' }

export function node(id: string, value: number, next: string | null, field: 'data' | 'digit' = 'data'): HeapObject {
  return {
    id,
    type: 'Node',
    fields: [
      { name: field, value: int(value) },
      { name: 'next', value: ref(next) },
    ],
  }
}

export function bigNum(id: string, myHead: Value, mySize: number): HeapObject {
  return {
    id,
    type: 'BigNum',
    fields: [
      { name: 'myHead', value: myHead },
      { name: 'mySize', value: int(mySize) },
    ],
  }
}

/** A single-frame state. `vars` maps names to object ids, null, or a full Value. */
export function makeState(
  vars: Record<string, string | null | Value>,
  heap: HeapObject[],
  output: string[] = [],
  method = 'main',
): ProgramState {
  const variables: Variable[] = Object.entries(vars).map(([name, v]) => ({
    name,
    value: v === null || typeof v === 'string' ? ref(v) : v,
  }))
  return { frames: [{ method, variables }], heap, output }
}

/** Recursively freezes a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}
