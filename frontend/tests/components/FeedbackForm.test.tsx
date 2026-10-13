// @vitest-environment jsdom
// FB1–FB5, FB7 and the M8 frontend list (docs/TESTING.md §M8, docs/ANALYTICS.md
// §5). The form is observed through the DOM and the network boundary only.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE, UUID, allEvents, hidePage, installFetch, settle, type FetchCall } from '../fixtures/analyticsWire'
import {
  FEEDBACK_ERROR_COPY, FEEDBACK_THANKS_COPY, TOPICS, feedbackBodies, feedbackCalls,
} from '../fixtures/feedbackWire'

type FormProps = { exercise: { id: string; moduleId: string } }
const EXERCISE = { id: 'LL-01', moduleId: 'linked-lists' }
const SESSION = '6f1c2f6e-9c1d-4a53-8f55-0a1b2c3d4e5f'

async function loadForm(env: string | undefined = API_BASE): Promise<ComponentType<FormProps>> {
  vi.stubEnv('VITE_API_BASE_URL', env ?? '')
  vi.resetModules()
  return (await import('../../src/components/FeedbackForm')).FeedbackForm as ComponentType<FormProps>
}

type Setup = { user: ReturnType<typeof userEvent.setup>; calls: FetchCall[] }
async function setup(responder?: Parameters<typeof installFetch>[0]): Promise<Setup> {
  const { calls } = installFetch(responder ?? (() => ({ status: 201 })))
  const Form = await loadForm()
  const user = userEvent.setup()
  render(<Form exercise={EXERCISE} />)
  return { user, calls }
}

