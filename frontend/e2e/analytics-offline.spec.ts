// P3, P4 — analytics failure never affects learning (docs/TESTING.md §M7,
// docs/ARCHITECTURE.md ADR-7). The E2E build has analytics enabled
// (playwright.config.ts); every /api/ request is intercepted here.
//
// Each test also proves the API was actually called, so it cannot pass just
// because analytics is absent.

import { expect, test, type Page, type Request } from '@playwright/test'

const LL01_GOLDEN: (string | RegExp)[] = [
  'head refers to a new Node whose data is 4 and whose next is null.',
  /^A new Node containing 7 is created, and the next field of the node containing 4 now refers to it/,
  '2 nodes: head and cur both refer to the node containing 4.',
  /^cur refers to the node containing 7\. head still refers/,
  /^The node containing 7 now links to a new node containing 1/,
  '4, 9, 1',
]
const WRONG_FIRST = 'head holds the value 4 directly; no Node object is created.'

async function check(page: Page, choiceName: string | RegExp) {
  await page.getByRole('radio', { name: choiceName }).check()
  await page.getByRole('button', { name: 'Check answer' }).click()
}

/** Forces the documented analytics flush trigger (visibilitychange → hidden). */
async function hidePage(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    delete (document as unknown as Record<string, unknown>).visibilityState
  })
}

const isEventsPost = (r: Request) => r.url().endsWith('/api/v1/events') && r.method() === 'POST'
const isSessionsPost = (r: Request) => r.url().endsWith('/api/v1/sessions') && r.method() === 'POST'

function trackPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function expectNoErrorUI(page: Page) {
  await expect(page.getByText(/something went wrong|failed to|network error|try again later|unavailable/i)).toHaveCount(0)
  await expect(page.getByRole('alert').filter({ hasText: /error|fail/i })).toHaveCount(0)
}

test('P3: with every API request aborted, a student completes LL-01 with no error UI', async ({ page }) => {
  const pageErrors = trackPageErrors(page)
  const aborted: Request[] = []
  await page.route('**/api/**', async (route) => {
    aborted.push(route.request())
    await route.abort()
  })

  await page.goto('/#/x/LL-01')
  await expect(page.getByText('Step 1 of 6')).toBeVisible()

  const feedback = page.getByTestId('feedback')
  await check(page, WRONG_FIRST)
  await expect(feedback).toContainText('Not quite')
  for (const [i, choice] of LL01_GOLDEN.entries()) {
    await expect(page.getByText(`Step ${i + 1} of 6`)).toBeVisible()
    await check(page, choice)
    await expect(feedback).toContainText('Correct')
    await expectNoErrorUI(page)
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Exercise complete' })).toBeVisible()
  await expectNoErrorUI(page)

  // The API really was tried: the session POST at load, and the events on page hide.
  await hidePage(page)
  await expect.poll(() => aborted.filter(isSessionsPost).length).toBeGreaterThan(0)
  await expect.poll(() => aborted.filter(isEventsPost).length).toBeGreaterThan(0)
  expect(pageErrors).toEqual([])
})

test('P4: with the API taking 10 s to respond, answer feedback still appears in under 200 ms', async ({ page }) => {
  const pageErrors = trackPageErrors(page)
  const pending: Request[] = []
  await page.route('**/api/**', async (route) => {
    pending.push(route.request())
    await new Promise((resolve) => setTimeout(resolve, 10_000))
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":1}' }).catch(() => {})
  })

  await page.goto('/#/x/LL-01')
  await expect(page.getByText('Step 1 of 6')).toBeVisible()
  // A slow session POST is in flight, and a flush puts a slow events POST in flight too.
  await expect.poll(() => pending.filter(isSessionsPost).length).toBeGreaterThan(0)
  await hidePage(page)
  await expect.poll(() => pending.filter(isEventsPost).length).toBeGreaterThan(0)

  const feedback = page.getByTestId('feedback')
  const timeFeedback = async (choice: string | RegExp, expected: string) => {
    await page.getByRole('radio', { name: choice }).check()
    const started = Date.now()
    await page.getByRole('button', { name: 'Check answer' }).click()
    await expect(feedback).toContainText(expected, { timeout: 1_000 })
    return Date.now() - started
  }

  expect(await timeFeedback(WRONG_FIRST, 'Not quite')).toBeLessThan(200)
  expect(await timeFeedback(LL01_GOLDEN[0], 'Correct')).toBeLessThan(200)
  await page.getByRole('button', { name: 'Continue' }).click()
  await hidePage(page)
  expect(await timeFeedback(LL01_GOLDEN[1], 'Correct')).toBeLessThan(200)

  await expectNoErrorUI(page)
  expect(pageErrors).toEqual([])
})
