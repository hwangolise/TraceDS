// Fire-and-forget analytics delivery (docs/ANALYTICS.md §4, docs/ARCHITECTURE.md §8).
//
// M7A stub: types and signatures only.

export type EventType =
  | 'session_started'
  | 'module_selected'
  | 'exercise_started'
  | 'answer_submitted'
  | 'hint_shown'
  | 'exercise_completed'
  | 'survey_submitted'

/** An event as tracked by the app. The client adds `event_id` and `client_ts`. */
export interface TrackedEvent {
  event_type: EventType
  module_id?: string
  exercise_id?: string
  run_id?: string
  step_id?: string
  choice_id?: string
  correct?: boolean
  attempt_number?: number
  concept_id?: string
  misconception_id?: string
}

export interface ClientConfig {
  /** Backend origin (VITE_API_BASE_URL). Unset means the client is a no-op. */
  baseUrl: string | undefined
  sessionId: string
}

export interface AnalyticsClient {
  /** Queue an event. Never throws, never blocks. */
  track(event: TrackedEvent): void
}

export function createAnalyticsClient(config: ClientConfig): AnalyticsClient {
  void config
  throw new Error('not implemented')
}
