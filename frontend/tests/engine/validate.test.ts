// M1 validation tests V1–V16 (docs/TESTING.md §M1, docs/ARCHITECTURE.md §4.4).

import { describe, expect, it } from 'vitest'
import { validateExercise } from '../../src/engine/validate'
import type { Catalog, Exercise, HeapObject } from '../../src/engine/types'
import { makeMiniExercise } from '../fixtures/miniExercise'

const catalog: Catalog = {
  concepts: ['deep-copy', 'null-references', 'linking-nodes'],
  misconceptions: [
    'shallow-head',
    'new-copies-list',
    'implicit-this-field',
    'field-confusion',
    'links-bidirectional',
    'field-assign-moves-variable',
  ],
}

/** Validates a modified copy of the mini fixture and returns its joined error text. */
function errorsAfter(mutate: (ex: Exercise) => void): string {
  const ex = makeMiniExercise()
  mutate(ex)
  const result = validateExercise(ex, catalog)
  if (result.ok) throw new Error('expected validation to fail, but it passed')
  expect(result.errors.length).toBeGreaterThan(0)
  return result.errors.join('\n')
}

/** Validates arbitrary (possibly ill-typed) input and returns its joined error text. */
function errorsFor(input: unknown): string {
  const result = validateExercise(input, catalog)
  if (result.ok) throw new Error('expected validation to fail, but it passed')
  return result.errors.join('\n')
}

function node(id: string, field: 'data' | 'digit', value: number, next: string | null): HeapObject {
  return {
    id,
    type: 'Node',
    fields: [
      { name: field, value: { kind: 'int', value } },
      { name: 'next', value: { kind: 'ref', target: next } },
    ],
  }
}

/** Converts the mini fixture to the generic terminology set (data fields, no BigNum). */
function toGeneric(ex: Exercise): void {
  ex.terminology = 'generic-node'
  for (const state of [ex.initialState, ...ex.checkpoints.map((c) => c.resultState)]) {
    state.heap = state.heap
      .filter((o) => o.type === 'Node')
      .map((o) => ({ ...o, fields: o.fields.map((f) => (f.name === 'digit' ? { ...f, name: 'data' } : f)) }))
    state.frames[0].variables = []
  }
}

describe('validateExercise — valid input', () => {
  it('V16 accepts the valid fixture, including an unspecified field value', () => {
    const ex = makeMiniExercise()
    expect(ex.initialState.heap[0].fields[0].value).toEqual({ kind: 'unspecified' })
    const result = validateExercise(ex, catalog)
    expect(result).toEqual({ ok: true, exercise: ex })
  })

  it('V16 accepts a generic-node exercise that uses data fields', () => {
    const ex = makeMiniExercise()
    toGeneric(ex)
    expect(validateExercise(ex, catalog).ok).toBe(true)
  })
})

