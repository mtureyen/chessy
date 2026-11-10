import { expect, test, type Browser, type Page } from '@playwright/test'

// The E2E API serves recorded responses: lichess "DrNykterstein" has 2 games, against
// Night-King96 and oasenegre.
const OPPONENTS = ['Night-King96', 'oasenegre']

/** A browser of its own (its own library), like a second device or one with cleared data. */
async function freshBrowser(browser: Browser): Promise<Page> {
  const { baseURL, storageState } = test.info().project.use
  const context = await browser.newContext({
    ...(baseURL && { baseURL }),
    ...(storageState && { storageState }),
  })
  return context.newPage()
}

/** Imports DrNykterstein's games and returns the library id of each, by opponent. */
async function importGames(page: Page): Promise<Record<string, string>> {
  await page.goto('/games')
  await page.getByRole('radio', { name: 'lichess' }).click()
  await page.getByRole('textbox', { name: 'lichess username' }).fill('DrNykterstein')
  await page.getByRole('button', { name: 'Import recent games' }).click()
  await expect(page.getByRole('status')).toContainText('2 games imported')
  return ids(page)
}

async function ids(page: Page): Promise<Record<string, string>> {
  const found: Record<string, string> = {}
  for (const name of OPPONENTS) {
    const href = await page
      .getByTestId('game-row')
      .filter({ hasText: name })
      .first()
      .getByRole('link', { name: 'Analyse' })
      .getAttribute('href')
    found[name] = new URL(href!, 'http://x').searchParams.get('game')!
  }
  return found
}

/** The ids among these the server's history doesn't know. */
async function unknownToServer(page: Page, gameIds: string[]): Promise<string[]> {
  const res = await page.request.post('/api/v1/library/games/missing', { data: { ids: gameIds } })
  return ((await res.json()) as { missing: string[] }).missing
}

/**
 * The browser's ids for the games once it has caught up with the server: all of them known
 * there. Reloading runs the catch-up again (as opening the app does).
 */
async function settledIds(page: Page): Promise<Record<string, string>> {
  let found: Record<string, string> = {}
  await expect
    .poll(async () => {
      await page.reload()
      found = await ids(page)
      return unknownToServer(page, Object.values(found))
    })
    .toEqual([])
  return found
}

test('a second browser importing the same games ends up with the server’s ids', async ({
  browser,
}) => {
  // Other tests import these games into the same server too: either browser may be the second.
  const first = await freshBrowser(browser)
  await importGames(first)
  const firstIds = await settledIds(first)

  const second = await freshBrowser(browser)
  await importGames(second)
  // The server already had these games: the second browser takes over its ids, so links from
  // the server (stats, puzzles) open there too, and nothing is stored twice.
  expect(await settledIds(second)).toEqual(firstIds)
  await second.goto(`/analysis?game=${firstIds['oasenegre']}`)
  await expect(second.locator('.move-tree [data-san]').first()).toBeVisible()
})
