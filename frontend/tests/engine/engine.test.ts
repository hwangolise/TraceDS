// M1 engine tests E1–E18 (docs/TESTING.md §M1, docs/ARCHITECTURE.md §4.3).

import { describe, expect, it } from 'vitest'
import { continueRun, restartRun, startRun, submitAnswer } from '../../src/engine/engine'
import type { Exercise, ExerciseRun, Outcome } from '../../src/engine/types'
import { GOLDEN_PATH, makeMiniExercise } from '../fixtures/miniExercise'

/** Recursively freezes a value so any mutation by the engine throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

function frozenExercise(): Exercise {
  return deepFreeze(makeMiniExercise())
}

/** Submits a sequence of inputs: a choice id submits, 'continue' calls continueRun. */
function play(ex: Exercise, inputs: string[]): { run: ExerciseRun; outcomes: Outcome[] } {
  let run = startRun(ex)
  const outcomes: Outcome[] = []
  for (const input of inputs) {
    if (input === 'continue') {
      run = continueRun(ex, run)
    } else {
      const result = submitAnswer(ex, run, input)
      run = result.run
      outcomes.push(result.outcome)
    }
  }
  return { run, outcomes }
}

/** Golden path with a continue after every correct answer. */
const GOLDEN_WITH_CONTINUES = GOLDEN_PATH.flatMap((choice) => [choice, 'continue'])

describe('startRun', () => {
  it('E1 initializes at step 0', () => {
    const ex = frozenExercise()
    const run = startRun(ex)
    expect(run.exerciseId).toBe('MN-01')
    expect(run.stepIndex).toBe(0)
    expect(run.phase).toBe('question')
    expect(run.attempt).toBe(0)
    expect(run.eliminated).toEqual([])
    expect(run.feedback).toBeNull()
    expect(run.previousState).toBeNull()
    expect(run.results).toEqual([])
    expect(run.state).toEqual(ex.initialState)
  })

  it('E2 initial state is not shared with the exercise', () => {
    const ex = makeMiniExercise()
    const before = structuredClone(ex.initialState)
    const run = startRun(ex)
    expect(run.state).not.toBe(ex.initialState)
    run.state.frames[0].variables.push({ name: 'cur', value: { kind: 'ref', target: null } })
    run.state.heap[0].fields[1].value = { kind: 'int', value: 99 }
    run.state.output.push('mutated')
    expect(ex.initialState).toEqual(before)
  })
})

describe('submitAnswer — correct answers', () => {
  it('E3 correct answer advances exactly one step', () => {
    const ex = frozenExercise()
    const { run, outcome } = submitAnswer(ex, startRun(ex), 'b')
    expect(run.stepIndex).toBe(1)
    expect(run.phase).toBe('explanation')
    expect(outcome).toEqual({
      type: 'correct',
      checkpointId: 'mn01-c1',
      choiceId: 'b',
      attempt: 1,
      concept: 'deep-copy',
      exerciseCompleted: false,
    })
    expect(run.feedback).toEqual({ kind: 'correct', choiceId: 'b', explanation: 'Explanation for mn01-c1.' })
    expect(run.results).toEqual([{ checkpointId: 'mn01-c1', attempts: 1, hintsShown: [] }])
  })

  it('E4 resulting state matches the specification', () => {
    const ex = frozenExercise()
    const start = startRun(ex)
    const { run } = submitAnswer(ex, start, 'b')
    expect(run.state).toEqual(ex.checkpoints[0].resultState)
    expect(run.previousState).toEqual(ex.initialState)
    expect(run.previousState).toEqual(start.state)
  })

  it('E4 resulting state is a copy, not the content object', () => {
    const ex = makeMiniExercise()
    const { run } = submitAnswer(ex, startRun(ex), 'b')
    expect(run.state).not.toBe(ex.checkpoints[0].resultState)
    run.state.output.push('mutated')
    expect(ex.checkpoints[0].resultState.output).toEqual([])
  })
})

