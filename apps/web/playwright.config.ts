import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// E2E runs its own servers on separate ports, so it never talks to a `bun dev` session (live
// lichess/chess.com data). The API answers from recorded responses instead.
const API_PORT = 3100
const WEB_PORT = 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // Locally reuse the installed Chrome; CI installs Playwright's Chromium.
      use: { ...devices['Desktop Chrome'], ...(CI ? {} : { channel: 'chrome' }) },
    },
  ],
  webServer: [
    {
      command: 'bun run start',
      cwd: '../api',
      env: { PORT: String(API_PORT), CHESSY_SOURCES: 'recorded' },
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !CI,
    },
    {
      command: `bun run dev --port ${WEB_PORT}`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !CI,
    },
  ],
})
