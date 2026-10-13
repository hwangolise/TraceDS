// @vitest-environment jsdom
// F-A7, F-A8, F-A10 and the request envelope — analytics delivery
// (docs/ANALYTICS.md §3–§4, docs/ARCHITECTURE.md §8, §9.2).
//
// Expected payloads are handwritten. Each test uses its own session id, and
// requests are filtered by it, so a client from an earlier test can never leak
// into an assertion.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalyticsClient, type TrackedEvent } from '../../src/analytics/client'
import { API_BASE, EVENTS_URL, ISO_8601, UUID, installFetch, type EventBatch, type FetchCall } from '../fixtures/analyticsWire'

let sessionCounter = 0
const nextSession = () => `00000000-0000-4000-8000-${String(++sessionCounter).padStart(12, '0')}`

const moduleSelected: TrackedEvent = { event_type: 'module_selected', module_id: 'linked-lists' }

function batchesFor(calls: FetchCall[], sessionId: string): EventBatch[] {
  return calls
    .filter((c) => c.url === EVENTS_URL)
    .map((c) => JSON.parse(String(c.init?.body)) as EventBatch)
    .filter((b) => b.session_id === sessionId)
}

function hidePageSync() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
  delete (document as unknown as Record<string, unknown>).visibilityState
}

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => unhandled.push(reason)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-13T12:00:00.000Z'))
  unhandled.length = 0
  process.on('unhandledRejection', onUnhandled)
})
afterEach(() => {
  process.off('unhandledRejection', onUnhandled)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('request envelope (ARCHITECTURE §9.2)', () => {
  it('POSTs JSON {session_id, events} to <base>/api/v1/events', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    client.track(moduleSelected)
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)

    const mine = calls.filter((c) => c.url === EVENTS_URL && String(c.init?.body).includes(sessionId))
    expect(mine).toHaveLength(1)
    const { init } = mine[0]
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('content-type')).toMatch(/^application\/json/)
    const body = JSON.parse(String(init?.body))
    expect(Object.keys(body).sort()).toEqual(['events', 'session_id'])
    expect(body.session_id).toBe(sessionId)
  })

  it('passes tracked fields through unchanged and adds a UUID event_id and an ISO-8601 client_ts', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    const run = '7d444840-9dc0-41a1-9f1c-0e1d7f5b3a21'
    client.track({
      event_type: 'answer_submitted', module_id: 'linked-lists', exercise_id: 'LL-01', run_id: run,
      step_id: 'll01-c3', choice_id: 'a', correct: false, attempt_number: 1,
      concept_id: 'aliasing', misconception_id: 'assignment-copies-object',
    })
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)

    const [event] = batchesFor(calls, sessionId).flatMap((b) => b.events)
    expect(event).toEqual({
      event_id: expect.stringMatching(UUID),
      event_type: 'answer_submitted', module_id: 'linked-lists', exercise_id: 'LL-01', run_id: run,
      step_id: 'll01-c3', choice_id: 'a', correct: false, attempt_number: 1,
      concept_id: 'aliasing', misconception_id: 'assignment-copies-object',
      client_ts: expect.stringMatching(ISO_8601),
    })
    expect(new Date(event.client_ts as string).getTime()).toBe(Date.parse('2026-10-13T12:00:00.000Z'))
  })

  it('omits keys whose value is undefined instead of sending null (ANALYTICS §3: absent means omitted)', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    client.track({ event_type: 'module_selected', module_id: 'linked-lists', step_id: undefined, run_id: undefined })
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)
    const [event] = batchesFor(calls, sessionId).flatMap((b) => b.events)
    expect(Object.keys(event).sort()).toEqual(['client_ts', 'event_id', 'event_type', 'module_id'])
  })

  it('preserves tracked order within a batch (answer, hint, answer, completion)', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    const base = { module_id: 'linked-lists', exercise_id: 'LL-01', run_id: '7d444840-9dc0-41a1-9f1c-0e1d7f5b3a21' }
    const wrong = { step_id: 'll01-c6', choice_id: 'a', attempt_number: 1, concept_id: 'aliasing', misconception_id: 'stale-position' }
    client.track({ event_type: 'answer_submitted', ...base, ...wrong, correct: false })
    client.track({ event_type: 'hint_shown', ...base, ...wrong })
    client.track({ event_type: 'answer_submitted', ...base, step_id: 'll01-c6', choice_id: 'c', correct: true, attempt_number: 2, concept_id: 'aliasing' })
    client.track({ event_type: 'exercise_completed', ...base })
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)
    const events = batchesFor(calls, sessionId).flatMap((b) => b.events)
    expect(events.map((e) => [e.event_type, e.choice_id ?? null])).toEqual([
      ['answer_submitted', 'a'],
      ['hint_shown', 'a'],
      ['answer_submitted', 'c'],
      ['exercise_completed', null],
    ])
  })

  it('gives every event a distinct event_id', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    for (let i = 0; i < 25; i++) client.track(moduleSelected)
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)
    const ids = batchesFor(calls, sessionId).flatMap((b) => b.events.map((e) => e.event_id))
    expect(ids).toHaveLength(25)
    expect(new Set(ids).size).toBe(25)
  })
})

