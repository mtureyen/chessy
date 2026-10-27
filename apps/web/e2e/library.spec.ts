import { expect, test, type Page } from '@playwright/test'

// The E2E API serves recorded responses: lichess "DrNykterstein" (2 games), chess.com "hikaru" (5 games).

async function importGames(page: Page, platform: 'lichess' | 'chess.com', username: string) {
  await page.getByRole('radio', { name: platform }).click()
  await page.getByRole('textbox', { name: `${platform} username` }).fill(username)
  await page.getByRole('button', { name: 'Import recent games' }).click()
}

const rows = (page: Page) => page.getByTestId('game-row')

test.beforeEach(async ({ page }) => {
  await page.goto('/games')
})

test('imports games from lichess and chess.com, newest first, without duplicates', async ({
  page,
}) => {
  await expect(page.getByText('No games yet')).toBeVisible()

  await importGames(page, 'lichess', 'DrNykterstein')
  await expect(page.getByRole('status')).toHaveText('2 games imported, 2 new')
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).first()).toContainText('DrNykterstein (3177)')
  await expect(rows(page).first()).toContainText("Queen's Indian Accelerated")
  await expect(rows(page).first()).toContainText('Blitz 3+0')

  await importGames(page, 'lichess', 'DrNykterstein')
  await expect(page.getByRole('status')).toHaveText('2 games imported, 0 new')
  await expect(rows(page)).toHaveCount(2)

  await importGames(page, 'chess.com', 'hikaru')
  await expect(page.getByRole('status')).toHaveText('5 games imported, 5 new')
  await expect(rows(page)).toHaveCount(7)
  await expect(rows(page).first()).toContainText('chess.com')
})

test('shows results from the user’s point of view and remembers usernames', async ({ page }) => {
  await importGames(page, 'lichess', 'DrNykterstein')
  // In the newest recorded game DrNykterstein won with White.
  await expect(rows(page).first().locator('.game-outcome')).toHaveText('Won')
  await expect(rows(page).first().locator('.game-player-me')).toHaveText(/DrNykterstein/)

  await page.reload()
  await expect(rows(page)).toHaveCount(2) // stored in IndexedDB
  await expect(page.getByRole('textbox', { name: 'lichess username' })).toHaveValue('DrNykterstein')
  await expect(page.getByRole('radio', { name: 'lichess' })).toHaveAttribute('aria-checked', 'true')
})

test('reports unknown users and rejects invalid names', async ({ page }) => {
  await importGames(page, 'lichess', 'nobody_here')
  await expect(page.getByRole('alert')).toHaveText('No lichess user "nobody_here"')

  await page.getByRole('textbox', { name: 'lichess username' }).fill('a b')
  await expect(page.getByRole('button', { name: 'Import recent games' })).toBeDisabled()
})

test('opens a game on the analysis board with players and clocks', async ({ page }) => {
  await importGames(page, 'lichess', 'DrNykterstein')
  await rows(page).first().getByRole('link', { name: 'Analyse' }).click()

  await expect(page).toHaveURL(/\/analysis\?game=/)
  await expect(page.getByTestId('player-white')).toContainText('DrNykterstein')
  await expect(page.getByTestId('player-white')).toContainText('3177')
  await expect(page.getByTestId('player-black')).toContainText('Night-King96')
  await expect(page.locator('.status')).toHaveText('Black to move')

  // Clocks follow the move you are looking at.
  const whiteClock = page.getByLabel('white clock')
  const atEnd = await whiteClock.innerText()
  await page.keyboard.press('Home')
  await expect(page.getByLabel('white clock')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(whiteClock).toHaveText('3:00')
  expect(atEnd).not.toBe('3:00')
})

test('deletes games', async ({ page }) => {
  await importGames(page, 'lichess', 'DrNykterstein')
  await rows(page).first().getByRole('button', { name: 'Delete game' }).click()
  await expect(rows(page)).toHaveCount(1)
})

test('a missing library game shows an error on the analysis board', async ({ page }) => {
  await page.goto('/analysis?game=does-not-exist')
  await expect(page.locator('.analysis-load-error')).toHaveText('This game is not in your library')
})
