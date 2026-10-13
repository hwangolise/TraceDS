// Content tests C1–C4, C6, C7 for LL-01..LL-04 (docs/TESTING.md §M3, §M4).
// Table-driven over the real content files and checked against EXERCISES.md.

import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/content/catalog'
import { exercises, getExercise } from '../../src/content'
import { ll01 } from '../../src/content/ll01'
import { ll02 } from '../../src/content/ll02'
import { ll03 } from '../../src/content/ll03'
import { ll04 } from '../../src/content/ll04'
import { continueRun, startRun, submitAnswer } from '../../src/engine/engine'
import { validateExercise } from '../../src/engine/validate'
import type { Exercise } from '../../src/engine/types'
import { docExercise } from '../fixtures/docContent'
import { docStates } from '../fixtures/states'

type Terminology = Exercise['terminology']

const CONTENT: [string, Exercise, string[], Terminology][] = [
  ['LL-01', ll01, ['b', 'c', 'd', 'a', 'd', 'c'], 'generic-node'],
  ['LL-02', ll02, ['b', 'a', 'b', 'c', 'a', 'b', 'c', 'b'], 'generic-node'],
  ['LL-03', ll03, ['c', 'a', 'b', 'd'], 'generic-node'],
  ['LL-04', ll04, ['c', 'b', 'd', 'a', 'b', 'c', 'a', 'c'], 'bignum-node'],
]

/** Identifiers allowed in each exercise's Java code (EXERCISES §0.6), plus Java keywords. */
const ALLOWED: Record<Terminology, string[]> = {
  'generic-node': ['Node', 'head', 'data', 'next', 'cur', 'prev', 'null', 'for', 'new', 'int', 'System', 'out', 'println'],
  'bignum-node': ['BigNum', 'Node', 'myHead', 'mySize', 'digit', 'next', 'copy', 'newPtr', 'origPtr', 'null', 'this',
    'public', 'clone', 'new', 'if', 'for', 'return'],
}