describe('submitAnswer — incorrect answers', () => {
  it('E5 incorrect answer does not advance', () => {
    const ex = frozenExercise()
    const start = startRun(ex)
    const { run, outcome } = submitAnswer(ex, start, 'a')
    expect(outcome.type).toBe('incorrect')
    expect(run.stepIndex).toBe(0)
    expect(run.phase).toBe('question')
    expect(run.state).toEqual(start.state)
    expect(run.previousState).toBeNull()
    expect(run.results).toEqual([])
  })

  it('E6 incorrect answer produces the hint for that choice’s misconception', () => {
    const ex = frozenExercise()
    const { run, outcome } = submitAnswer(ex, startRun(ex), 'c')
    expect(run.feedback).toEqual({
      kind: 'incorrect',
      choiceId: 'c',
      misconceptionId: 'new-copies-list',
      hint: 'Hint for new-copies-list.',
    })
    expect(outcome).toEqual({
      type: 'incorrect',
      checkpointId: 'mn01-c1',
      choiceId: 'c',
      attempt: 1,
      misconceptionId: 'new-copies-list',
      concept: 'deep-copy',
    })
    // The correct answer is never revealed.
    expect(JSON.stringify(run.feedback)).not.toContain('"b"')
    expect(JSON.stringify(outcome)).not.toContain('"b"')
  })

  it('E6 each wrong choice gets its own hint', () => {
    const ex = frozenExercise()
    for (const choice of ex.checkpoints[2].choices.filter((c) => c.misconception)) {
      const { run: atStep3 } = play(ex, ['b', 'continue', 'a', 'continue'])
      const { run } = submitAnswer(ex, atStep3, choice.id)
      expect(run.feedback).toEqual({
        kind: 'incorrect',
        choiceId: choice.id,
        misconceptionId: choice.misconception!.id,
        hint: choice.misconception!.hint,
      })
    }
  })

  it('E7 retry works after an incorrect answer', () => {
    const ex = frozenExercise()
    const { run, outcomes } = play(ex, ['a', 'b'])
    expect(outcomes[0]).toMatchObject({ type: 'incorrect', attempt: 1 })
    expect(outcomes[1]).toMatchObject({ type: 'correct', attempt: 2 })
    expect(run.stepIndex).toBe(1)
    expect(run.results).toEqual([{ checkpointId: 'mn01-c1', attempts: 2, hintsShown: ['shallow-head'] }])
  })

  it('E7 attempts accumulate across several wrong answers', () => {
    const ex = frozenExercise()
    const { run, outcomes } = play(ex, ['b', 'continue', 'a', 'continue', 'a', 'b', 'c', 'd'])
    expect(outcomes.slice(2).map((o) => (o.type === 'rejected' ? o.type : [o.type, o.attempt]))).toEqual([
      ['incorrect', 1],
      ['incorrect', 2],
      ['incorrect', 3],
      ['correct', 4],
    ])
    expect(run.results[2]).toEqual({
      checkpointId: 'mn01-c3',
      attempts: 4,
      hintsShown: ['field-confusion', 'links-bidirectional', 'field-assign-moves-variable'],
    })
  })

  it('E8 an eliminated choice becomes unavailable for that checkpoint', () => {
    const ex = frozenExercise()
    const first = submitAnswer(ex, startRun(ex), 'a').run
    expect(first.eliminated).toEqual(['a'])
    expect(first.attempt).toBe(1)
    const second = submitAnswer(ex, first, 'a')
    expect(second.outcome).toEqual({ type: 'rejected', reason: 'already-eliminated' })
    expect(second.run).toEqual(first)
    expect(second.run.attempt).toBe(1)
  })
})

describe('submitAnswer — rejected submissions', () => {
  it('E9 unknown choice is rejected and the run is unchanged', () => {
    const ex = frozenExercise()
    const start = startRun(ex)
    const { run, outcome } = submitAnswer(ex, start, 'z')
    expect(outcome).toEqual({ type: 'rejected', reason: 'unknown-choice' })
    expect(run).toEqual(start)
  })

  it('E10 submit is rejected during the explanation phase', () => {
    const ex = frozenExercise()
    const inExplanation = submitAnswer(ex, startRun(ex), 'b').run
    const { run, outcome } = submitAnswer(ex, inExplanation, 'a')
    expect(outcome).toEqual({ type: 'rejected', reason: 'not-in-question-phase' })
    expect(run).toEqual(inExplanation)
  })
})

describe('continueRun', () => {
  it('E11 continue moves from explanation to the next question', () => {
    const ex = frozenExercise()
    const { run: inExplanation } = play(ex, ['a', 'b'])
    expect(inExplanation.eliminated).toEqual(['a'])
    const run = continueRun(ex, inExplanation)
    expect(run.phase).toBe('question')
    expect(run.stepIndex).toBe(1)
    expect(run.feedback).toBeNull()
    expect(run.attempt).toBe(0)
    expect(run.eliminated).toEqual([])
    expect(run.state).toEqual(inExplanation.state)
    expect(run.results).toEqual(inExplanation.results)
  })

  it('E12 continue is a no-op in the question phase', () => {
    const ex = frozenExercise()
    const start = startRun(ex)
    expect(continueRun(ex, start)).toEqual(start)
    const afterWrong = submitAnswer(ex, start, 'a').run
    expect(continueRun(ex, afterWrong)).toEqual(afterWrong)
  })
})

