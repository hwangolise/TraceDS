import { defineConfig, devices } from '@playwright/test'

// E2E against the production build served by `vite preview` (docs/TESTING.md §1).
// Locally this uses the installed Google Chrome; CI installs Playwright's Chromium.
const channel = process.env.CI ? undefined : 'chrome'

/** Analytics origin baked into the E2E build. Nothing listens there. */
const E2E_API_BASE = 'http://127.0.0.1:9'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Analytics is a no-op without a base URL (ARCHITECTURE §8), which would make
    // the offline/slow-API tests (P3, P4) pass vacuously. The E2E build therefore
    // points analytics at a closed local port; specs that care intercept
    // **/api/** with page.route (ARCHITECTURE §11: backend mocked by route interception).
    env: { VITE_API_BASE_URL: E2E_API_BASE },
  },
})