const rating = (n: number) => screen.getByRole('radio', { name: String(n) })
const submitButton = () => screen.getByRole('button', { name: 'Submit feedback' })
const topicSelect = () => screen.getByRole('combobox', { name: /What should I add more practice for\?/ })
const commentsBox = () => screen.getByRole('textbox', { name: /What should I improve\?/ }) as HTMLTextAreaElement

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('traceds.sessionId', SESSION)
})
afterEach(async () => {
  vi.useRealTimers()
  await hidePage()
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('FB1/FB2 the form', () => {
  it('asks the three questions with a labelled, understandable scale', async () => {
    await setup()
    expect(screen.getByRole('heading', { name: 'Help improve TraceDS' })).toBeTruthy()
    const group = screen.getByRole('radiogroup', { name: 'How helpful was TraceDS for studying?' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => (r as HTMLInputElement).labels?.[0]?.textContent?.trim())).toEqual(['1', '2', '3', '4', '5'])
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true)
    // The scale is explained in words, not only digits.
    expect(within(group.parentElement!).getByText('Not helpful')).toBeTruthy()
    expect(within(group.parentElement!).getByText('Very helpful')).toBeTruthy()
    expect(topicSelect()).toBeTruthy()
    expect(commentsBox()).toBeTruthy()
  })

  it('lists exactly the six approved topics (human-readable) after an empty default', async () => {
    await setup()
    const select = topicSelect() as HTMLSelectElement
    const options = [...select.options]
    expect(options[0].value).toBe('')
    expect(options.slice(1).map((o) => [o.textContent, o.value])).toEqual(TOPICS)
    expect(select.value).toBe('')
  })

  it('limits comments to 2000 characters, says so, and shows the no-PII notice', async () => {
    const { user } = await setup()
    expect(commentsBox().getAttribute('maxlength')).toBe('2000')
    expect(screen.getByText("Please don't include your name, email, or student ID.")).toBeTruthy()
    expect(screen.getByText('0 / 2000')).toBeTruthy()
    await user.type(commentsBox(), 'hello')
    expect(screen.getByText('5 / 2000')).toBeTruthy()
  })

  it('cannot hold more than 2000 characters, even when pasted', async () => {
    const { user } = await setup()
    await user.click(commentsBox())
    await user.paste('x'.repeat(2005))
    expect(commentsBox().value).toHaveLength(2000)
    expect(screen.getByText('2000 / 2000')).toBeTruthy()
  })

  it('FB1: Submit is disabled, with a reason, until a rating is chosen', async () => {
    const { user, calls } = await setup()
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Choose a rating/i)).toBeTruthy()
    await user.click(submitButton())
    expect(feedbackCalls(calls)).toHaveLength(0)
    await user.click(rating(3))
    expect((rating(3) as HTMLInputElement).checked).toBe(true)
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('a form submit event without a rating sends nothing', async () => {
    const { calls } = await setup()
    fireEvent.submit(submitButton().closest('form')!)
    await settle()
    expect(feedbackCalls(calls)).toHaveLength(0)
  })

  it('is not rendered at all when analytics/feedback is not configured (positive control: it renders when configured)', async () => {
    const { calls } = installFetch()
    const Form = await loadForm('')
    const { unmount } = render(<Form exercise={EXERCISE} />)
    expect(screen.queryByRole('heading', { name: 'Help improve TraceDS' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit feedback' })).toBeNull()
    expect(calls).toHaveLength(0)
    unmount()
    const Configured = await loadForm(API_BASE)
    render(<Configured exercise={EXERCISE} />)
    expect(screen.getByRole('heading', { name: 'Help improve TraceDS' })).toBeTruthy()
  })
})

describe('FB3 submission', () => {
  it('sends exactly {session_id, helpfulness} when only a rating is chosen', async () => {
    const { user, calls } = await setup()
    await user.click(rating(4))
    await user.click(submitButton())
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackBodies(calls)).toEqual([{ session_id: SESSION, helpfulness: 4 }])
    const init = feedbackCalls(calls)[0].init!
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('sends the topic and comments when given, and nothing else', async () => {
    const { user, calls } = await setup()
    await user.click(rating(5))
    await user.selectOptions(topicSelect(), 'Arrays vs. linked lists')
    await user.type(commentsBox(), 'More pointer diagrams, please')
    await user.click(submitButton())
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackBodies(calls)).toEqual([
      { session_id: SESSION, helpfulness: 5, requested_topic: 'arrays-vs-linked-lists', comments: 'More pointer diagrams, please' },
    ])
  })

  it.each(TOPICS)('topic "%s" is sent as %s', async (label, value) => {
    const { user, calls } = await setup()
    await user.click(rating(1))
    await user.selectOptions(topicSelect(), label)
    await user.click(submitButton())
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackBodies(calls)[0]).toEqual({ session_id: SESSION, helpfulness: 1, requested_topic: value })
  })

  it('omits empty and whitespace-only comments (the API rejects explicit null) and trims the rest', async () => {
    const first = await setup()
    await first.user.click(rating(2))
    await first.user.type(commentsBox(), '   \n  ')
    await first.user.click(submitButton())
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackBodies(first.calls)).toEqual([{ session_id: SESSION, helpfulness: 2 }])
    cleanup()

    const second = await setup()
    await second.user.click(rating(2))
    await second.user.type(commentsBox(), '  spaced out  ')
    await second.user.click(submitButton())
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackBodies(second.calls)).toEqual([{ session_id: SESSION, helpfulness: 2, comments: 'spaced out' }])
  })

  it('uses the existing anonymous session id and collects nothing identifying', async () => {
    const { user, calls } = await setup()
    await user.click(rating(3))
    await user.click(submitButton())
    await screen.findByText(FEEDBACK_THANKS_COPY)
    const [body] = feedbackBodies(calls)
    expect(body.session_id).toBe(SESSION)
    expect(body.session_id as string).toMatch(UUID)
    expect(Object.keys(body).every((k) => ['session_id', 'helpfulness', 'requested_topic', 'comments'].includes(k))).toBe(true)
    expect(JSON.stringify(feedbackCalls(calls)[0].init)).not.toMatch(/user-?agent|email|student|@/i)
    expect(screen.queryByRole('textbox', { name: /name|email|student/i })).toBeNull()
  })

  it('records survey_submitted (module and exercise only) in addition to the feedback request', async () => {
    const { user, calls } = await setup()
    await user.click(rating(4))
    await user.click(submitButton())
    await screen.findByText(FEEDBACK_THANKS_COPY)
    await act(() => hidePage())
    const surveys = allEvents(calls).filter((e) => e.event_type === 'survey_submitted')
    expect(surveys).toHaveLength(1)
    expect(surveys[0]).toMatchObject({ module_id: 'linked-lists', exercise_id: 'LL-01' })
    expect(Object.keys(surveys[0]).sort()).toEqual(['client_ts', 'event_id', 'event_type', 'exercise_id', 'module_id'])
  })

  it('shows the thanks acknowledgement in a live region and no second survey', async () => {
    const { user } = await setup()
    await user.click(rating(4))
    await user.click(submitButton())
    const thanks = await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(thanks.closest('[role="status"]')).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit feedback|try again/i })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

describe('FB5 single submission', () => {
  it('a double click sends one request', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { user, calls } = await setup(async () => {
      await gate
      return { status: 201 }
    })
    await user.click(rating(4))
    await user.dblClick(submitButton())
    expect(feedbackCalls(calls)).toHaveLength(1)
    release()
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackCalls(calls)).toHaveLength(1)
  })

  it('while sending, the button is disabled and says so; nothing else on the page is blocked', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { user } = await setup(async () => {
      await gate
      return { status: 201 }
    })
    await user.click(rating(4))
    await user.click(submitButton())
    const sending = screen.getByRole('button', { name: /Sending/ }) as HTMLButtonElement
    expect(sending.disabled).toBe(true)
    // Inputs stay available while the request is slow; no spinner overlay or modal.
    expect(screen.queryByRole('dialog')).toBeNull()
    release()
    await screen.findByText(FEEDBACK_THANKS_COPY)
  })

  it('pressing Enter twice on the focused button cannot submit twice either', async () => {
    const { user, calls } = await setup()
    await user.click(rating(2))
    submitButton().focus()
    await user.keyboard('{Enter}{Enter}')
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackCalls(calls)).toHaveLength(1)
  })
})

