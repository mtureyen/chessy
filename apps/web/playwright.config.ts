import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// E2E runs its own servers on separate ports, so it never talks to a `bun dev` session (live
// lichess/chess.com data). The API answers from recorded responses instead, and keeps the game
// history in an in-memory database that starts empty each run. E2E_API_PORT and E2E_WEB_PORT
// keep runs apart, e.g. in two worktrees: a local run reuses a server it finds on its ports.
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100)
/** Never the user's own settings (their API keys): a fresh file per run. */
const SETTINGS_PATH = join(tmpdir(), `pawnia-e2e-settings-${process.pid}.json`)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
    // A browser that has already closed the welcome banner; profile.spec starts fresh.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${WEB_PORT}`,
          localStorage: [{ name: 'chessy.welcome-dismissed', value: '1' }],
        },
      ],
    },
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
      env: {
        PORT: String(API_PORT),
        PAWNIA_SOURCES: 'recorded',
        DATABASE_URL: 'pglite:memory',
        SETTINGS_PATH,
        // No coach request may leave this machine: Claude off, Ollama where nothing listens.
        COACH_CLAUDE_API: 'off',
        COACH_CLAUDE_HEADLESS: 'off',
        COACH_OLLAMA_URL: 'http://127.0.0.1:9/v1',
      },
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
