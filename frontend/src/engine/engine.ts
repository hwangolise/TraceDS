// Deterministic exercise engine (docs/ARCHITECTURE.md §4.3).
//
// Pure functions: every call returns new objects and never mutates the
// exercise or the run it is given. There is no I/O, clock, or randomness. The
// engine alone decides correctness and state transitions.

import type { Exercise, ExerciseRun, ProgramState, SubmitResult } from './types'

function cloneState(state: ProgramState): ProgramState {
  return structuredClone(state)
}

export function startRun(exercise: Exercise): ExerciseRun {
  return {
    exerciseId: exercise.id,
    stepIndex: 0,
    phase: 'question',
    state: cloneState(exercise.initialState),
    previousState: null,
    attempt: 0,
    eliminated: [],
    feedback: null,
    results: [],
  }
}

/** Restarting is identical to starting: the initial state is restored. */
export function restartRun(exercise: Exercise): ExerciseRun {
  return startRun(exercise)
}

export function submitAnswer(exercise: Exercise, run: ExerciseRun, choiceId: string): SubmitResult {
  if (run.phase !== 'question') {
    return { run, outcome: { type: 'rejected', reason: 'not-in-question-phase' } }
  }

  const checkpoint = exercise.checkpoints[run.stepIndex]
  const choice = checkpoint.choices.find((c) => c.id === choiceId)
  if (!choice) {
    return { run, outcome: { type: 'rejected', reason: 'unknown-choice' } }
  }
  if (run.eliminated.includes(choiceId)) {
    return { run, outcome: { type: 'rejected', reason: 'already-eliminated' } }
  }

  const attempt = run.attempt + 1

  if (choiceId !== checkpoint.correctChoiceId) {
    // Validation guarantees every incorrect choice has a misconception.
    const misconception = choice.misconception!
    return {
      run: {
        ...run,
        attempt,
        eliminated: [...run.eliminated, choiceId],
        feedback: { kind: 'incorrect', choiceId, misconceptionId: misconception.id, hint: misconception.hint },
      },
      outcome: {
        type: 'incorrect',
        checkpointId: checkpoint.id,
        choiceId,
        attempt,
        misconceptionId: misconception.id,
        concept: checkpoint.concept,
      },
    }
  }

  const hintsShown = run.eliminated.map(
    (id) => checkpoint.choices.find((c) => c.id === id)!.misconception!.id,
  )
  const stepIndex = run.stepIndex + 1
  return {
    run: {
      ...run,
      stepIndex,
      phase: 'explanation',
      previousState: run.state,
      state: cloneState(checkpoint.resultState),
      attempt,
      feedback: { kind: 'correct', choiceId, explanation: checkpoint.explanation },
      results: [...run.results, { checkpointId: checkpoint.id, attempts: attempt, hintsShown }],
    },
    outcome: {
      type: 'correct',
      checkpointId: checkpoint.id,
      choiceId,
      attempt,
      concept: checkpoint.concept,
      exerciseCompleted: stepIndex === exercise.checkpoints.length,
    },
  }
}

/** Acknowledges a correct answer. Has no effect outside the explanation phase. */
export function continueRun(exercise: Exercise, run: ExerciseRun): ExerciseRun {
  if (run.phase !== 'explanation') return run
  const finished = run.stepIndex >= exercise.checkpoints.length
  return {
    ...run,
    phase: finished ? 'complete' : 'question',
    attempt: 0,
    eliminated: [],
    feedback: null,
  }
}
