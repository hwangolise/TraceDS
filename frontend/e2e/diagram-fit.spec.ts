// Found during M4 visual review: when a state transition added nodes, the
// diagram kept its old zoom and clipped the new ones. On desktop every box must
// be fully visible inside the diagram after each transition.

import { expect, test, type Page } from '@playwright/test'

async function check(page: Page, choice: RegExp) {
  await page.getByRole('radio', { name: choice }).check()
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByTestId('feedback')).toContainText('Correct')
}

async function expectAllBoxesVisible(page: Page) {
  const diagram = page.getByTestId('ll-diagram')
  await page.waitForTimeout(300) // let React Flow finish fitting
  const frame = (await diagram.boundingBox())!
  const boxes = page.locator('[data-testid="ll-diagram"] [data-viz-id]')
  const count = await boxes.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const b = (await boxes.nth(i).boundingBox())!
    const id = await boxes.nth(i).getAttribute('data-viz-id')
    expect(b.x, id!).toBeGreaterThanOrEqual(frame.x - 1)
    expect(b.x + b.width, id!).toBeLessThanOrEqual(frame.x + frame.width + 1)
  }
}

test.describe('diagram fits after transitions (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'phones scroll wide diagrams inside the box by design')

  test('LL-03 after the insertion adds a node', async ({ page }) => {
    await page.goto('/#/x/LL-03')
    await check(page, /^2, 5, 6, 9$/)
    await expectAllBoxesVisible(page)
  })

  test('LL-04 final deep-copy state', async ({ page }) => {
    await page.goto('/#/x/LL-04')
    for (const choice of [
      /^copy refers to a new, separate BigNum/,
      /^It's true: myHead/,
      /^A new, separate node containing 4, whose next is null\./,
      /^newPtr refers to the copy's node containing 4\. origPtr refers to the original node containing 7\./,
      /^It creates a new node containing 7/,
      /^newPtr refers to the copy's node containing 7\. origPtr refers to the original node containing 2\./,
      /^The copy contains 4, 7, 2, and origPtr is null\./,
    ]) {
      await check(page, choice)
      await page.getByRole('button', { name: 'Continue' }).click()
    }
    await check(page, /^The two BigNums are different objects/)
    await expectAllBoxesVisible(page)
  })
})

test.describe('wide diagrams on phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only behavior')

  test('LL-04 says the diagram scrolls sideways; desktop never shows the note', async ({ page }) => {
    await page.goto('/#/x/LL-04')
    await expect(page.getByText('Swipe sideways to see the whole diagram')).toBeVisible()
    const box = page.getByTestId('ll-diagram')
    const { scrollWidth, clientWidth } = await box.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(scrollWidth).toBeGreaterThan(clientWidth)
  })
})

test('the swipe note is absent when the diagram fits (desktop)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop-only check')
  await page.goto('/#/x/LL-04')
  await expect(page.getByText(/^Step 1 of 8$/)).toBeVisible()
  await expect(page.getByText('Swipe sideways to see the whole diagram')).toHaveCount(0)
})
