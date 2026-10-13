// M9 — accessibility (docs/TESTING.md §M9: X1–X3). axe on every student-facing
// state, a keyboard-only LL-01 run, and visible focus. Serious/critical
// violations fail; the wide-code scroll region must be keyboard reachable.

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const GOLD: (string | RegExp)[] = [
  'head refers to a new Node whose data is 4 and whose next is null.',
  /^A new Node containing 7 is created, and the next field of the node containing 4 now refers to it/,
  '2 nodes: head and cur both refer to the node containing 4.',
  /^cur refers to the node containing 7\. head still refers/,
  /^The node containing 7 now links to a new node containing 1/,
  '4, 9, 1',
]
const WRONG_FIRST = 'head holds the value 4 directly; no Node object is created.'

async function expectNoSeriousViolations(page: Page, label: string) {
  await page.waitForTimeout(350) // let React Flow settle
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`),
    label,
  ).toEqual([])
}

async function check(page: Page, choice: string | RegExp) {
  await page.getByRole('radio', { name: choice }).check()
  await page.getByRole('button', { name: 'Check answer' }).click()
}

test('X1: no serious or critical axe violations on any student-facing state', async ({ page }) => {
  await page.goto('/')
  await expectNoSeriousViolations(page, 'landing')
  await page.goto('/#/m/linked-lists')
  await expectNoSeriousViolations(page, 'module')

  await page.goto('/#/x/LL-01')
  await expectNoSeriousViolations(page, 'LL-01 question')
  await check(page, WRONG_FIRST)
  await expectNoSeriousViolations(page, 'LL-01 wrong answer')
  await check(page, GOLD[0])
  await expectNoSeriousViolations(page, 'LL-01 correct')
  await page.getByRole('button', { name: 'Continue' }).click()
  for (const c of GOLD.slice(1)) {
    await check(page, c)
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Exercise complete' })).toBeVisible()
  await expectNoSeriousViolations(page, 'completion')

  await page.getByRole('radio', { name: '4' }).check()
  await page.route('**/api/v1/feedback', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }))
  await page.getByRole('button', { name: 'Submit feedback' }).click()
  await expect(page.getByText(/Couldn't send feedback/)).toBeVisible()
  await expectNoSeriousViolations(page, 'feedback error')
  await page.unroute('**/api/v1/feedback')
  await page.route('**/api/v1/feedback', (r) => r.fulfill({ status: 201, contentType: 'application/json', body: '{"status":"ok"}' }))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Thanks for the feedback.')).toBeVisible()
  await expectNoSeriousViolations(page, 'feedback success')

  for (const id of ['LL-02', 'LL-03', 'LL-04']) {
    await page.goto(`/#/x/${id}`)
    await expect(page.getByText(/^Step 1 of/)).toBeVisible()
    await expectNoSeriousViolations(page, id)
  }
  await page.goto('/#/x/NOPE')
  await expectNoSeriousViolations(page, 'not found')
})

test('X2: LL-01 can be completed with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern')
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Start practicing' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Linked Lists' })).toBeFocused()

  await page.getByRole('listitem').filter({ hasText: 'LL-01' }).getByRole('link', { name: /Start/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Step 1 of 6')).toBeVisible()

  // Choose with the arrow keys / Space, then Tab to Check answer.
  const choose = async (name: string | RegExp) => {
    const radio = page.getByRole('radio', { name })
    await radio.focus()
    await page.keyboard.press('Space')
    await expect(radio).toBeChecked()
    await page.getByRole('button', { name: 'Check answer' }).focus()
    await page.keyboard.press('Enter')
  }
  await choose(WRONG_FIRST)
  await expect(page.getByTestId('feedback')).toBeFocused() // focus moves to the hint
  await expect(page.getByTestId('feedback')).toContainText('Not quite')
  await choose(GOLD[0])
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused() // and to Continue
  await page.keyboard.press('Enter')
  for (const [i, c] of GOLD.slice(1).entries()) {
    await expect(page.getByText(`Step ${i + 2} of 6`)).toBeVisible()
    await choose(c)
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('heading', { name: 'Exercise complete' })).toBeFocused()
  // The completion actions and the feedback form are reachable by Tab.
  await page.getByRole('link', { name: 'Practice another exercise' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/^Step 1 of/)).toBeVisible()
})

test('X3: focused controls show a visible outline', async ({ page, isMobile }) => {
  test.skip(isMobile, 'focus rings matter for keyboard users')
  await page.goto('/#/x/LL-01')
  await page.keyboard.press('Tab') // header link
  const seen: string[] = []
  for (let i = 0; i < 8; i++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const cs = getComputedStyle(el)
      const own = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
      // A radio's ring may sit on its label container (focus-within).
      const box = el.closest('label, [class*="focus-within"]')
      const bcs = box ? getComputedStyle(box) : null
      const wrapped = !!bcs && (bcs.outlineStyle !== 'none' || bcs.boxShadow !== 'none' || bcs.borderColor !== '')
      return { tag: el.tagName + ':' + (el.getAttribute('aria-label') ?? el.textContent?.slice(0, 20)), own, wrapped }
    })
    if (info) seen.push(`${info.tag}=${info.own}`)
    if (info && !info.own && !info.wrapped) throw new Error('no visible focus on ' + info.tag)
    await page.keyboard.press('Tab')
  }
  expect(seen.length).toBeGreaterThan(3)
})