describe('FB4 failure is tolerated and retryable', () => {
  const failures: [string, Parameters<typeof installFetch>[0]][] = [
    ['a 500 response', () => ({ status: 500 })],
    ['a 400 response', () => ({ status: 400 })],
    ['a 413 response', () => ({ status: 413 })],
    ['a network error', () => {
      throw new TypeError('Failed to fetch')
    }],
  ]

  it.each(failures)('%s shows a restrained message, keeps the input, and offers retry', async (_name, responder) => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const { user } = await setup(responder)
    await user.click(rating(2))
    await user.selectOptions(topicSelect(), 'Quicksort')
    await user.type(commentsBox(), 'keep me')
    await user.click(submitButton())

    const message = await screen.findByText(FEEDBACK_ERROR_COPY)
    expect(message.closest('[role="status"], [role="alert"]')).toBeTruthy()
    expect(screen.queryByText(FEEDBACK_THANKS_COPY)).toBeNull()
    // No technical detail leaks into the page.
    expect(document.body.textContent).not.toMatch(/\b(400|413|500)\b|TypeError|Failed to fetch|internal error|SQL|undefined/i)
    // Input is preserved and the form is usable again.
    expect((rating(2) as HTMLInputElement).checked).toBe(true)
    expect((topicSelect() as HTMLSelectElement).value).toBe('quicksort')
    expect(commentsBox().value).toBe('keep me')
    const retry = screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement
    expect(retry.disabled).toBe(false)
    await settle()
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('retry sends the same payload again and can succeed; there is no automatic retry loop', async () => {
    let n = 0
    const { user, calls } = await setup(() => ({ status: ++n === 1 ? 503 : 201 }))
    await user.click(rating(3))
    await user.type(commentsBox(), 'again')
    await user.click(submitButton())
    await screen.findByText(FEEDBACK_ERROR_COPY)
    await settle()
    expect(feedbackCalls(calls)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackBodies(calls)).toEqual([
      { session_id: SESSION, helpfulness: 3, comments: 'again' },
      { session_id: SESSION, helpfulness: 3, comments: 'again' },
    ])
    expect(screen.queryByText(FEEDBACK_ERROR_COPY)).toBeNull()
  })

  it('a request that never answers ends in the same message after 10 s, never a hang', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { calls } = installFetch(() => new Promise(() => {}))
    const Form = await loadForm()
    render(<Form exercise={EXERCISE} />)
    fireEvent.click(rating(4))
    fireEvent.click(submitButton())
    expect(feedbackCalls(calls)).toHaveLength(1)

    await act(async () => void vi.advanceTimersByTime(9_000))
    expect(screen.queryByText(FEEDBACK_ERROR_COPY)).toBeNull()
    expect((screen.getByRole('button', { name: /Sending/ }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => void vi.advanceTimersByTime(2_000))
    expect(screen.getByText(FEEDBACK_ERROR_COPY)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('leaving while the request is pending (unmount) is silent', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { user } = await setup(async () => {
      await gate
      return { status: 500 }
    })
    await user.click(rating(4))
    await user.click(submitButton())
    cleanup()
    release()
    await settle()
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  it('a thrown fetch implementation or missing fetch cannot break the page', async () => {
    vi.stubGlobal('fetch', undefined)
    const Form = await loadForm()
    const user = userEvent.setup()
    render(<Form exercise={EXERCISE} />)
    // Without fetch the form is not offered (analytics client is a no-op), and nothing throws.
    expect(screen.queryByRole('button', { name: 'Submit feedback' })).toBeNull()
    expect(user).toBeTruthy()
  })
})

describe('accessibility and keyboard (FB1, FB7)', () => {
  it('every control has a meaningful accessible name', async () => {
    await setup()
    for (const n of [1, 2, 3, 4, 5]) expect(rating(n)).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'How helpful was TraceDS for studying?' })).toBeTruthy()
    expect(topicSelect()).toBeTruthy()
    expect(commentsBox()).toBeTruthy()
    expect(submitButton()).toBeTruthy()
    // The character counter and notice are tied to the textarea.
    const describedBy = commentsBox().getAttribute('aria-describedby')!.split(' ')
    const text = describedBy.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
    expect(text).toContain('2000')
    expect(text).toContain("Please don't include your name, email, or student ID.")
  })

  it('the whole form works from the keyboard', async () => {
    const { user, calls } = await setup()
    await user.tab() // first stop after the page: the rating group
    const first = document.activeElement as HTMLInputElement
    expect(first.getAttribute('type')).toBe('radio')
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect((rating(3) as HTMLInputElement).checked).toBe(true)
    await user.tab()
    expect(document.activeElement).toBe(topicSelect())
    // (Native <select> type-ahead is a browser behaviour jsdom does not simulate; the topic is left empty here.)
    await user.tab()
    expect(document.activeElement).toBe(commentsBox())
    await user.keyboard('via keyboard')
    await user.tab()
    expect(document.activeElement).toBe(submitButton())
    await user.keyboard('{Enter}')
    await screen.findByText(FEEDBACK_THANKS_COPY)
    expect(feedbackBodies(calls)).toEqual([
      { session_id: SESSION, helpfulness: 3, comments: 'via keyboard' },
    ])
  })

  it('is a section, not a modal: no dialog role, no focus trap, nothing aria-modal', async () => {
    await setup()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[aria-modal]')).toBeNull()
  })
})
