// Fire-and-forget analytics delivery (docs/ANALYTICS.md §4, docs/ARCHITECTURE.md §8).
//
// An in-memory queue flushed when it holds 10 events, every 5 s, or when the
// page is hidden. Failed requests (network error or 5xx) are retried twice
// (after 1 s, then 3 s) with the identical payload, then dropped; 4xx is
// dropped at once. Nothing here throws or returns a promise: callers never wait
// on analytics.

import { newUuid } from './uuid'

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

/** Optional metadata sent with the one-time session registration. */
export interface SessionMeta {
  app_version?: string
  viewport?: 'narrow' | 'wide'
}

/** The wire body of POST /api/v1/feedback, minus the session id the client adds (ANALYTICS §5). */
export interface FeedbackPayload {
  helpfulness: number
  requested_topic?: string
  comments?: string
}

export interface AnalyticsClient {
  /** Queue an event. Never throws, never blocks. */
  track(event: TrackedEvent): void
  /** POST /api/v1/sessions once. Best effort: failures are ignored. */
  registerSession(meta: SessionMeta): void
  /** Whether a backend is configured, so feedback can be offered at all. */
  readonly feedbackEnabled: boolean
  /**
   * POST /api/v1/feedback once, with no automatic retry. Resolves true only
   * for a 2xx response; any failure, error status, or a request still
   * unanswered after 10 s resolves false. Never rejects.
   */
  sendFeedback(payload: FeedbackPayload): Promise<boolean>
}

const FLUSH_AT = 10
const FLUSH_INTERVAL_MS = 5_000
const MAX_BATCH = 50
const RETRY_DELAYS_MS = [1_000, 3_000]
const FEEDBACK_TIMEOUT_MS = 10_000

type WireEvent = TrackedEvent & { event_id: string; client_ts: string }

const NOOP_CLIENT: AnalyticsClient = {
  track() {},
  registerSession() {},
  feedbackEnabled: false,
  sendFeedback: () => Promise.resolve(false),
}

/** Drops undefined/null members: the API treats absent as omitted and rejects explicit null. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as T
}

export function createAnalyticsClient(config: ClientConfig): AnalyticsClient {
  const base = (config.baseUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) return NOOP_CLIENT

  // Bind the transport once: a client's retries stay with the fetch it started
  // with, and a platform without fetch simply disables analytics.
  const boundFetch = typeof fetch === 'function' ? fetch.bind(globalThis) : undefined
  if (!boundFetch) return NOOP_CLIENT
  const doFetch = boundFetch

  const eventsUrl = `${base}/api/v1/events`
  const sessionsUrl = `${base}/api/v1/sessions`
  const feedbackUrl = `${base}/api/v1/feedback`
  let queue: WireEvent[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  /** One POST. Resolves to true when it should not be retried. Never rejects. */
  async function post(url: string, body: string): Promise<boolean> {
    try {
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
      return response.status < 500
    } catch {
      return false
    }
  }

  function deliver(body: string, attempt = 0): void {
    void post(eventsUrl, body)
      .then((done) => {
        if (done || attempt >= RETRY_DELAYS_MS.length) return
        setTimeout(() => deliver(body, attempt + 1), RETRY_DELAYS_MS[attempt])
      })
      .catch(() => {})
  }

  function flush(): void {
    try {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      while (queue.length > 0) {
        const events = queue.slice(0, MAX_BATCH)
        queue = queue.slice(MAX_BATCH)
        deliver(JSON.stringify({ session_id: config.sessionId, events }))
      }
    } catch {
      queue = []
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  try {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
  } catch {
    // no DOM: the timer and size triggers still work
  }

  async function sendFeedback(payload: FeedbackPayload): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined
      // The timeout wins the race even if the platform's fetch ignores abort.
      const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          controller?.abort()
          resolve(false)
        }, FEEDBACK_TIMEOUT_MS)
      })
      const request = doFetch(feedbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: config.sessionId, ...compact(payload) }),
        signal: controller?.signal,
      }).then((response) => response.status >= 200 && response.status < 300)
      return await Promise.race([request.catch(() => false), timeout])
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    feedbackEnabled: true,
    sendFeedback,
    track(event) {
      try {
        queue.push({ ...compact(event), event_id: newUuid(), client_ts: new Date().toISOString() })
        if (queue.length >= FLUSH_AT) flush()
        else if (timer === undefined) timer = setTimeout(flush, FLUSH_INTERVAL_MS)
      } catch {
        // analytics must never affect the app
      }
    },
    registerSession(meta) {
      try {
        void post(sessionsUrl, JSON.stringify({ session_id: config.sessionId, ...compact(meta) })).catch(() => {})
      } catch {
        // ignore
      }
    },
  }
}
