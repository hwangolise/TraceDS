// P1 golden flow (docs/TESTING.md §M3), on desktop and mobile profiles:
// landing → Linked Lists → LL-01 → wrong answer → hint → retry → correct →
// visualization updates → … → completion screen.

import { expect, test, type Page } from '@playwright/test'

const description = (page: Page) => page.locator('figure figcaption')

async function check(page: Page, choiceName: string | RegExp) {
  await page.getByRole('radio', { name: choiceName }).check()
  await page.getByRole('button', { name: 'Check answer' }).click()
}

test('a student completes LL-01, including a wrong answer and a retry', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn data structures by tracing what Java does to memory.')
  await page.getByRole('link', { name: 'Start practicing' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Linked Lists' })).toBeVisible()
  await page.getByRole('listitem').filter({ hasText: 'LL-01' }).getByRole('link', { name: /Start/ }).click()

  await expect(page.getByText('Step 1 of 6')).toBeVisible()
  await expect(description(page)).toHaveText('No variables yet. Output: none.')

  // Wrong answer: hint, no advance, choice disabled.
  await check(page, 'head holds the value 4 directly; no Node object is created.')
  const feedback = page.getByTestId('feedback')
  await expect(feedback).toContainText('Not quite')
  await expect(feedback).toContainText('head is declared with type Node, not int.')
  await expect(page.getByText('Step 1 of 6')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'head holds the value 4 directly; no Node object is created.' })).toBeDisabled()
  await expect(description(page)).toHaveText('No variables yet. Output: none.')

  // Retry with the correct answer: the visualization updates.
  await check(page, 'head refers to a new Node whose data is 4 and whose next is null.')
  await expect(feedback).toContainText('Correct')
  await expect(description(page)).toContainText('head refers to node 1. Node 1 has data 4, and its next is null.')
  await expect(page.locator('[data-viz-id="obj:A"]')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  // The rest of the golden path.
  const rest: (string | RegExp)[] = [
    /^A new Node containing 7 is created, and the next field of the node containing 4 now refers to it/,
    '2 nodes: head and cur both refer to the node containing 4.',
    /^cur refers to the node containing 7\. head still refers/,
    /^The node containing 7 now links to a new node containing 1/,
    '4, 9, 1',
  ]
  for (const [i, choice] of rest.entries()) {
    await expect(page.getByText(`Step ${i + 2} of 6`)).toBeVisible()
    await check(page, choice)
    await expect(feedback).toContainText('Correct')
    await page.getByRole('button', { name: 'Continue' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Exercise complete' })).toBeVisible()
  await expect(page.getByText('5 of 6 correct on the first try')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Practice another exercise' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Linked Lists' })).toBeVisible()
})

// Found during M3 visual review: content inside the code panel's scroll box
// once widened the whole page on phones. The page itself must never scroll sideways.
test('exercise pages never scroll horizontally at the page level', async ({ page }) => {
  for (const id of ['LL-01', 'LL-02']) {
    await page.goto(`/#/x/${id}`)
    await expect(page.getByText(/^Step 1 of/)).toBeVisible()
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth, id).toBeLessThanOrEqual(clientWidth)
  }
})
