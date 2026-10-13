// @vitest-environment jsdom
// F-A12 — navigation events emitted by the app shell: module_selected on
// entering #/m/<module>, exercise_started on entering an exercise
// (docs/ANALYTICS.md §3, §7). Observed at the network boundary.

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE, allEvents, hidePage, installFetch, withoutGenerated, type FetchCall, type WireEvent } from '../fixtures/analyticsWire'

async function loadApp(): Promise<ComponentType> {
  vi.stubEnv('VITE_API_BASE_URL', API_BASE)
  vi.resetModules()
  return (await import('../../src/App')).default
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

async function delivered(calls: FetchCall[]): Promise<WireEvent[]> {
  await act(() => hidePage())
  return allEvents(calls)
}

/** Navigation events only: session_started belongs to main.tsx, not the app shell. */
const navigation = (events: WireEvent[]) =>
  withoutGenerated(events.filter((e) => e.event_type === 'module_selected' || e.event_type === 'exercise_started'))

let calls: FetchCall[]
beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = '#/'
  calls = installFetch().calls
})
afterEach(async () => {
  await hidePage()
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('module_selected (F-A12)', () => {
  it('is not emitted on the landing page (control: it is emitted once the module opens)', async () => {
    const App = await loadApp()
    render(<App />)
    expect(navigation(await delivered(calls))).toEqual([])
    go('#/m/linked-lists')
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    expect(navigation(await delivered(calls))).toEqual([{ event_type: 'module_selected', module_id: 'linked-lists' }])
  })

  it('is emitted once when the student opens Linked Lists from the landing page', async () => {
    const App = await loadApp()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Start practicing' }))
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    expect(navigation(await delivered(calls))).toEqual([{ event_type: 'module_selected', module_id: 'linked-lists' }])
  })

  it('is emitted when the page is opened directly on #/m/linked-lists (deep link)', async () => {
    window.location.hash = '#/m/linked-lists'
    const App = await loadApp()
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    expect(navigation(await delivered(calls))).toEqual([{ event_type: 'module_selected', module_id: 'linked-lists' }])
  })

  it('is emitted again on each navigation back to the module, and not for an unknown module', async () => {
    const App = await loadApp()
    render(<App />)
    go('#/m/linked-lists')
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    go('#/x/LL-01')
    await screen.findByText('Step 1 of 6')
    go('#/m/linked-lists')
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    go('#/m/not-a-module')
    expect(navigation(await delivered(calls))).toEqual([
      { event_type: 'module_selected', module_id: 'linked-lists' },
      { event_type: 'exercise_started', module_id: 'linked-lists', exercise_id: 'LL-01' },
      { event_type: 'module_selected', module_id: 'linked-lists' },
    ])
  })

  it('does not fire on re-renders of the module page that are not navigation', async () => {
    window.location.hash = '#/m/linked-lists'
    const App = await loadApp()
    const { rerender } = render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    rerender(<App />)
    act(() => window.dispatchEvent(new Event('resize')))
    expect(navigation(await delivered(calls))).toEqual([{ event_type: 'module_selected', module_id: 'linked-lists' }])
  })
})

describe('exercise_started from navigation (ANALYTICS §3)', () => {
  it('starting LL-01 from the module page emits one exercise_started for LL-01', async () => {
    window.location.hash = '#/m/linked-lists'
    const App = await loadApp()
    const user = userEvent.setup()
    render(<App />)
    const start = await screen.findByRole('link', { name: /Start\s+LL-01/ })
    await user.click(start)
    await screen.findByText('Step 1 of 6')
    const started = (await delivered(calls)).filter((e) => e.event_type === 'exercise_started')
    expect(withoutGenerated(started)).toEqual([{ event_type: 'exercise_started', module_id: 'linked-lists', exercise_id: 'LL-01' }])
  })

  it('re-entering an exercise starts a new run (new run id)', async () => {
    const App = await loadApp()
    render(<App />)
    go('#/x/LL-02')
    await screen.findByText(/^Step 1 of/)
    go('#/m/linked-lists')
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    go('#/x/LL-02')
    await screen.findByText(/^Step 1 of/)
    const started = (await delivered(calls)).filter((e) => e.event_type === 'exercise_started')
    expect(started.map((e) => e.exercise_id)).toEqual(['LL-02', 'LL-02'])
    expect(started[0].run_id).not.toBe(started[1].run_id)
  })
})

describe('logical events under React StrictMode (F-A12; ANALYTICS §3)', () => {
  // StrictMode re-runs effects in development. Analytics counts logical
  // occurrences, so the counts must match the non-StrictMode tests above.
  it('one navigation to the module emits one module_selected', async () => {
    const App = await loadApp()
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    go('#/m/linked-lists')
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    expect(navigation(await delivered(calls))).toEqual([{ event_type: 'module_selected', module_id: 'linked-lists' }])
  })

  it('a deep link to an exercise emits one exercise_started; navigating back emits one module_selected', async () => {
    window.location.hash = '#/x/LL-01'
    const App = await loadApp()
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await screen.findByText('Step 1 of 6')
    go('#/m/linked-lists')
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    expect(navigation(await delivered(calls))).toEqual([
      { event_type: 'exercise_started', module_id: 'linked-lists', exercise_id: 'LL-01' },
      { event_type: 'module_selected', module_id: 'linked-lists' },
    ])
  })
})