describe.each(CONTENT)('%s content', (exerciseId, exercise, golden, terminology) => {
  const doc = docExercise(exerciseId)
  const prefix = exerciseId.replace('-', '').toLowerCase()

  it('C1 validates', () => {
    const result = validateExercise(exercise, catalog)
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it('is registered and uses its terminology set', () => {
    expect(getExercise(exerciseId)).toBe(exercise)
    expect(exercises[exerciseId]).toBe(exercise)
    expect(exercise).toMatchObject({ id: exerciseId, moduleId: 'linked-lists', terminology, visualization: 'linked-list' })
  })

  it('matches EXERCISES.md verbatim: title, objective, code', () => {
    expect(exercise.title).toBe(doc.title)
    expect(exercise.objective).toBe(doc.objective)
    expect(exercise.code).toEqual(doc.code)
  })

  it('matches EXERCISES.md verbatim: every checkpoint, choice, hint, and explanation', () => {
    expect(exercise.checkpoints.map((c) => c.id)).toEqual(doc.checkpoints.map((c) => c.id))
    exercise.checkpoints.forEach((cp, i) => {
      const d = doc.checkpoints[i]
      expect(cp.lines, cp.id).toEqual(d.lines)
      expect(cp.focus, cp.id).toBe(d.focus)
      expect(cp.concept, cp.id).toBe(d.concept)
      expect(cp.question, cp.id).toBe(d.question)
      expect(cp.explanation, cp.id).toBe(d.explanation)
      expect(cp.correctChoiceId, cp.id).toBe(d.choices.find((c) => c.correct)!.id)
      expect(
        cp.choices.map((c) => ({ id: c.id, text: c.text, misconceptionId: c.misconception?.id, hint: c.misconception?.hint })),
        cp.id,
      ).toEqual(d.choices.map((c) => ({ id: c.id, text: c.text, misconceptionId: c.misconceptionId, hint: c.hint })))
    })
  })

  it('C3 initial and every resulting state match EXERCISES.md (independent parse)', () => {
    const states = docStates()
    expect(exercise.initialState).toEqual(states.get(`${prefix}-initial`))
    for (const cp of exercise.checkpoints) {
      expect(cp.resultState, cp.id).toEqual(states.get(cp.id))
    }
  })

  it('C2 golden path completes with every checkpoint correct on the first try', () => {
    let run = startRun(exercise)
    golden.forEach((choiceId, i) => {
      const { run: next, outcome } = submitAnswer(exercise, run, choiceId)
      expect(outcome, `step ${i + 1}`).toMatchObject({ type: 'correct', attempt: 1, exerciseCompleted: i === golden.length - 1 })
      run = continueRun(exercise, next)
    })
    expect(run.phase).toBe('complete')
    expect(run.results.every((r) => r.attempts === 1 && r.hintsShown.length === 0)).toBe(true)
    expect(run.state).toEqual(exercise.checkpoints[exercise.checkpoints.length - 1].resultState)
  })

  it('C4 every incorrect choice: no advance, its own hint, then the correct answer advances on attempt 2', () => {
    let run = startRun(exercise)
    exercise.checkpoints.forEach((cp, i) => {
      for (const choice of cp.choices.filter((c) => c.id !== cp.correctChoiceId)) {
        const { run: after, outcome } = submitAnswer(exercise, run, choice.id)
        expect(after.stepIndex, `${cp.id}/${choice.id}`).toBe(i)
        expect(after.state, `${cp.id}/${choice.id}`).toEqual(run.state)
        expect(after.phase).toBe('question')
        expect(outcome).toMatchObject({ type: 'incorrect', misconceptionId: choice.misconception!.id })
        expect(after.feedback).toEqual({ kind: 'incorrect', choiceId: choice.id, misconceptionId: choice.misconception!.id, hint: choice.misconception!.hint })
        const { run: retried, outcome: correct } = submitAnswer(exercise, after, cp.correctChoiceId)
        expect(correct, `${cp.id}/${choice.id}`).toMatchObject({ type: 'correct', attempt: 2 })
        expect(retried.stepIndex).toBe(i + 1)
      }
      run = continueRun(exercise, submitAnswer(exercise, run, cp.correctChoiceId).run)
    })
    expect(run.phase).toBe('complete')
  })

  it('C6 terminology lint', () => {
    const strings = [
      exercise.title,
      exercise.objective,
      ...exercise.code,
      ...exercise.checkpoints.flatMap((c) => [
        c.question,
        c.explanation,
        c.focus ?? '',
        ...c.choices.flatMap((ch) => [ch.text, ch.misconception?.hint ?? '']),
      ]),
    ]
    // Guard against a vacuous pass over empty content.
    expect(exercise.code.length).toBeGreaterThan(0)
    expect(exercise.checkpoints.length).toBeGreaterThan(0)
    // (a) forbidden spellings anywhere
    for (const s of strings) expect(s).not.toMatch(/ListNode|getNext|setNext|\.val\b|\.value\b/)
    // (b) code identifiers come only from the exercise's terminology set
    const allowed = new Set(ALLOWED[terminology])
    const identifiers = exercise.code.join('\n').replace(/\/\/.*$/gm, '').match(/[A-Za-z_]\w*/g) ?? []
    expect([...new Set(identifiers)].filter((id) => !allowed.has(id))).toEqual([])
    // (c) the two terminology sets are never mixed
    for (const s of strings) {
      if (terminology === 'generic-node') expect(s).not.toMatch(/\b(digit|myHead|mySize|BigNum)\b/)
      else expect(s).not.toMatch(/\.data\b|\bdata field\b|`data`/)
    }
  })
})

describe('C7 step-id permanence', () => {
  it('[exerciseId, stepId, correctChoiceId] tuples are unchanged', () => {
    const tuples = [ll01, ll02, ll03, ll04].flatMap((ex) => ex.checkpoints.map((c) => [ex.id, c.id, c.correctChoiceId]))
    expect(tuples).toEqual([
      ['LL-01', 'll01-c1', 'b'],
      ['LL-01', 'll01-c2', 'c'],
      ['LL-01', 'll01-c3', 'd'],
      ['LL-01', 'll01-c4', 'a'],
      ['LL-01', 'll01-c5', 'd'],
      ['LL-01', 'll01-c6', 'c'],
      ['LL-02', 'll02-c1', 'b'],
      ['LL-02', 'll02-c2', 'a'],
      ['LL-02', 'll02-c3', 'b'],
      ['LL-02', 'll02-c4', 'c'],
      ['LL-02', 'll02-c5', 'a'],
      ['LL-02', 'll02-c6', 'b'],
      ['LL-02', 'll02-c7', 'c'],
      ['LL-02', 'll02-c8', 'b'],
      ['LL-03', 'll03-c1', 'c'],
      ['LL-03', 'll03-c2', 'a'],
      ['LL-03', 'll03-c3', 'b'],
      ['LL-03', 'll03-c4', 'd'],
      ['LL-04', 'll04-c1', 'c'],
      ['LL-04', 'll04-c2', 'b'],
      ['LL-04', 'll04-c3', 'd'],
      ['LL-04', 'll04-c4', 'a'],
      ['LL-04', 'll04-c5', 'b'],
      ['LL-04', 'll04-c6', 'c'],
      ['LL-04', 'll04-c7', 'a'],
      ['LL-04', 'll04-c8', 'c'],
    ])
  })
})
