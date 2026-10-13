// @vitest-environment jsdom
// F-A3, F-A4, F-A5, F-A6, F-A9, F-A13 — learning events emitted by the
// exercise screen, observed at the network boundary (docs/ANALYTICS.md §3,
// §7; docs/ARCHITECTURE.md §8, ADR-7).
//
// Expected payloads are handwritten from docs/EXERCISES.md (LL-01 step ids,
// concepts, and misconceptions), not read from the content files. Content
// files are only used to find the radio button to click.

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ll01 } from '../../src/content/ll01'
import type { Exercise, StepResult } from '../../src/engine/types'
import {
  API_BASE, ISO_8601, UUID, allEvents, blockLocalStorageAccess, eventBatches, hidePage, installFetch,
  settle, withoutGenerated, type FetchCall, type WireEvent,
} from '../fixtures/analyticsWire'

type ScreenProps = { exercise: Exercise; onComplete: (results: StepResult[]) => void }

const plain = (text: string) => text.replace(/`/g, '').replace(/\*/g, '')
const LL01_GOLDEN = ['b', 'c', 'd', 'a', 'd', 'c']

/** Fresh module graph with analytics configured, like a page load with VITE_API_BASE_URL set. */
async function loadScreen(): Promise<ComponentType<ScreenProps>> {
  vi.stubEnv('VITE_API_BASE_URL', API_BASE)
  vi.resetModules()
  return (await import('../../src/screens/ExerciseScreen')).ExerciseScreen
}

async function setup() {
  const Screen = await loadScreen()
  const onComplete = vi.fn()
  const user = userEvent.setup()
  render(<Screen exercise={ll01} onComplete={onComplete} />)
  return { user, onComplete }
}

type User = ReturnType<typeof userEvent.setup>

async function check(user: User, step: number, choiceId: string) {
  const choice = ll01.checkpoints[step].choices.find((c) => c.id === choiceId)!
  await user.click(screen.getByRole('radio', { name: plain(choice.text) }))
  await user.click(screen.getByRole('button', { name: 'Check answer' }))
}
const proceed = (user: User) => user.click(screen.getByRole('button', { name: 'Continue' }))
const restart = (user: User) => user.click(screen.getByRole('button', { name: 'Restart' }))

async function playGolden(user: User, { continueAfterLast = true } = {}) {
  for (let step = 0; step < LL01_GOLDEN.length; step++) {
    await check(user, step, LL01_GOLDEN[step])
    if (step < LL01_GOLDEN.length - 1 || continueAfterLast) await proceed(user)
  }
}

/** Everything delivered so far, after forcing a flush. */
async function delivered(calls: FetchCall[]): Promise<WireEvent[]> {
  await act(() => hidePage())
  return allEvents(calls)
}

const ofType = (events: WireEvent[], type: string) => events.filter((e) => e.event_type === type)

const LL01 = { module_id: 'linked-lists', exercise_id: 'LL-01' }
const answer = (step_id: string, choice_id: string, correct: boolean, attempt_number: number, concept_id: string, misconception_id?: string) => ({
  event_type: 'answer_submitted', ...LL01, step_id, choice_id, correct, attempt_number, concept_id,
  ...(misconception_id ? { misconception_id } : {}),
})
const hint = (step_id: string, choice_id: string, attempt_number: number, concept_id: string, misconception_id: string) => ({
  event_type: 'hint_shown', ...LL01, step_id, choice_id, attempt_number, concept_id, misconception_id,
})

// ANALYTICS §3: the keys each event type may carry (R ∪ O), plus the common ones.
const COMMON = ['event_id', 'event_type', 'client_ts']
const ALLOWED_KEYS: Record<string, string[]> = {
  session_started: [],
  module_selected: ['module_id'],
  exercise_started: ['module_id', 'exercise_id', 'run_id'],
  answer_submitted: ['module_id', 'exercise_id', 'run_id', 'step_id', 'choice_id', 'correct', 'attempt_number', 'concept_id', 'misconception_id'],
  hint_shown: ['module_id', 'exercise_id', 'run_id', 'step_id', 'choice_id', 'attempt_number', 'concept_id', 'misconception_id'],
  exercise_completed: ['module_id', 'exercise_id', 'run_id'],
}
const REQUIRED_KEYS: Record<string, string[]> = {
  ...ALLOWED_KEYS,
  answer_submitted: ['module_id', 'exercise_id', 'run_id', 'step_id', 'choice_id', 'correct', 'attempt_number', 'concept_id'],
}

let calls: FetchCall[]
beforeEach(() => {
  window.localStorage.clear()
  calls = installFetch().calls
})
afterEach(async () => {
  await hidePage() // drain anything still queued into this test's fetch stub
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('event payloads for a full LL-01 run (F-A5)', () => {
  it('emits exactly the documented sequence, with handwritten values', async () => {
    const { user } = await setup()
    await check(user, 0, 'a') // wrong first
    await playGolden(user)

    expect(withoutGenerated(await delivered(calls))).toEqual([
      { event_type: 'exercise_started', ...LL01 },
      answer('ll01-c1', 'a', false, 1, 'dynamic-allocation', 'ref-holds-value'),
      hint('ll01-c1', 'a', 1, 'dynamic-allocation', 'ref-holds-value'),
      answer('ll01-c1', 'b', true, 2, 'dynamic-allocation'),
      answer('ll01-c2', 'c', true, 1, 'linking-nodes'),
      answer('ll01-c3', 'd', true, 1, 'aliasing'),
      answer('ll01-c4', 'a', true, 1, 'temp-references'),
      answer('ll01-c5', 'd', true, 1, 'linking-nodes'),
      answer('ll01-c6', 'c', true, 1, 'aliasing'),
      { event_type: 'exercise_completed', ...LL01 },
    ])
  })

  it('every event carries exactly its allowed fields, with all required ones', async () => {
    const { user } = await setup()
    await check(user, 0, 'd')
    await playGolden(user)
    const events = await delivered(calls)
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) {
      const type = String(e.event_type)
      expect(Object.keys(ALLOWED_KEYS), `unexpected event_type ${type}`).toContain(type)
      const keys = Object.keys(e)
      for (const k of keys) expect([...COMMON, ...ALLOWED_KEYS[type]], `${type} must not carry ${k}`).toContain(k)
      for (const k of [...COMMON, ...REQUIRED_KEYS[type]]) expect(keys, `${type} is missing ${k}`).toContain(k)
      for (const [k, v] of Object.entries(e)) expect(v, `${type}.${k} is null`).not.toBeNull()
    }
  })

  it('uses UUID event ids (all distinct), ISO-8601 client timestamps, and one UUID run id per run', async () => {
    const { user } = await setup()
    await playGolden(user)
    const events = await delivered(calls)
    expect(events.length).toBe(8)
    const ids = events.map((e) => e.event_id)
    for (const id of ids) expect(id).toMatch(UUID)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of events) expect(e.client_ts).toMatch(ISO_8601)
    const runIds = new Set(events.map((e) => e.run_id))
    expect(runIds.size).toBe(1)
    expect([...runIds][0]).toMatch(UUID)
  })

  it('sends every batch for one anonymous session: a UUID, the one stored in localStorage', async () => {
    const { user } = await setup()
    await check(user, 0, 'a')
    await playGolden(user)
    await act(() => hidePage())
    const batches = eventBatches(calls)
    expect(batches.length).toBeGreaterThan(0)
    const sessions = new Set(batches.map((b) => b.session_id))
    expect(sessions.size).toBe(1)
    const [session] = sessions
    expect(session).toMatch(UUID)
    expect(window.localStorage.getItem('traceds.sessionId')).toBe(session)
  })
})

describe('exercise_started (ANALYTICS §3)', () => {
  it('is emitted once when the screen starts a run, before any answer', async () => {
    await setup()
    const events = await delivered(calls)
    expect(withoutGenerated(events)).toEqual([{ event_type: 'exercise_started', ...LL01 }])
    expect(events[0].run_id).toMatch(UUID)
  })

  it('is emitted again on Restart, with a new run id', async () => {
    const { user } = await setup()
    await check(user, 0, 'b')
    await proceed(user)
    await restart(user)
    const started = ofType(await delivered(calls), 'exercise_started')
    expect(started).toHaveLength(2)
    expect(started[1].run_id).toMatch(UUID)
    expect(started[1].run_id).not.toBe(started[0].run_id)
  })

  it('does not fire on re-renders that are not new runs (selecting a choice, a wrong answer)', async () => {
    const { user } = await setup()
    await user.click(screen.getAllByRole('radio')[0])
    await check(user, 0, 'c')
    expect(ofType(await delivered(calls), 'exercise_started')).toHaveLength(1)
  })
})

describe('exercise_started under React StrictMode (F-A12; ANALYTICS §3)', () => {
  it('one mount is one run: a single exercise_started; Restart adds exactly one more', async () => {
    const Screen = await loadScreen()
    const user = userEvent.setup()
    render(
      <StrictMode>
        <Screen exercise={ll01} onComplete={vi.fn()} />
      </StrictMode>,
    )
    await check(user, 0, 'b')
    const first = await delivered(calls)
    expect(ofType(first, 'exercise_started')).toHaveLength(1)
    // The answer belongs to the one run that was announced.
    expect(ofType(first, 'answer_submitted').map((e) => e.run_id)).toEqual([ofType(first, 'exercise_started')[0].run_id])

    await restart(user)
    expect(ofType(await delivered(calls), 'exercise_started')).toHaveLength(2)
  })
})

describe('attempt numbers (F-A3)', () => {
  it('counts 1, 2, 3 on one checkpoint and resets to 1 on the next checkpoint', async () => {
    const { user } = await setup()
    await check(user, 0, 'a')
    await check(user, 0, 'c')
    await check(user, 0, 'b')
    await proceed(user)
    await check(user, 1, 'c')
    const answers = ofType(await delivered(calls), 'answer_submitted')
    expect(answers.map((e) => [e.step_id, e.attempt_number, e.correct])).toEqual([
      ['ll01-c1', 1, false],
      ['ll01-c1', 2, false],
      ['ll01-c1', 3, true],
      ['ll01-c2', 1, true],
    ])
  })

  it('resets to 1 on Restart, under the new run id', async () => {
    const { user } = await setup()
    await check(user, 0, 'a')
    await restart(user)
    await check(user, 0, 'a')
    const events = await delivered(calls)
    const starts = ofType(events, 'exercise_started')
    expect(starts).toHaveLength(2)
    const [first, second] = starts
    const answers = ofType(events, 'answer_submitted')
    expect(answers.map((e) => [e.run_id, e.attempt_number])).toEqual([
      [first.run_id, 1],
      [second.run_id, 1],
    ])
  })

  it('keeps every event of a run on that run id', async () => {
    const { user } = await setup()
    await check(user, 0, 'a')
    await check(user, 0, 'b')
    await proceed(user)
    await restart(user)
    await check(user, 0, 'b')
    const events = await delivered(calls)
    const runIds = ofType(events, 'exercise_started').map((e) => e.run_id)
    expect(runIds).toHaveLength(2)
    for (const id of runIds) expect(id).toMatch(UUID)
    const [first, second] = runIds
    expect(first).not.toBe(second)
    expect(events.map((e) => e.run_id)).toEqual([first, first, first, first, second, second])
  })
})

describe('hint_shown paired with incorrect answers (F-A6)', () => {
  it('ll01-c3 choice a: one hint_shown for assignment-copies-object, right after the answer', async () => {
    const { user } = await setup()
    await check(user, 0, 'b')
    await proceed(user)
    await check(user, 1, 'c')
    await proceed(user)
    await check(user, 2, 'a')
    const events = withoutGenerated(await delivered(calls))
    expect(events.slice(-2)).toEqual([
      answer('ll01-c3', 'a', false, 1, 'aliasing', 'assignment-copies-object'),
      hint('ll01-c3', 'a', 1, 'aliasing', 'assignment-copies-object'),
    ])
  })

  it('ll01-c6 choices a then b: two hints, each with its own misconception, then the correct answer', async () => {
    const { user } = await setup()
    for (let step = 0; step < 5; step++) {
      await check(user, step, LL01_GOLDEN[step])
      await proceed(user)
    }
    await check(user, 5, 'a')
    await check(user, 5, 'b')
    await check(user, 5, 'c')
    const events = withoutGenerated(await delivered(calls))
    expect(events.slice(-6)).toEqual([
      answer('ll01-c6', 'a', false, 1, 'aliasing', 'stale-position'),
      hint('ll01-c6', 'a', 1, 'aliasing', 'stale-position'),
      answer('ll01-c6', 'b', false, 2, 'aliasing', 'temp-changes-dont-persist'),
      hint('ll01-c6', 'b', 2, 'aliasing', 'temp-changes-dont-persist'),
      answer('ll01-c6', 'c', true, 3, 'aliasing'),
      { event_type: 'exercise_completed', ...LL01 },
    ])
  })

  it('emits no hint_shown for correct answers (control: the six answers themselves are emitted)', async () => {
    const { user } = await setup()
    await playGolden(user)
    const events = await delivered(calls)
    expect(ofType(events, 'answer_submitted')).toHaveLength(6)
    expect(ofType(events, 'hint_shown')).toHaveLength(0)
  })
})

describe('completion recorded once (F-A4)', () => {
  it('emits exercise_completed on the final correct answer, before Continue is pressed', async () => {
    const { user } = await setup()
    await playGolden(user, { continueAfterLast: false })
    const events = await delivered(calls)
    expect(ofType(events, 'exercise_completed')).toHaveLength(1)
    expect(events.at(-1)?.event_type).toBe('exercise_completed')
  })

  it('emits exactly one completion per run, even after Continue', async () => {
    const { user, onComplete } = await setup()
    await playGolden(user)
    expect(onComplete).toHaveBeenCalledTimes(1)
    const completed = ofType(await delivered(calls), 'exercise_completed')
    expect(completed).toHaveLength(1)
    expect(completed[0].run_id).toMatch(UUID)
  })

  it('a restart and a second completion emit a second exercise_completed with a different run id', async () => {
    const { user } = await setup()
    await playGolden(user, { continueAfterLast: false })
    await restart(user)
    await playGolden(user, { continueAfterLast: false })
    const events = await delivered(calls)
    const started = ofType(events, 'exercise_started')
    const completed = ofType(events, 'exercise_completed')
    expect(completed).toHaveLength(2)
    expect(completed.map((e) => e.run_id)).toEqual(started.map((e) => e.run_id))
    expect(completed[0].run_id).not.toBe(completed[1].run_id)
  })
})

describe('no PII on the wire (F-A13)', () => {
  it('no request carries name, email, student id, IP, or user-agent data', async () => {
    const { user } = await setup()
    await check(user, 0, 'a')
    await playGolden(user)
    await act(() => hidePage())
    expect(calls.length).toBeGreaterThan(0)
    const pii = /"(name|email|e_mail|student_id|studentId|ip|ip_address|user_agent|userAgent)"\s*:/i
    for (const c of calls) {
      const body = String(c.init?.body ?? '')
      expect(body).not.toMatch(pii)
      expect(body).not.toContain(navigator.userAgent)
    }
  })
})

describe('analytics failure does not break learning (F-A9)', () => {
  // Each case breaks one dependency of analytics, completes LL-01 (with a wrong
  // answer), and proves the broken path was actually exercised, so the test
  // cannot pass merely because analytics is absent.

  async function completeLL01() {
    const { user, onComplete } = await setup()
    await check(user, 0, 'a')
    expect(screen.getByTestId('feedback').textContent).toMatch(/Not quite/)
    await playGolden(user)
    expect(onComplete).toHaveBeenCalledTimes(1)
    await act(() => hidePage())
    await settle()
  }

  it('fetch throws synchronously on every call', async () => {
    const throwing = vi.fn(() => {
      throw new Error('network stack exploded')
    })
    vi.stubGlobal('fetch', throwing)
    await completeLL01()
    expect(throwing).toHaveBeenCalled()
  })

  it('every request rejects (API down)', async () => {
    const rejecting = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    vi.stubGlobal('fetch', rejecting)
    await completeLL01()
    expect(rejecting).toHaveBeenCalled()
  })

  it('every request hangs forever (API unreachable or very slow)', async () => {
    const hanging = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', hanging)
    await completeLL01()
    expect(hanging).toHaveBeenCalled()
  })

  it('localStorage throws on every access', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    await completeLL01()
    expect(getItem).toHaveBeenCalledWith('traceds.sessionId')
    expect(fetch).toHaveBeenCalled()
  })

  it('reading localStorage itself throws', async () => {
    const restore = blockLocalStorageAccess()
    try {
      await completeLL01()
      expect(fetch).toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('crypto.randomUUID throws', async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('randomUUID unavailable')
    })
    await completeLL01()
    expect(randomUUID).toHaveBeenCalled()
  })
})
