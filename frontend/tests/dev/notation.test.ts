// The dev-only parser for the EXERCISES.md state notation (§0.2). It feeds the
// M2 layout tests and the visualization harness, so its output is checked
// against the docs here.

import { describe, expect, it } from 'vitest'
import { validateExercise } from '../../src/engine/validate'
import type { Exercise, ProgramState } from '../../src/engine/types'
import { catalog } from '../../src/content/catalog'
import { parseExerciseStates } from '../../src/dev/notation'
import { bigNum, docState, docStates, exercisesMarkdown, makeState, node, unspecified } from '../fixtures/states'

/** Every checkpoint id in EXERCISES.md, read straight from the headings. */
function checkpointIdsInDoc(exercise: string): string[] {
  return [...exercisesMarkdown.matchAll(new RegExp(`^### (${exercise}-c\\d+) `, 'gm'))].map((m) => m[1])
}

/** Wraps a state in a minimal exercise so the M1 validator can check it is well-formed. */
function asExercise(state: ProgramState, terminology: Exercise['terminology']): Exercise {
  return {
    id: 'ZZ-01',
    moduleId: 'linked-lists',
    title: 'wrapper',
    objective: 'wrapper',
    code: ['x'],
    terminology,
    visualization: 'linked-list',
    initialState: state,
    checkpoints: [
      {
        id: 'zz01-c1',
        lines: [1],
        concept: 'traversal',
        question: 'q',
        choices: [
          { id: 'a', text: 'a' },
          { id: 'b', text: 'b', misconception: { id: 'wraps-to-head', hint: 'h' } },
        ],
        correctChoiceId: 'a',
        resultState: state,
        explanation: 'e',
      },
    ],
  }
}

describe('EXERCISES.md state notation parser', () => {
  it('finds the initial state and every checkpoint state of LL-01..LL-04', () => {
    const keys = parseExerciseStates(exercisesMarkdown).map((s) => s.key)
    for (const ex of ['ll01', 'll02', 'll03', 'll04']) {
      expect(keys).toContain(`${ex}-initial`)
      for (const id of checkpointIdsInDoc(ex)) expect(keys).toContain(id)
    }
    expect(keys).toHaveLength(4 + 26)
  })

  it('every parsed state is well-formed under the M1 validator, with the right terminology', () => {
    for (const { key, state } of parseExerciseStates(exercisesMarkdown)) {
      const terminology = key.startsWith('ll04') ? 'bignum-node' : 'generic-node'
      const result = validateExercise(asExercise(state, terminology), catalog)
      expect(result.ok ? [] : result.errors, key).toEqual([])
    }
  })

  it('parses an empty initial state', () => {
    expect(docState('ll01-initial')).toEqual(makeState({}, []))
  })

  it('parses nodes, references, and null (LL-01 c5)', () => {
    expect(docState('ll01-c5')).toEqual(
      makeState({ head: 'A', cur: 'B' }, [node('A', 4, 'B'), node('B', 7, 'C'), node('C', 1, null)]),
    )
  })

  it('carries an "(unchanged)" heap forward and parses output (LL-02 c4)', () => {
    expect(docState('ll02-c4')).toEqual(
      makeState({ head: 'A', cur: 'B' }, [node('A', 3, 'B'), node('B', 8, 'C'), node('C', 5, null)], ['3', '8']),
    )
  })

  it('drops out-of-scope variables (LL-02 c8)', () => {
    expect(docState('ll02-c8').frames[0].variables.map((v) => v.name)).toEqual(['head'])
  })

  it('parses BigNum objects, digit fields, and unspecified references (LL-04 c1)', () => {
    expect(docState('ll04-c1')).toEqual(
      makeState(
        { this: 'X', copy: 'Y' },
        [
          bigNum('X', { kind: 'ref', target: 'A' }, 3),
          bigNum('Y', unspecified, 3),
          node('A', 4, 'B', 'digit'),
          node('B', 7, 'C', 'digit'),
          node('C', 2, null, 'digit'),
        ],
        [],
        'clone()',
      ),
    )
  })

  it('copies the previous state when a checkpoint says it is unchanged (LL-04 c2)', () => {
    const states = docStates()
    expect(states.get('ll04-c2')).toEqual(states.get('ll04-c1'))
  })

  it('carries "(unchanged from …)" heaps forward while applying the new frame (LL-04 c8)', () => {
    const states = docStates()
    expect(states.get('ll04-c8')!.heap).toEqual(states.get('ll04-c7')!.heap)
    expect(states.get('ll04-c8')!.frames[0].variables.map((v) => v.name)).toEqual(['this', 'copy'])
  })
})
