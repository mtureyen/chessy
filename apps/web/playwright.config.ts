import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
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
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: !CI,
    },
    {
      command: 'bun run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !CI,
    },
  ],
})
