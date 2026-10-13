// @vitest-environment jsdom
// F-A11 — page bootstrap: main.tsx resolves the session id, POSTs
// /api/v1/sessions, then emits session_started once per page load
// (docs/ANALYTICS.md §2–§3, §7; docs/ARCHITECTURE.md §9.2).
// F-A10 (app level) — with VITE_API_BASE_URL unset, nothing is sent.

import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  API_BASE, EVENTS_URL, SESSIONS_URL, UUID, allEvents, eventBatches, hidePage, installFetch, sessionBodies,
  sessionCalls, settle, type FetchCall,
} from '../fixtures/analyticsWire'

// Test-only: record every React root main.tsx creates so each test can unmount
// its page. Otherwise pages from earlier tests stay mounted on detached nodes,
// keep reacting to hashchange, and could emit into a later test's fetch stub.
// createRoot itself is passed through unchanged.
const roots = vi.hoisted(() => [] as { unmount(): void }[])
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args)
      roots.push(root)
      return root
    },
  }
})

/** Loads main.tsx into a fresh #root, as the browser does on page load. */
async function loadPage(env: { base?: string; version?: string }) {
  document.body.innerHTML = '<div id="root"></div>'
  vi.stubEnv('VITE_API_BASE_URL', env.base)
  vi.stubEnv('VITE_APP_VERSION', env.version)
  vi.resetModules()
  await act(async () => {
    await import('../../src/main')
  })
  await act(() => settle())
}

/** Sets window.innerWidth (window and globalThis are distinct under Vitest's jsdom). */
function setViewportWidth(width: number): () => void {
  const targets = [...new Set<object>([window, globalThis])]
  const saved = targets.map((t) => [t, Object.getOwnPropertyDescriptor(t, 'innerWidth')] as const)
  for (const t of targets) Object.defineProperty(t, 'innerWidth', { configurable: true, value: width })
  return () => {
    for (const [t, d] of saved) {
      if (d) Object.defineProperty(t, 'innerWidth', d)
      else delete (t as Record<string, unknown>).innerWidth
    }
  }
}

/**
 * Events of one type sent by *this* page load. Pages from earlier tests stay
 * mounted on detached nodes (main.tsx does not expose its root) and still hear
 * hashchange, so events are scoped to the current page's session id.
 */
const ofType = (type: string) => {
  const session = window.localStorage.getItem('traceds.sessionId')
  return eventBatches(calls)
    .filter((b) => b.session_id === session)
    .flatMap((b) => b.events)
    .filter((e) => e.event_type === type)
}

