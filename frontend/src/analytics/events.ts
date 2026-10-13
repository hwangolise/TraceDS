// The UI-facing tracking interface (docs/ANALYTICS.md §7 "UI boundary",
// docs/ARCHITECTURE.md §8). Screens and components import analytics only from
// this module, and only call these semantic actions. Delivery (client.ts) and
// storage (session.ts) stay behind it. `run_id` and `event_id` are generated
// here and in the client; UI code never sees them.
//
// Every export never throws and returns void.

import type { Exercise, Outcome } from '../engine/types'
import { createAnalyticsClient, type AnalyticsClient, type TrackedEvent } from './client'
import { getSessionId } from './session'
import { newUuid } from './uuid'

const NARROW_BELOW_PX = 768

let client: AnalyticsClient | undefined
/** The run that exercise events currently belong to (one per startRun/restartRun). */
let currentRun: { exerciseId: string; runId: string } | undefined

/** The shared client, created on first use. A missing base URL makes it a no-op. */
function getClient(): AnalyticsClient {
  if (!client) {
    client = createAnalyticsClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL,
      sessionId: getSessionId(),
    })
  }
  return client
}

/** Records one logical event. Never throws, never blocks. */
export function track(event: TrackedEvent): void {
  try {
    getClient().track(event)
  } catch {
    // analytics must never affect the app
  }
}

/** Page bootstrap (called once from main.tsx): registers the session, then session_started. */
export function startAnalytics(): void {
  try {
    const appVersion = import.meta.env.VITE_APP_VERSION
    getClient().registerSession({
      app_version: appVersion ? appVersion : undefined,
      viewport: window.innerWidth < NARROW_BELOW_PX ? 'narrow' : 'wide',
    })
    track({ event_type: 'session_started' })
  } catch {
    // analytics must never affect the app
  }
}

/** The student opened a module page (navigation, not a re-render). */
export function trackModuleSelected(moduleId: string): void {
  track({ event_type: 'module_selected', module_id: moduleId })
}

/** A run of an exercise began (initial start or restart): starts a new run id. */
export function trackExerciseStarted(exercise: Pick<Exercise, 'id' | 'moduleId'>): void {
  try {
    currentRun = { exerciseId: exercise.id, runId: newUuid() }
    track({
      event_type: 'exercise_started',
      module_id: exercise.moduleId,
      exercise_id: exercise.id,
      run_id: currentRun.runId,
    })
  } catch {
    // analytics must never affect the app
  }
}

/**
 * The engine returned an outcome for the current run. `rejected` emits nothing;
 * `incorrect` emits answer_submitted then hint_shown; the outcome that
 * completes the exercise also emits exercise_completed.
 */
export function trackOutcome(exercise: Pick<Exercise, 'id' | 'moduleId'>, outcome: Outcome): void {
  try {
    if (outcome.type === 'rejected') return
    if (!currentRun || currentRun.exerciseId !== exercise.id) return
    const where = { module_id: exercise.moduleId, exercise_id: exercise.id, run_id: currentRun.runId }
    const step = {
      step_id: outcome.checkpointId,
      choice_id: outcome.choiceId,
      attempt_number: outcome.attempt,
      concept_id: outcome.concept,
    }
    if (outcome.type === 'incorrect') {
      track({ event_type: 'answer_submitted', ...where, ...step, correct: false, misconception_id: outcome.misconceptionId })
      track({ event_type: 'hint_shown', ...where, ...step, misconception_id: outcome.misconceptionId })
      return
    }
    track({ event_type: 'answer_submitted', ...where, ...step, correct: true })
    if (outcome.exerciseCompleted) track({ event_type: 'exercise_completed', ...where })
  } catch {
    // analytics must never affect the app
  }
}
