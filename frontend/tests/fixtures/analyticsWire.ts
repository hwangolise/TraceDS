// Test-only harness for observing analytics at the network boundary
// (docs/ANALYTICS.md §3–§4, docs/ARCHITECTURE.md §8–§9.2).
//
// Screen and app tests assert what actually leaves the browser: the fetch
// requests and their JSON bodies. They don't assert which internal function
// emitted them. Flushes are forced with the documented trigger,
// `visibilitychange` → hidden.

import { vi } from 'vitest'

export const API_BASE = 'https://api.test'
export const SESSIONS_URL = `${API_BASE}/api/v1/sessions`
export const EVENTS_URL = `${API_BASE}/api/v1/events`

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export interface FetchCall {
  url: string
  init: RequestInit | undefined
}

export type WireEvent = Record<string, unknown>
export interface EventBatch {
  session_id: string
  events: WireEvent[]
}

type Responder = (call: FetchCall) => Promise<{ status: number }> | { status: number }

/** Stubs global fetch. Every call is recorded; the responder decides the status. */
export function installFetch(responder: Responder = () => ({ status: 202 })) {
  const calls: FetchCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input instanceof Request ? input.url : input), init }
    calls.push(call)
    const { status } = await responder(call)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
      text: async () => '',
    } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

function parseBody(call: FetchCall): unknown {
  const body = call.init?.body
  if (typeof body !== 'string') throw new Error(`expected a JSON string body for ${call.url}, got ${typeof body}`)
  return JSON.parse(body)
}

export const eventCalls = (calls: FetchCall[]) => calls.filter((c) => c.url === EVENTS_URL)
export const sessionCalls = (calls: FetchCall[]) => calls.filter((c) => c.url === SESSIONS_URL)
export const eventBatches = (calls: FetchCall[]) => eventCalls(calls).map((c) => parseBody(c) as EventBatch)
export const sessionBodies = (calls: FetchCall[]) => sessionCalls(calls).map((c) => parseBody(c) as Record<string, unknown>)
/** Every event delivered, in request order. */
export const allEvents = (calls: FetchCall[]) => eventBatches(calls).flatMap((b) => b.events)

/** Lets pending promise callbacks and zero-delay timers run (real timers). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Simulates the page being hidden (tab switch, close): the documented flush trigger. */
export async function hidePage(): Promise<void> {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
  // Restore the prototype getter ('visible' under jsdom).
  delete (document as unknown as Record<string, unknown>).visibilityState
  await settle()
}

/**
 * Makes reading `localStorage` itself throw, as browsers do when site data is
 * blocked. Under Vitest's jsdom, `window` and `globalThis` are distinct
 * objects, so both are patched. Returns a function that restores them.
 */
export function blockLocalStorageAccess(): () => void {
  const targets = [...new Set<object>([window, globalThis])]
  const saved = targets.map((t) => [t, Object.getOwnPropertyDescriptor(t, 'localStorage')] as const)
  for (const t of targets) {
    Object.defineProperty(t, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError')
      },
    })
  }
  return () => {
    for (const [t, descriptor] of saved) {
      if (descriptor) Object.defineProperty(t, 'localStorage', descriptor)
      else delete (t as Record<string, unknown>).localStorage
    }
  }
}

/** Strips the per-event generated fields so a flow can be compared with a handwritten expectation. */
export function withoutGenerated(events: WireEvent[]): WireEvent[] {
  return events.map((e) => {
    const copy = { ...e }
    delete copy.event_id
    delete copy.client_ts
    delete copy.run_id
    return copy
  })
}
