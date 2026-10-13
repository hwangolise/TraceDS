// C5 named cases for LL-01 (docs/EXERCISES.md "LL-01 wrong-answer tests").
// Expected strings are typed here by hand, independently of the content file.

import { describe, expect, it } from 'vitest'
import { ll01 } from '../../src/content/ll01'
import { continueRun, startRun, submitAnswer } from '../../src/engine/engine'
import type { ExerciseRun } from '../../src/engine/types'

/** Advances through the golden path up to (not including) checkpoint `index`. */
function at(index: number): ExerciseRun {
  const golden = ['b', 'c', 'd', 'a', 'd', 'c']
  let run = startRun(ll01)
  for (let i = 0; i < index; i++) run = continueRun(ll01, submitAnswer(ll01, run, golden[i]).run)
  return run
}

describe('LL-01 named cases', () => {
  it('ll01-c3 choice a → assignment-copies-object (key aliasing misconception)', () => {
    const { run, outcome } = submitAnswer(ll01, at(2), 'a')
    expect(outcome).toMatchObject({ type: 'incorrect', checkpointId: 'll01-c3', misconceptionId: 'assignment-copies-object' })
    expect(run.feedback).toMatchObject({
      hint: 'Is there a `new` on line 3? Assigning one reference variable to another copies the reference, not the object.',
    })
  })

  it('ll01-c5 choice a → temp-changes-dont-persist', () => {
    const { outcome } = submitAnswer(ll01, at(4), 'a')
    expect(outcome).toMatchObject({ type: 'incorrect', checkpointId: 'll01-c5', misconceptionId: 'temp-changes-dont-persist' })
  })

  it('ll01-c6: a, b, then c → attempt 3, two hints, step completed', () => {
    let run = at(5)
    run = submitAnswer(ll01, run, 'a').run
    run = submitAnswer(ll01, run, 'b').run
    const { run: done, outcome } = submitAnswer(ll01, run, 'c')
    expect(outcome).toMatchObject({ type: 'correct', checkpointId: 'll01-c6', attempt: 3, exerciseCompleted: true })
    expect(done.results[5]).toEqual({ checkpointId: 'll01-c6', attempts: 3, hintsShown: ['stale-position', 'temp-changes-dont-persist'] })
  })

  it('first checkpoint text (spot check)', () => {
    const c1 = ll01.checkpoints[0]
    expect(c1.question).toBe('Line 1 runs. What does memory look like afterward?')
    expect(c1.choices[1].text).toBe('head refers to a new Node whose data is 4 and whose next is null.')
    expect(ll01.code[0]).toBe('Node head = new Node(4);')
  })
})
