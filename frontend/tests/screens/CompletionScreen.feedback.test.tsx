// @vitest-environment jsdom
// M8 placement and failure isolation on the completion experience
// (docs/PRODUCT.md §5, docs/TESTING.md §M8 FB7). Driven through the real App
// at the network boundary.
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ll01 } from '../../src/content/ll01'
import { API_BASE, hidePage, installFetch, settle, type FetchCall } from '../fixtures/analyticsWire'
import { FEEDBACK_ERROR_COPY, FEEDBACK_THANKS_COPY, feedbackBodies, feedbackCalls } from '../fixtures/feedbackWire'

const plain = (text: string) => text.replace(/`/g, '').replace(/\*/g, '')
const GOLDEN = ['b', 'c', 'd', 'a', 'd', 'c']
type User = ReturnType<typeof userEvent.setup>

async function loadApp(env = API_BASE): Promise<ComponentType> {
  vi.stubEnv('VITE_API_BASE_URL', env)
  vi.resetModules()
  return (await import('../../src/App')).default
}

async function playLL01(user: User) {
  for (let step = 0; step < GOLDEN.length; step++) {
    const choice = ll01.checkpoints[step].choices.find((c) => c.id === GOLDEN[step])!
    await user.click(await screen.findByRole('radio', { name: plain(choice.text) }))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
  }
  await screen.findByRole('heading', { name: 'Exercise complete' })
}

async function toCompletion(responder?: Parameters<typeof installFetch>[0], env?: string) {
  const { calls } = installFetch(responder ?? (() => ({ status: 201 })))
  window.location.hash = '#/x/LL-01'
  const App = await loadApp(env)
  const user = userEvent.setup()
  render(<App />)
  await playLL01(user)
  return { user, calls }
}

const feedbackHeading = () => screen.queryByRole('heading', { name: 'Help improve TraceDS' })

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = '#/'
})
afterEach(async () => {
  await hidePage()
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('placement', () => {
  it('feedback appears on the completion screen only (control: absent on landing, module, and exercise screens)', async () => {
    installFetch()
    window.location.hash = '#/'
    const App = await loadApp()
    const user = userEvent.setup()
    render(<App />)
    expect(feedbackHeading()).toBeNull()
    act(() => {
      window.location.hash = '#/m/linked-lists'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })
    expect(feedbackHeading()).toBeNull()
    act(() => {
      window.location.hash = '#/x/LL-01'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByText('Step 1 of 6')
    expect(feedbackHeading()).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    // Positive control: the same app shows it once the exercise is finished.
    await playLL01(user)
    expect(feedbackHeading()).toBeTruthy()
  })

  it('the feedback section is secondary: it follows the completion actions in the document', async () => {
    await toCompletion()
    const heading = feedbackHeading()!
    for (const name of ['Practice another exercise', 'Back to Linked Lists', 'Restart this exercise']) {
      const link = screen.getByRole('link', { name })
      expect(
        link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${name} should come before the feedback section`,
      ).toBeTruthy()
    }
  })

  it('the feedback section is not a modal and does not take focus on arrival', async () => {
    await toCompletion()
    expect(screen.queryByRole('dialog')).toBeNull()
    const form = feedbackHeading()!.closest('section')!
    expect(form.contains(document.activeElement)).toBe(false)
  })

  it('does not render while feedback is not configured, and completion is unaffected', async () => {
    await toCompletion(undefined, '')
    expect(feedbackHeading()).toBeNull()
    expect(screen.getByRole('link', { name: 'Practice another exercise' })).toBeTruthy()
  })
})

