// M9 — responsive layout and launch metadata (docs/TESTING.md §M9: X4, X5).

import { expect, test } from '@playwright/test'

test('X4: at 1280×800 the code panel and the memory view sit side by side', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/#/x/LL-01')
  const code = (await page.getByRole('list', { name: 'Java code' }).boundingBox())!
  const viz = (await page.locator('figure').boundingBox())!
  expect(code.x + code.width).toBeLessThanOrEqual(viz.x + 1)
  expect(Math.abs(code.y - viz.y)).toBeLessThan(120)
  expect(viz.x + viz.width).toBeLessThanOrEqual(1280)
})

test('X5: at 390×844 panels stack code → memory → question with no horizontal scroll', async ({ page, isMobile }) => {
  test.skip(isMobile, 'viewport is set explicitly')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const id of ['LL-01', 'LL-02', 'LL-03', 'LL-04']) {
    await page.goto(`/#/x/${id}`)
    await expect(page.getByText(/^Step 1 of/)).toBeVisible()
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    expect(sw, id).toBeLessThanOrEqual(cw)
  }
  const code = (await page.getByRole('list', { name: 'Java code' }).boundingBox())!
  const viz = (await page.locator('figure').boundingBox())!
  const question = (await page.getByRole('radio').first().boundingBox())!
  expect(code.y + code.height).toBeLessThanOrEqual(viz.y + 1)
  expect(viz.y + viz.height).toBeLessThanOrEqual(question.y + 1)
})

test('launch metadata: description, a TraceDS favicon, and no template branding', async ({ page, request }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('TraceDS')
  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description ?? '').toMatch(/Java/)
  const href = await page.locator('link[rel="icon"]').getAttribute('href')
  const svg = await (await request.get(href!)).text()
  expect(svg.length).toBeLessThan(4000) // the Vite template logo is ~10 KB
  expect(svg).not.toContain('#863bff')
})