describe('completion', () => {
  it('E13 the final correct answer completes the exercise', () => {
    const ex = frozenExercise()
    const { run: atLast } = play(ex, ['b', 'continue', 'a', 'continue'])
    const { run, outcome } = submitAnswer(ex, atLast, 'd')
    expect(outcome).toMatchObject({ type: 'correct', checkpointId: 'mn01-c3', exerciseCompleted: true })
    expect(run.stepIndex).toBe(ex.checkpoints.length)
    expect(run.phase).toBe('explanation')
    expect(run.state).toEqual(ex.checkpoints[2].resultState)
    const done = continueRun(ex, run)
    expect(done.phase).toBe('complete')
    expect(done.stepIndex).toBe(ex.checkpoints.length)
    expect(done.feedback).toBeNull()
    expect(done.results.map((r) => r.checkpointId)).toEqual(['mn01-c1', 'mn01-c2', 'mn01-c3'])
  })

  it('E14 completion is flagged exactly once per run', () => {
    const ex = frozenExercise()
    const { outcomes } = play(ex, ['a', 'b', 'continue', 'b', 'a', 'continue', 'a', 'd', 'continue', 'd', 'continue'])
    const completions = outcomes.filter((o) => o.type === 'correct' && o.exerciseCompleted)
    expect(completions).toHaveLength(1)
  })

  it('E15 cannot advance beyond completion', () => {
    const ex = frozenExercise()
    const { run: done } = play(ex, GOLDEN_WITH_CONTINUES)
    expect(done.phase).toBe('complete')
    for (const choiceId of ['a', 'b', 'c', 'd', 'z']) {
      const { run, outcome } = submitAnswer(ex, done, choiceId)
      expect(outcome).toEqual({ type: 'rejected', reason: 'not-in-question-phase' })
      expect(run).toEqual(done)
    }
    const continued = continueRun(ex, continueRun(ex, done))
    expect(continued).toEqual(done)
    expect(continued.stepIndex).toBe(ex.checkpoints.length)
  })
})

describe('restartRun', () => {
  it('E16 restart restores the initial state', () => {
    const ex = frozenExercise()
    const { run: midway } = play(ex, ['a', 'b', 'continue', 'b'])
    expect(midway.stepIndex).toBe(1)
    expect(restartRun(ex)).toEqual(startRun(ex))
    const { run: done } = play(ex, GOLDEN_WITH_CONTINUES)
    expect(done.phase).toBe('complete')
    const restarted = restartRun(ex)
    expect(restarted).toEqual(startRun(ex))
    expect(restarted.state).toEqual(ex.initialState)
  })
})

describe('determinism and purity', () => {
  it('E17 the same inputs produce deep-equal runs and outcomes', () => {
    const inputs = ['c', 'a', 'b', 'continue', 'b', 'a', 'continue', 'c', 'd', 'continue']
    const first = play(frozenExercise(), inputs)
    const second = play(frozenExercise(), inputs)
    expect(second).toEqual(first)
  })

  it('E17 the engine never mutates the exercise or the run it is given', () => {
    const ex = frozenExercise()
    let run = deepFreeze(startRun(ex))
    for (const input of ['a', 'b', 'continue', 'b', 'a', 'continue', 'a', 'd', 'continue']) {
      // Frozen inputs: any mutation would throw a TypeError in strict mode.
      run = deepFreeze(input === 'continue' ? continueRun(ex, run) : submitAnswer(ex, run, input).run)
    }
    expect(run.phase).toBe('complete')
  })

  it('E18 a checkpoint whose resultState equals the prior state advances normally', () => {
    const ex = frozenExercise()
    expect(ex.checkpoints[1].resultState).toEqual(ex.checkpoints[0].resultState)
    const { run: atStep2 } = play(ex, ['b', 'continue'])
    const { run, outcome } = submitAnswer(ex, atStep2, 'a')
    expect(outcome).toMatchObject({ type: 'correct', checkpointId: 'mn01-c2', exerciseCompleted: false })
    expect(run.stepIndex).toBe(2)
    expect(run.phase).toBe('explanation')
    expect(run.state).toEqual(atStep2.state)
    expect(run.previousState).toEqual(atStep2.state)
  })
})
