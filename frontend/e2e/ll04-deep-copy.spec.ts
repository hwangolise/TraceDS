// P2 (docs/TESTING.md §M4): complete LL-04 including one shallow-head wrong
// attempt; the original and the copy are both visible as separate lists.

import { expect, test, type Page } from '@playwright/test'

async function check(page: Page, choice: RegExp) {
  await page.getByRole('radio', { name: choice }).check()
  await page.getByRole('button', { name: 'Check answer' }).click()
}

async function next(page: Page) {
  await page.getByRole('button', { name: 'Continue' }).click()
}

test('a student completes LL-04 and sees two distinct lists with equal digits', async ({ page }) => {
  await page.goto('/#/m/linked-lists')
  await page.getByRole('listitem').filter({ hasText: 'LL-04' }).getByRole('link', { name: /Start/ }).click()
  await expect(page.getByText('Step 1 of 8')).toBeVisible()
  await expect(page.locator('[data-viz-id="obj:X"]')).toBeVisible()

  await check(page, /^copy refers to a new, separate BigNum whose mySize is now 3/)
  // The copy's myHead is shown as unspecified, not as null.
  await expect(page.locator('[data-viz-id="obj:Y"]').getByTitle('not shown in this exercise')).toBeVisible()
  await next(page)
  await check(page, /^It's true: myHead \(this BigNum's head\) refers to the node containing 4/)
  await next(page)

  // The headline misconception: a shallow copy of the head.
  await check(page, /^The same node that myHead refers to\. Copying the head reference is enough\./)
  const feedback = page.getByTestId('feedback')
  await expect(feedback).toContainText('Not quite')
  await expect(feedback).toContainText('the two BigNums would share nodes')
  await expect(page.getByText('Step 3 of 8')).toBeVisible()

  await check(page, /^A new, separate node containing 4, whose next is null\./)
  await expect(feedback).toContainText('Correct')
  await expect(page.locator('[data-viz-id="obj:D"]')).toBeVisible()
  await next(page)

  for (const choice of [
    /^newPtr refers to the copy's node containing 4\. origPtr refers to the original node containing 7\./,
    /^It creates a new node containing 7 and links it after the copy's node containing 4\./,
    /^newPtr refers to the copy's node containing 7\. origPtr refers to the original node containing 2\./,
    /^The copy contains 4, 7, 2, and origPtr is null\./,
  ]) {
    await check(page, choice)
    await expect(feedback).toContainText('Correct')
    await next(page)
  }

  await check(page, /^The two BigNums are different objects, and each has its own three nodes/)
  // Final deep-copy state: both BigNums and all six nodes are drawn.
  for (const id of ['X', 'Y', 'A', 'B', 'C', 'D', 'E', 'F']) {
    await expect(page.locator(`[data-viz-id="obj:${id}"]`)).toBeAttached()
  }
  await expect(page.locator('figure figcaption')).toContainText('List from this.myHead: 4 → 7 → 2 → null. List from copy.myHead: 4 → 7 → 2 → null.')
  await next(page)

  await expect(page.getByRole('heading', { name: 'Exercise complete' })).toBeVisible()
  await expect(page.getByText('7 of 8 correct on the first try')).toBeVisible()
})
