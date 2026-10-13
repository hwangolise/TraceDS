// M8 — optional feedback on the completion screen (docs/TESTING.md §M8).
// Focused paths only; field-level behaviour is covered by the component tests.
// The E2E build has analytics/feedback enabled (playwright.config.ts); every
// /api/ request is intercepted here.
import { expect, test, type Page, type Request } from '@playwright/test'

const LL01_GOLDEN: (string | RegExp)[] = [
  'head refers to a new Node whose data is 4 and whose next is null.',
  /^A new Node containing 7 is created, and the next field of the node containing 4 now refers to it/,
  '2 nodes: head and cur both refer to the node containing 4.',
  /^cur refers to the node containing 7\. head still refers/,
  /^The node containing 7 now links to a new node containing 1/,
  '4, 9, 1',
]

async function completeLL01(page: Page) {
  await page.goto('/#/x/LL-01')
  for (const [i, choice] of LL01_GOLDEN.entries()) {
    await expect(page.getByText(`Step ${i + 1} of 6`)).toBeVisible()
    await page.getByRole('radio', { name: choice }).check()
    await page.getByRole('button', { name: 'Check answer' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Exercise complete' })).toBeVisible()
}

const isFeedbackPost = (r: Request) => r.url().endsWith('/api/v1/feedback') && r.method() === 'POST'

test('FB-E1: a student rates the exercise, picks a topic, comments, and sees the acknowledgement', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  const feedbackRequests: Request[] = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    if (isFeedbackPost(request)) feedbackRequests.push(request)
    await route.fulfill({
      status: isFeedbackPost(request) ? 201 : 202,
      contentType: 'application/json',
      body: isFeedbackPost(request) ? '{"status":"ok"}' : '{"accepted":0}',
    })
  })

  await completeLL01(page)
  await expect(page.getByRole('heading', { name: 'Help improve TraceDS' })).toBeVisible()
  const submit = page.getByRole('button', { name: 'Submit feedback' })
  await expect(submit).toBeDisabled()

  await page.getByRole('radio', { name: '4' }).check()
  await page.getByRole('combobox', { name: /What should I add more practice for\?/ }).selectOption({ label: 'Recursion' })
  await page.getByRole('textbox', { name: /What should I improve\?/ }).fill('More practice with null checks.')
  await submit.click()

  await expect(page.getByText('Thanks for the feedback.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit feedback' })).toHaveCount(0)
  expect(feedbackRequests).toHaveLength(1)
  const body = feedbackRequests[0].postDataJSON()
  expect(Object.keys(body).sort()).toEqual(['comments', 'helpfulness', 'requested_topic', 'session_id'])
  expect(body).toMatchObject({ helpfulness: 4, requested_topic: 'recursion', comments: 'More practice with null checks.' })
  expect(body.session_id).toBe(await page.evaluate(() => window.localStorage.getItem('traceds.sessionId')))
  // The completion actions are still there afterwards.
  await expect(page.getByRole('link', { name: 'Practice another exercise' })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('FB-E2: with the feedback API unavailable, completion stays usable and the student practices another exercise', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  const feedbackRequests: Request[] = []
  await page.route('**/api/**', async (route) => {
    if (isFeedbackPost(route.request())) feedbackRequests.push(route.request())
    await route.abort()
  })

  await completeLL01(page)
  await page.getByRole('radio', { name: '2' }).check()
  await page.getByRole('button', { name: 'Submit feedback' }).click()

  await expect(page.getByText("Couldn't send feedback right now. You can keep practicing.")).toBeVisible()
  expect(feedbackRequests.length).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: 'Exercise complete' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled()

  await page.getByRole('link', { name: 'Practice another exercise' }).click()
  await expect(page.getByText(/Step 1 of/)).toBeVisible()
  await expect(page).toHaveURL(/#\/x\/LL-02$/)
  expect(pageErrors).toEqual([])
})

test('FB-E3: a feedback request that hangs never blocks leaving the completion screen', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    if (isFeedbackPost(route.request())) return new Promise<void>(() => {}) // never answers
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":0}' })
  })
  await completeLL01(page)
  await page.getByRole('radio', { name: '5' }).check()
  await page.getByRole('button', { name: 'Submit feedback' }).click()
  await expect(page.getByRole('button', { name: /Sending/ })).toBeDisabled()
  await page.getByRole('link', { name: 'Practice another exercise' }).click()
  await expect(page.getByText(/Step 1 of/)).toBeVisible()
})
