// @vitest-environment jsdom
// M3 student flow: landing → Linked Lists → exercise → completion → another
// exercise (docs/PRODUCT.md §5, docs/ARCHITECTURE.md §5.1).

import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { ll01 } from '../../src/content/ll01'
import type { Exercise } from '../../src/engine/types'

const plain = (text: string) => text.replace(/`/g, '').replace(/\*/g, '')

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = '#/'
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function playGolden(user: ReturnType<typeof userEvent.setup>, exercise: Exercise, golden: string[]) {
  for (let step = 0; step < golden.length; step++) {
    const choice = exercise.checkpoints[step].choices.find((c) => c.id === golden[step])!
    await user.click(await screen.findByRole('radio', { name: plain(choice.text) }))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
  }
}

describe('Landing', () => {
  it('explains the product and offers one clear way to start', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Learn data structures by tracing what Java does to memory.')
    expect(screen.getByText(/Interactive Exam #2 practice\./)).toBeTruthy()
    expect(screen.getByText('No account required.')).toBeTruthy()
    const start = screen.getByRole('link', { name: 'Start practicing' })
    expect(start.getAttribute('href')).toBe('#/m/linked-lists')
    expect(document.body.textContent).not.toMatch(/Recursion|REC-0/)
  })
})

describe('Linked Lists module', () => {
  it('is reachable from the landing page and lists LL-01 and LL-02; LL-03/LL-04 are not yet available', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('link', { name: 'Start practicing' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Linked Lists' })).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('h2')?.textContent)).toEqual([
      'LL-01 References & Node Construction',
      'LL-02 Linked List Traversal',
      'LL-03 Linked List Mutation',
      'LL-04 BigNum Deep Copy',
    ])
    expect(within(items[0]).getByRole('link', { name: /Start/ }).getAttribute('href')).toBe('#/x/LL-01')
    expect(within(items[1]).getByRole('link', { name: /Start/ }).getAttribute('href')).toBe('#/x/LL-02')
    for (const item of items.slice(2)) {
      expect(within(item).queryByRole('link')).toBeNull()
      expect(item.textContent).toContain('Coming next')
    }
    expect(document.body.textContent).not.toMatch(/Recursion|REC-0/)
  })
})

describe('Starting exercises', () => {
  it.each([
    ['LL-01', 'References & Node Construction', 'Step 1 of 6'],
    ['LL-02', 'Linked List Traversal', 'Step 1 of 8'],
  ])('%s can be started from the module page', async (id, title, progress) => {
    const user = userEvent.setup()
    go('#/m/linked-lists')
    render(<App />)
    const item = screen.getAllByRole('listitem').find((li) => li.textContent?.includes(id))!
    await user.click(within(item).getByRole('link', { name: /Start/ }))
    expect(await screen.findByRole('heading', { level: 1, name: `${id} ${title}` })).toBeTruthy()
    expect(screen.getByText(progress)).toBeTruthy()
  })
})

describe('Completion', () => {
  it('finishing LL-01 shows the completion screen, records completion locally, and leads to another exercise', async () => {
    const user = userEvent.setup()
    go('#/x/LL-01')
    render(<App />)
    await playGolden(user, ll01, ['b', 'c', 'd', 'a', 'd', 'c'])
    expect(await screen.findByRole('heading', { name: 'Exercise complete' })).toBeTruthy()
    expect(window.location.hash).toBe('#/x/LL-01/done')
    expect(document.body.textContent).toContain('6 of 6 correct on the first try')
    expect(document.body.textContent).toContain('0 hints')
    expect(JSON.parse(window.localStorage.getItem('traceds.completed')!)).toEqual(['LL-01'])

    await user.click(screen.getByRole('link', { name: 'Practice another exercise' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'LL-02 Linked List Traversal' })).toBeTruthy()
  })

  it('Back to Linked Lists shows LL-01 as completed', async () => {
    const user = userEvent.setup()
    go('#/x/LL-01')
    render(<App />)
    await playGolden(user, ll01, ['b', 'c', 'd', 'a', 'd', 'c'])
    await user.click(await screen.findByRole('link', { name: 'Back to Linked Lists' }))
    const item = (await screen.findAllByRole('listitem')).find((li) => li.textContent?.includes('LL-01'))!
    expect(item.textContent).toContain('Completed')
    expect(within(item).getByRole('link', { name: /Practice again/ })).toBeTruthy()
  })

  it('completion is remembered on this device across visits', () => {
    window.localStorage.setItem('traceds.completed', JSON.stringify(['LL-02']))
    go('#/m/linked-lists')
    render(<App />)
    const item = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('LL-02'))!
    expect(item.textContent).toContain('Completed')
  })

  it('the completion page without a finished run redirects to the exercise', async () => {
    go('#/x/LL-01/done')
    render(<App />)
    expect(await screen.findByText('Step 1 of 6')).toBeTruthy()
    expect(window.location.hash).toBe('#/x/LL-01')
  })
})

describe('Re-entry and resilience', () => {
  it('leaving an exercise and coming back starts again at step 1', async () => {
    const user = userEvent.setup()
    go('#/x/LL-01')
    render(<App />)
    await playGolden(user, ll01, ['b', 'c'])
    expect(screen.getByText('Step 3 of 6')).toBeTruthy()
    go('#/m/linked-lists')
    go('#/x/LL-01')
    expect(await screen.findByText('Step 1 of 6')).toBeTruthy()
  })

  it('works when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const user = userEvent.setup()
    go('#/x/LL-01')
    render(<App />)
    await playGolden(user, ll01, ['b', 'c', 'd', 'a', 'd', 'c'])
    expect(await screen.findByRole('heading', { name: 'Exercise complete' })).toBeTruthy()
  })

  it('unknown routes and unknown exercises show a way home', () => {
    go('#/x/LL-99')
    render(<App />)
    expect(screen.getByRole('link', { name: /home/i }).getAttribute('href')).toBe('#/')
    cleanup()
    go('#/nope')
    render(<App />)
    expect(screen.getByRole('link', { name: /home/i })).toBeTruthy()
  })

  it('LL-03 and LL-04 are not reachable as exercises yet', () => {
    go('#/x/LL-03')
    render(<App />)
    expect(screen.queryByText(/Step 1 of/)).toBeNull()
    expect(screen.getByRole('link', { name: /home/i })).toBeTruthy()
  })
})