let calls: FetchCall[]
beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = '#/'
  calls = installFetch().calls
})
afterEach(async () => {
  await hidePage()
  cleanup()
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('session bootstrap (F-A11)', () => {
  it('POSTs the anonymous session once, with only the documented fields', async () => {
    await loadPage({ base: API_BASE, version: '2026.10.13-test' })
    await screen.findByRole('heading', { level: 1 })

    const posts = sessionCalls(calls)
    expect(posts).toHaveLength(1)
    expect(posts[0].init?.method).toBe('POST')
    expect(new Headers(posts[0].init?.headers).get('content-type')).toMatch(/^application\/json/)

    const [body] = sessionBodies(calls)
    const stored = window.localStorage.getItem('traceds.sessionId')
    expect(stored).toMatch(UUID)
    expect(body).toEqual({ session_id: stored, app_version: '2026.10.13-test', viewport: expect.stringMatching(/^(narrow|wide)$/) })
  })

  it('emits session_started exactly once, after the session POST, in the same session', async () => {
    await loadPage({ base: API_BASE, version: '2026.10.13-test' })
    await act(() => hidePage())

    const started = allEvents(calls).filter((e) => e.event_type === 'session_started')
    expect(started).toHaveLength(1)
    expect(Object.keys(started[0]).sort()).toEqual(['client_ts', 'event_id', 'event_type'])

    const session = window.localStorage.getItem('traceds.sessionId')
    expect(eventBatches(calls).map((b) => b.session_id)).toEqual(eventBatches(calls).map(() => session))

    const firstSessionPost = calls.findIndex((c) => c.url === SESSIONS_URL)
    const firstEventsPost = calls.findIndex((c) => c.url === EVENTS_URL)
    expect(firstSessionPost).toBeGreaterThanOrEqual(0)
    expect(firstEventsPost).toBeGreaterThan(firstSessionPost)
  })

  it('reuses the session id already stored by an earlier visit', async () => {
    const earlier = '5b0f3c1e-2a4d-4e6f-8a9b-0c1d2e3f4a5b'
    window.localStorage.setItem('traceds.sessionId', earlier)
    await loadPage({ base: API_BASE, version: 'v' })
    await act(() => hidePage())
    expect(sessionBodies(calls).map((b) => b.session_id)).toEqual([earlier])
    expect(eventBatches(calls).map((b) => b.session_id)).toEqual(eventBatches(calls).map(() => earlier))
    expect(eventBatches(calls).length).toBeGreaterThan(0)
  })

  it('still renders the app when the session POST fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    await loadPage({ base: API_BASE, version: 'v' })
    expect(await screen.findByRole('link', { name: 'Start practicing' })).toBeTruthy()
    expect(fetch).toHaveBeenCalled()
  })
})

describe('viewport classification (F-A11; ANALYTICS §4: narrow < 768 ≤ wide)', () => {
  it.each([
    [360, 'narrow'],
    [767, 'narrow'],
    [768, 'wide'],
    [1440, 'wide'],
  ])('innerWidth %i → %s', async (width, expected) => {
    const restore = setViewportWidth(width)
    try {
      await loadPage({ base: API_BASE, version: 'v' })
      expect(sessionBodies(calls).map((b) => b.viewport)).toEqual([expected])
    } finally {
      restore()
    }
  })
})

describe('logical events under React StrictMode (F-A11, F-A12; ANALYTICS §3)', () => {
  // main.tsx renders <App /> inside <StrictMode>, so these page loads exercise
  // dev-mode double effects through the real entry point.
  it('a page load opened on the module emits one session_started and one module_selected', async () => {
    window.location.hash = '#/m/linked-lists'
    await loadPage({ base: API_BASE, version: 'v' })
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    await act(() => hidePage())
    expect(sessionCalls(calls)).toHaveLength(1)
    expect(ofType('session_started')).toHaveLength(1)
    expect(ofType('module_selected')).toHaveLength(1)
  })

  it('a page load opened on an exercise emits one exercise_started', async () => {
    window.location.hash = '#/x/LL-01'
    await loadPage({ base: API_BASE, version: 'v' })
    await screen.findByText('Step 1 of 6')
    await act(() => hidePage())
    expect(ofType('session_started')).toHaveLength(1)
    const started = ofType('exercise_started')
    expect(started).toHaveLength(1)
    expect(started[0].exercise_id).toBe('LL-01')
  })
})

describe('no-op without a base URL (F-A10, app level)', () => {
  it('sends nothing at all when VITE_API_BASE_URL is unset (control: the same page load with it set does send)', async () => {
    // Control: analytics is wired, so the silence below is the no-op, not absence.
    await loadPage({ base: API_BASE, version: 'v' })
    await act(() => hidePage())
    expect(calls.length).toBeGreaterThan(0)
    act(() => roots.splice(0).forEach((root) => root.unmount()))

    const { fetchMock } = installFetch()
    await loadPage({ base: undefined, version: 'v' })
    expect(await screen.findByRole('link', { name: 'Start practicing' })).toBeTruthy()
    await act(() => hidePage())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('an empty VITE_API_BASE_URL also disables analytics, and the student can still practice', async () => {
    // Control (as above): with a base URL, the same load sends.
    await loadPage({ base: API_BASE, version: 'v' })
    await act(() => hidePage())
    expect(calls.length).toBeGreaterThan(0)
    act(() => roots.splice(0).forEach((root) => root.unmount()))

    const { fetchMock } = installFetch()
    window.location.hash = '#/x/LL-01'
    await loadPage({ base: '', version: 'v' })
    await screen.findByText('Step 1 of 6')
    await act(() => hidePage())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