describe('batching and flush (F-A7)', () => {
  it('does not send 9 queued events, and sends all 10 in order when the 10th is tracked', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    for (let i = 1; i <= 9; i++) client.track({ event_type: 'module_selected', module_id: `m${i}` })
    await vi.advanceTimersByTimeAsync(0)
    expect(batchesFor(calls, sessionId)).toHaveLength(0)

    client.track({ event_type: 'module_selected', module_id: 'm10' })
    await vi.advanceTimersByTimeAsync(0)
    const batches = batchesFor(calls, sessionId)
    expect(batches).toHaveLength(1)
    expect(batches[0].events.map((e) => e.module_id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'])
  })

  it('flushes a partial queue on the 5 s timer', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    client.track(moduleSelected)
    client.track(moduleSelected)
    client.track(moduleSelected)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(batchesFor(calls, sessionId)).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    const batches = batchesFor(calls, sessionId)
    expect(batches).toHaveLength(1)
    expect(batches[0].events).toHaveLength(3)
  })

  it('flushes on page hide, immediately, with keepalive so the request survives the page', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    client.track(moduleSelected)
    client.track(moduleSelected)
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)
    const mine = calls.filter((c) => c.url === EVENTS_URL && String(c.init?.body).includes(sessionId))
    expect(mine).toHaveLength(1)
    expect(mine[0].init?.keepalive).toBe(true)
    expect(JSON.parse(String(mine[0].init?.body)).events).toHaveLength(2)
  })

  it('never sends an empty batch', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    client.track(moduleSelected)
    hidePageSync()
    await vi.advanceTimersByTimeAsync(30_000)
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)
    const batches = batchesFor(calls, sessionId)
    expect(batches).toHaveLength(1)
    for (const b of batches) expect(b.events.length).toBeGreaterThan(0)
  })

  it('keeps every request within 1–50 events and delivers each tracked event exactly once', async () => {
    const { calls } = installFetch()
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    for (let i = 0; i < 137; i++) client.track({ event_type: 'module_selected', module_id: `m${i}` })
    hidePageSync()
    await vi.advanceTimersByTimeAsync(10_000)
    const batches = batchesFor(calls, sessionId)
    for (const b of batches) {
      expect(b.events.length).toBeGreaterThanOrEqual(1)
      expect(b.events.length).toBeLessThanOrEqual(50)
    }
    const delivered = batches.flatMap((b) => b.events.map((e) => e.module_id))
    expect(delivered).toEqual(Array.from({ length: 137 }, (_, i) => `m${i}`))
  })
})

describe('retry then drop (F-A8)', () => {
  async function failingDelivery(status: number | 'network') {
    const { calls } = installFetch(() => {
      if (status === 'network') throw new TypeError('Failed to fetch')
      return { status }
    })
    const sessionId = nextSession()
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId })
    client.track(moduleSelected)
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)
    return { calls, sessionId, client }
  }

  it('retries a 5xx twice, after 1 s and then 3 s, resending the identical batch', async () => {
    const { calls, sessionId } = await failingDelivery(503)
    expect(batchesFor(calls, sessionId)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(batchesFor(calls, sessionId)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(batchesFor(calls, sessionId)).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(batchesFor(calls, sessionId)).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    const attempts = batchesFor(calls, sessionId)
    expect(attempts).toHaveLength(3)
    // Same event ids every time: the backend deduplicates retries by event_id.
    expect(attempts[1]).toEqual(attempts[0])
    expect(attempts[2]).toEqual(attempts[0])
  })

  it('drops the batch after the second retry fails', async () => {
    const { calls, sessionId, client } = await failingDelivery(500)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(batchesFor(calls, sessionId)).toHaveLength(3)
    // A later flush carries only new events, never the dropped one.
    const dropped = batchesFor(calls, sessionId)[0].events[0].event_id
    client.track({ event_type: 'module_selected', module_id: 'after-drop' })
    hidePageSync()
    await vi.advanceTimersByTimeAsync(60_000)
    const later = batchesFor(calls, sessionId).slice(3).flatMap((b) => b.events)
    expect(later.length).toBeGreaterThan(0)
    expect(later.map((e) => e.module_id)).toEqual(later.map(() => 'after-drop'))
    expect(later.map((e) => e.event_id)).not.toContain(dropped)
  })

  it('retries network errors the same way (3 attempts in total)', async () => {
    const { calls, sessionId } = await failingDelivery('network')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(batchesFor(calls, sessionId)).toHaveLength(3)
  })

  it('drops a 4xx immediately, without retrying', async () => {
    const { calls, sessionId } = await failingDelivery(400)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(batchesFor(calls, sessionId)).toHaveLength(1)
  })

  it('does not resend a delivered batch', async () => {
    const { calls, sessionId } = await failingDelivery(202)
    await vi.advanceTimersByTimeAsync(60_000)
    hidePageSync()
    await vi.advanceTimersByTimeAsync(0)
    expect(batchesFor(calls, sessionId)).toHaveLength(1)
  })

  it('never throws and leaves no unhandled rejection, even when fetch throws synchronously', async () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('fetch exploded')
    }))
    const client = createAnalyticsClient({ baseUrl: API_BASE, sessionId: nextSession() })
    expect(() => {
      for (let i = 0; i < 12; i++) client.track(moduleSelected)
      hidePageSync()
    }).not.toThrow()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch).toHaveBeenCalled()
    expect(unhandled).toEqual([])
  })

  it('leaves no unhandled rejection when every attempt fails', async () => {
    await failingDelivery('network')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(unhandled).toEqual([])
  })
})

describe('no-op without a base URL (F-A10)', () => {
  it('never calls fetch when baseUrl is unset, whatever is tracked', async () => {
    const { fetchMock } = installFetch()
    const client = createAnalyticsClient({ baseUrl: undefined, sessionId: nextSession() })
    expect(() => {
      for (let i = 0; i < 25; i++) client.track(moduleSelected)
      hidePageSync()
    }).not.toThrow()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an empty baseUrl as unset', async () => {
    const { fetchMock } = installFetch()
    const client = createAnalyticsClient({ baseUrl: '', sessionId: nextSession() })
    for (let i = 0; i < 12; i++) client.track(moduleSelected)
    hidePageSync()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