describe('validateExercise — malformed exercises are rejected', () => {
  it('V1 missing or malformed exercise id', () => {
    expect(errorsAfter((ex) => ((ex as { id?: string }).id = ''))).toMatch(/id must be a non-empty string/)
    expect(errorsAfter((ex) => delete (ex as { id?: string }).id)).toMatch(/id must be a non-empty string/)
    expect(errorsAfter((ex) => (ex.id = 'LL1'))).toMatch(/exercise id "LL1" must look like "LL-01"/)
  })

  it('V1 (rule 1) missing moduleId, title, objective, or code', () => {
    expect(errorsAfter((ex) => (ex.moduleId = ''))).toMatch(/moduleId must be a non-empty string/)
    expect(errorsAfter((ex) => (ex.title = ''))).toMatch(/title must be a non-empty string/)
    expect(errorsAfter((ex) => (ex.objective = ' '))).toMatch(/objective must be a non-empty string/)
    expect(errorsAfter((ex) => (ex.code = []))).toMatch(/code must contain at least one line/)
    expect(errorsAfter((ex) => ((ex as { terminology: string }).terminology = 'node'))).toMatch(
      /terminology must be "generic-node" or "bignum-node"/,
    )
    expect(errorsAfter((ex) => ((ex as { visualization: string }).visualization = 'graph'))).toMatch(
      /visualization must be "linked-list" or "recursion"/,
    )
  })

  it('V2 zero checkpoints', () => {
    expect(errorsAfter((ex) => (ex.checkpoints = []))).toMatch(/checkpoints must contain at least one checkpoint/)
  })

  it('V3 duplicate checkpoint id', () => {
    expect(errorsAfter((ex) => (ex.checkpoints[1].id = 'mn01-c1'))).toMatch(/duplicate checkpoint id "mn01-c1"/)
  })

  it('V4 bad checkpoint id format', () => {
    expect(errorsAfter((ex) => (ex.checkpoints[0].id = 'MN01-1'))).toMatch(/checkpoint id "MN01-1" must match/)
    expect(errorsAfter((ex) => (ex.checkpoints[0].id = 'll01-c1'))).toMatch(
      /checkpoint id "ll01-c1" must start with "mn01-"/,
    )
  })

  it('V5 fewer than 2 or more than 4 choices', () => {
    expect(errorsAfter((ex) => ex.checkpoints[1].choices.pop())).toMatch(/mn01-c2: must have 2–4 choices/)
    expect(
      errorsAfter((ex) =>
        ex.checkpoints[2].choices.push({
          id: 'e',
          text: 'Fifth choice.',
          misconception: { id: 'field-confusion', hint: 'Hint.' },
        }),
      ),
    ).toMatch(/mn01-c3: must have 2–4 choices/)
  })

  it('V6 duplicate choice id, or ids not a, b, c, d in display order', () => {
    expect(errorsAfter((ex) => (ex.checkpoints[0].choices[2].id = 'a'))).toMatch(/mn01-c1: duplicate choice id "a"/)
    expect(errorsAfter((ex) => ex.checkpoints[0].choices.reverse())).toMatch(
      /mn01-c1: choice ids must be "a", "b", … in display order/,
    )
  })

  it('V6 (rule 6) empty question, explanation, or choice text', () => {
    expect(errorsAfter((ex) => (ex.checkpoints[0].question = ''))).toMatch(/mn01-c1: question must be a non-empty string/)
    expect(errorsAfter((ex) => (ex.checkpoints[0].explanation = ''))).toMatch(
      /mn01-c1: explanation must be a non-empty string/,
    )
    expect(errorsAfter((ex) => (ex.checkpoints[0].choices[1].text = ''))).toMatch(
      /mn01-c1: choice "b" text must be a non-empty string/,
    )
  })

  it('V7 correctChoiceId not among the choices', () => {
    expect(errorsAfter((ex) => (ex.checkpoints[0].correctChoiceId = 'z'))).toMatch(
      /mn01-c1: correctChoiceId "z" is not one of its choices/,
    )
  })

  it('V8 the correct choice has a misconception', () => {
    expect(
      errorsAfter((ex) => (ex.checkpoints[0].choices[1].misconception = { id: 'shallow-head', hint: 'Hint.' })),
    ).toMatch(/mn01-c1: correct choice "b" must not have a misconception/)
  })

  it('V9 an incorrect choice is missing its misconception or hint', () => {
    expect(errorsAfter((ex) => delete ex.checkpoints[0].choices[0].misconception)).toMatch(
      /mn01-c1: incorrect choice "a" must have a misconception with a non-empty id and hint/,
    )
    expect(errorsAfter((ex) => (ex.checkpoints[0].choices[0].misconception!.hint = ''))).toMatch(
      /mn01-c1: incorrect choice "a" must have a misconception with a non-empty id and hint/,
    )
  })

  it('V10 highlighted line out of range, or no lines', () => {
    expect(errorsAfter((ex) => (ex.checkpoints[0].lines = [99]))).toMatch(/mn01-c1: line 99 is outside 1\.\.5/)
    expect(errorsAfter((ex) => (ex.checkpoints[0].lines = [0]))).toMatch(/mn01-c1: line 0 is outside 1\.\.5/)
    expect(errorsAfter((ex) => (ex.checkpoints[0].lines = []))).toMatch(/mn01-c1: lines must not be empty/)
  })

  it('V11 a reference to a missing heap object', () => {
    expect(
      errorsAfter((ex) => (ex.checkpoints[0].resultState.heap[1].fields[1].value = { kind: 'ref', target: 'Q' })),
    ).toMatch(/mn01-c1 resultState: Node "D" field "next" refers to missing object "Q"/)
    expect(
      errorsAfter((ex) => (ex.initialState.frames[0].variables[0].value = { kind: 'ref', target: 'Q' })),
    ).toMatch(/initialState: variable "copy" refers to missing object "Q"/)
  })

  it('V11 (rule 7) frames: at least one frame, unique variable names', () => {
    expect(errorsAfter((ex) => (ex.initialState.frames = []))).toMatch(
      /initialState: frames must contain at least one frame/,
    )
    expect(
      errorsAfter((ex) =>
        ex.initialState.frames[0].variables.push({ name: 'copy', value: { kind: 'ref', target: null } }),
      ),
    ).toMatch(/initialState: duplicate variable "copy" in frame "main"/)
  })

  it('V12 duplicate heap object id', () => {
    expect(errorsAfter((ex) => ex.checkpoints[0].resultState.heap.push(node('D', 'digit', 9, null)))).toMatch(
      /mn01-c1 resultState: duplicate object id "D"/,
    )
  })

  it('V13 malformed Node or BigNum fields', () => {
    expect(errorsAfter((ex) => ex.checkpoints[0].resultState.heap[1].fields.pop())).toMatch(
      /mn01-c1 resultState: Node "D" must have exactly two fields/,
    )
    expect(
      errorsAfter((ex) => (ex.checkpoints[0].resultState.heap[1].fields[1] = { name: 'link', value: { kind: 'ref', target: null } })),
    ).toMatch(/mn01-c1 resultState: Node "D" second field must be a "next" reference/)
    expect(
      errorsAfter((ex) => (ex.checkpoints[0].resultState.heap[1].fields[0].value = { kind: 'ref', target: null })),
    ).toMatch(/mn01-c1 resultState: Node "D" first field must be an int/)
    expect(
      errorsAfter((ex) => (ex.initialState.heap[0].fields[1] = { name: 'size', value: { kind: 'int', value: 2 } })),
    ).toMatch(/initialState: BigNum "Y" must have fields myHead \(reference\) and mySize \(int\)/)
    expect(
      errorsAfter((ex) => ((ex.initialState.heap[0] as { type: string }).type = 'Tree')),
    ).toMatch(/initialState: object "Y" has unknown type "Tree"/)
  })

  it('V14 mixed terminology sets are rejected', () => {
    // generic-node exercise with a digit field
    expect(
      errorsAfter((ex) => {
        toGeneric(ex)
        ex.checkpoints[2].resultState.heap[1].fields[0].name = 'digit'
      }),
    ).toMatch(/mn01-c3 resultState: generic-node exercise: Node "E" must use field "data", not "digit"/)
    // generic-node exercise containing a BigNum object
    expect(errorsAfter((ex) => (ex.terminology = 'generic-node'))).toMatch(
      /initialState: generic-node exercise must not contain BigNum objects/,
    )
    // bignum-node exercise with a data field
    expect(errorsAfter((ex) => (ex.checkpoints[0].resultState.heap[1].fields[0].name = 'data'))).toMatch(
      /mn01-c1 resultState: bignum-node exercise: Node "D" must use field "digit", not "data"/,
    )
  })

  it('V15 unknown concept or misconception id', () => {
    expect(errorsAfter((ex) => (ex.checkpoints[0].concept = 'nope'))).toMatch(/mn01-c1: unknown concept id "nope"/)
    expect(errorsAfter((ex) => (ex.checkpoints[0].choices[0].misconception!.id = 'nope'))).toMatch(
      /mn01-c1: unknown misconception id "nope"/,
    )
  })

  it('reports every problem, not just the first', () => {
    const errors = errorsAfter((ex) => {
      ex.title = ''
      ex.checkpoints[0].correctChoiceId = 'z'
      ex.checkpoints[2].lines = [42]
    })
    expect(errors).toMatch(/title must be a non-empty string/)
    expect(errors).toMatch(/correctChoiceId "z"/)
    expect(errors).toMatch(/line 42 is outside/)
  })

  it('never throws on arbitrary input', () => {
    expect(errorsFor(null)).toMatch(/exercise must be an object/)
    expect(errorsFor('LL-01')).toMatch(/exercise must be an object/)
    expect(errorsFor([])).toMatch(/exercise must be an object/)
    expect(errorsFor({})).toMatch(/id must be a non-empty string/)
    expect(errorsFor({ ...makeMiniExercise(), checkpoints: 'oops' })).toMatch(/checkpoints must be an array/)
    expect(errorsFor({ ...makeMiniExercise(), initialState: null })).toMatch(/initialState must be an object/)
    expect(errorsFor({ ...makeMiniExercise(), checkpoints: [null, 7] })).toMatch(/checkpoint 1 must be an object/)
    const broken = makeMiniExercise() as unknown as { checkpoints: { choices: unknown; resultState: unknown }[] }
    broken.checkpoints[0].choices = [null, { id: 3 }]
    broken.checkpoints[1].resultState = { frames: [{ method: 'main', variables: [{ name: 'x', value: { kind: 'float' } }] }], heap: 'x', output: [1] }
    expect(() => validateExercise(broken, catalog)).not.toThrow()
    const text = errorsFor(broken)
    expect(text).toMatch(/variable "x" has an invalid value/)
    expect(text).toMatch(/heap must be an array/)
    expect(text).toMatch(/output must be an array of strings/)
  })
})
