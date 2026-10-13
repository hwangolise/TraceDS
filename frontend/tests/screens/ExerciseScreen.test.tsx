// @vitest-environment jsdom
// M3 exercise screen tests S1–S7 plus component-level golden paths
// (docs/TESTING.md §M3, docs/PRODUCT.md §4, §9).

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ll01 } from '../../src/content/ll01'
import { ll02 } from '../../src/content/ll02'
import type { Exercise } from '../../src/engine/types'
import { ExerciseScreen } from '../../src/screens/ExerciseScreen'
import { describe as describeState } from '../../src/viz/describe'

afterEach(cleanup)

/** Content text without the inline markdown markers the UI renders as formatting. */
const plain = (text: string) => text.replace(/`/g, '').replace(/\*/g, '')

function setup(exercise: Exercise = ll01) {
  const onComplete = vi.fn()
  const user = userEvent.setup()
  render(<ExerciseScreen exercise={exercise} onComplete={onComplete} />)
  return { user, onComplete }
}

const checkButton = () => screen.getByRole('button', { name: 'Check answer' })
const radio = (exercise: Exercise, step: number, choiceId: string) =>
  screen.getByRole('radio', { name: plain(exercise.checkpoints[step].choices.find((c) => c.id === choiceId)!.text) })
const description = () => screen.getByRole('figure').querySelector('figcaption')!.textContent
const feedback = () => screen.getByTestId('feedback')
const highlightedLines = () =>
  within(screen.getByRole('list', { name: 'Java code' }))
    .getAllByRole('listitem')
    .filter((li) => li.getAttribute('aria-current') === 'step')
    .map((li) => Number(li.getAttribute('data-line')))

async function answer(user: ReturnType<typeof userEvent.setup>, exercise: Exercise, step: number, choiceId: string) {
  await user.click(radio(exercise, step, choiceId))
  await user.click(checkButton())
}

describe('ExerciseScreen — question (S1)', () => {
  it('renders the code, highlights the current line, and shows the question and choices', () => {
    setup()
    const code = screen.getByRole('list', { name: 'Java code' })
    expect(within(code).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      ll01.code.map((line) => expect.stringContaining(line.trim())),
    )
    expect(highlightedLines()).toEqual([1])
    expect(screen.getByText('Step 1 of 6')).toBeTruthy()
    expect(screen.getByRole('group', { name: plain(ll01.checkpoints[0].question) })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('shows the initial memory state', () => {
    setup()
    expect(description()).toBe(describeState(ll01.initialState))
  })

  it('selecting a choice does not submit; Check is disabled until a choice is selected', async () => {
    const { user } = setup()
    expect((checkButton() as HTMLButtonElement).disabled).toBe(true)
    await user.click(radio(ll01, 0, 'b'))
    expect((checkButton() as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('Step 1 of 6')).toBeTruthy()
    expect(screen.queryByTestId('feedback')?.textContent ?? '').not.toMatch(/Correct|Not quite/)
    expect(description()).toBe(describeState(ll01.initialState))
  })

  it('shows the focus label for checkpoints that evaluate part of a line (LL-02)', () => {
    setup(ll02)
    expect(screen.getByText('Node cur = head')).toBeTruthy()
    expect(highlightedLines()).toEqual([1])
  })

  it('shows printed output for LL-02 as it accumulates', async () => {
    const { user } = setup(ll02)
    const output = () => screen.getByRole('region', { name: 'Output' }).textContent
    expect(output()).toContain('No output yet')
    await answer(user, ll02, 0, 'b')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await answer(user, ll02, 1, 'a')
    expect(output()).toContain('3')
    expect(output()).not.toContain('No output yet')
  })

  it('LL-01 has no println, so it shows no output panel', () => {
    setup(ll01)
    expect(screen.getByRole('list', { name: 'Java code' })).toBeTruthy() // the screen did render
    expect(screen.queryByRole('region', { name: 'Output' })).toBeNull()
  })

  it('offers the Node class reference for the exercise', () => {
    setup()
    const details = screen.getByText('Node class').closest('details')!
    expect(details.textContent).toContain('public int data;')
    expect(details.textContent).not.toContain('digit')
  })
})

describe('ExerciseScreen — incorrect answer (S2, S7)', () => {
  it('does not advance, keeps the state, shows the misconception hint, and disables only that choice', async () => {
    const { user } = setup()
    await answer(user, ll01, 0, 'a')
    expect(screen.getByText('Step 1 of 6')).toBeTruthy()
    expect(description()).toBe(describeState(ll01.initialState))
    expect(highlightedLines()).toEqual([1])
    expect(feedback().textContent).toContain('Not quite')
    expect(feedback().textContent).toContain(plain(ll01.checkpoints[0].choices[0].misconception!.hint))
    expect((radio(ll01, 0, 'a') as HTMLInputElement).disabled).toBe(true)
    for (const id of ['b', 'c', 'd']) expect((radio(ll01, 0, id) as HTMLInputElement).disabled).toBe(false)
    // The correct answer is not revealed.
    expect(feedback().textContent).not.toContain(plain(ll01.checkpoints[0].choices[1].text))
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    // Selection is cleared, so Check is disabled again.
    expect((checkButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('S7 communicates incorrectness with text and an icon that has an accessible name, and moves focus to the hint', async () => {
    const { user } = setup()
    await answer(user, ll01, 0, 'c')
    expect(within(feedback()).getByRole('img', { name: 'Incorrect' })).toBeTruthy()
    expect(feedback().getAttribute('aria-live')).toBe('polite')
    expect(feedback().contains(document.activeElement)).toBe(true)
  })

  it('retry works: a different choice can be checked after a wrong one', async () => {
    const { user } = setup()
    await answer(user, ll01, 0, 'a')
    await answer(user, ll01, 0, 'd')
    expect(feedback().textContent).toContain(plain(ll01.checkpoints[0].choices[3].misconception!.hint))
    await answer(user, ll01, 0, 'b')
    expect(feedback().textContent).toContain('Correct')
  })
})

describe('ExerciseScreen — correct answer and Continue (S3)', () => {
  it('enters review: shows Correct, the explanation, the resulting state, and focuses Continue', async () => {
    const { user } = setup()
    await answer(user, ll01, 0, 'b')
    expect(within(feedback()).getByRole('img', { name: 'Correct' })).toBeTruthy()
    expect(feedback().textContent).toContain(plain(ll01.checkpoints[0].explanation))
    expect(description()).toBe(describeState(ll01.checkpoints[0].resultState))
    const cont = screen.getByRole('button', { name: 'Continue' })
    expect(document.activeElement).toBe(cont)
    // Still on step 1 until Continue; choices are locked; the chosen answer stays visible.
    expect(screen.getByText('Step 1 of 6')).toBeTruthy()
    expect(screen.getAllByRole('radio').every((r) => (r as HTMLInputElement).disabled)).toBe(true)
    expect((radio(ll01, 0, 'b') as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByRole('button', { name: 'Check answer' })).toBeNull()
  })

  it('Continue advances exactly one checkpoint and updates progress and the highlighted line', async () => {
    const { user } = setup()
    await answer(user, ll01, 0, 'b')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Step 2 of 6')).toBeTruthy()
    expect(highlightedLines()).toEqual([2])
    expect(screen.getByRole('group', { name: plain(ll01.checkpoints[1].question) })).toBeTruthy()
    expect(description()).toBe(describeState(ll01.checkpoints[0].resultState))
    expect(screen.queryByTestId('feedback')?.textContent ?? '').toBe('')
    expect(screen.getAllByRole('radio').some((r) => (r as HTMLInputElement).disabled)).toBe(false)
  })
})

describe('ExerciseScreen — restart (S5)', () => {
  it('Restart returns to step 1 with the initial state', async () => {
    const { user } = setup()
    await answer(user, ll01, 0, 'b')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await answer(user, ll01, 1, 'a')
    await user.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.getByText('Step 1 of 6')).toBeTruthy()
    expect(description()).toBe(describeState(ll01.initialState))
    expect(screen.getAllByRole('radio').some((r) => (r as HTMLInputElement).disabled)).toBe(false)
  })
})

describe('ExerciseScreen — keyboard only (S6)', () => {
  it('completes a checkpoint with Tab, arrow keys, Space, and Enter', async () => {
    const { user } = setup()
    // Tab until a radio has focus.
    for (let i = 0; i < 20 && (document.activeElement as HTMLInputElement | null)?.type !== 'radio'; i++) await user.tab()
    expect((document.activeElement as HTMLInputElement).type).toBe('radio')
    // Arrow keys move and select within the group; land on choice b.
    await user.keyboard('{ArrowDown}')
    if ((document.activeElement as HTMLInputElement).value !== 'b') await user.keyboard('{ArrowUp}')
    await user.keyboard(' ')
    expect((document.activeElement as HTMLInputElement).value).toBe('b')
    await user.tab()
    expect(document.activeElement).toBe(checkButton())
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continue' }))
    await user.keyboard('{Enter}')
    expect(screen.getByText('Step 2 of 6')).toBeTruthy()
  })
})

describe.each([
  ['LL-01', ll01, ['b', 'c', 'd', 'a', 'd', 'c']],
  ['LL-02', ll02, ['b', 'a', 'b', 'c', 'a', 'b', 'c', 'b']],
] as const)('%s golden path at component level (S4)', (_id, exercise, golden) => {
  it('completes every checkpoint and reports results once', async () => {
    const { user, onComplete } = setup(exercise)
    const total = exercise.checkpoints.length
    for (let step = 0; step < total; step++) {
      expect(screen.getByText(`Step ${step + 1} of ${total}`)).toBeTruthy()
      expect(highlightedLines()).toEqual(exercise.checkpoints[step].lines)
      await answer(user, exercise, step, golden[step])
      expect(description()).toBe(describeState(exercise.checkpoints[step].resultState))
      expect(onComplete).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Continue' }))
    }
    expect(onComplete).toHaveBeenCalledTimes(1)
    const results = onComplete.mock.calls[0][0]
    expect(results).toHaveLength(total)
    expect(results.every((r: { attempts: number }) => r.attempts === 1)).toBe(true)
  })
})