describe('FB7 completion actions work without feedback', () => {
  it('Practice another exercise navigates with the survey untouched', async () => {
    const { user, calls } = await toCompletion()
    await user.click(screen.getByRole('link', { name: 'Practice another exercise' }))
    expect(await screen.findByText(/Step 1 of/)).toBeTruthy()
    expect(window.location.hash).toBe('#/x/LL-02')
    expect(feedbackHeading()).toBeNull()
    expect(feedbackCalls(calls)).toHaveLength(0)
  })

  it('Back to Linked Lists and Restart work too', async () => {
    const first = await toCompletion()
    await first.user.click(screen.getByRole('link', { name: 'Back to Linked Lists' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })).toBeTruthy()
    cleanup()
    window.localStorage.clear()

    const second = await toCompletion()
    await second.user.click(screen.getByRole('link', { name: 'Restart this exercise' }))
    expect(await screen.findByText('Step 1 of 6')).toBeTruthy()
    expect(feedbackCalls(second.calls)).toHaveLength(0)
  })

  it('a half-filled survey does not block leaving, and nothing is sent', async () => {
    const { user, calls } = await toCompletion()
    await user.click(screen.getByRole('radio', { name: '2' }))
    await user.type(screen.getByRole('textbox', { name: /What should I improve\?/ }), 'unfinished')
    await user.click(screen.getByRole('link', { name: 'Practice another exercise' }))
    expect(await screen.findByText(/Step 1 of/)).toBeTruthy()
    await settle()
    expect(feedbackCalls(calls)).toHaveLength(0)
  })
})

describe('failure isolation', () => {
  it('a slow feedback request never prevents starting another exercise', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user, calls } = await toCompletion((call: FetchCall) =>
      call.url.endsWith('/feedback') ? new Promise(() => {}) : { status: 202 },
    )
    await user.click(screen.getByRole('radio', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Submit feedback' }))
    expect(feedbackCalls(calls)).toHaveLength(1)
    expect((screen.getByRole('button', { name: /Sending/ }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('link', { name: 'Practice another exercise' }))
    expect(await screen.findByText(/Step 1 of/)).toBeTruthy()
    expect(window.location.hash).toBe('#/x/LL-02')
    expect(errors).not.toHaveBeenCalled()
  })

  it('a failing feedback backend leaves completion state and navigation intact', async () => {
    const { user, calls } = await toCompletion((call: FetchCall) => ({ status: call.url.endsWith('/feedback') ? 500 : 202 }))
    await user.click(screen.getByRole('radio', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Submit feedback' }))
    await screen.findByText(FEEDBACK_ERROR_COPY)

    expect(screen.getByRole('heading', { name: 'Exercise complete' })).toBeTruthy()
    expect(window.location.hash).toBe('#/x/LL-01/done')
    expect(JSON.parse(window.localStorage.getItem('traceds.completed')!)).toEqual(['LL-01'])
    expect(document.body.textContent).toContain('6 of 6 correct on the first try')
    await user.click(screen.getByRole('link', { name: 'Practice another exercise' }))
    expect(await screen.findByText(/Step 1 of/)).toBeTruthy()
    expect(feedbackCalls(calls)).toHaveLength(1)
  })

  it('a network failure on feedback raises no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const { user } = await toCompletion((call: FetchCall) => {
      if (call.url.endsWith('/feedback')) throw new TypeError('Failed to fetch')
      return { status: 202 }
    })
    await user.click(screen.getByRole('radio', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Submit feedback' }))
    await screen.findByText(FEEDBACK_ERROR_COPY)
    await settle()
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('success via the real completion screen sends this session’s payload and acknowledges once', async () => {
    const { user, calls } = await toCompletion()
    await user.click(screen.getByRole('radio', { name: '4' }))
    await user.selectOptions(screen.getByRole('combobox', { name: /What should I add more practice for\?/ }), 'Stacks')
    await user.click(screen.getByRole('button', { name: 'Submit feedback' }))
    expect(await screen.findByText(FEEDBACK_THANKS_COPY)).toBeTruthy()
    expect(feedbackBodies(calls)).toEqual([
      { session_id: window.localStorage.getItem('traceds.sessionId'), helpfulness: 4, requested_topic: 'stacks' },
    ])
    expect(feedbackHeading()).toBeNull()
    expect(screen.getByRole('link', { name: 'Practice another exercise' })).toBeTruthy()
  })
})
