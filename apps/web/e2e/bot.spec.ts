import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

async function startBotGame(page: Page, level: string, side: 'White' | 'Black') {
  await page.goto('/bot')
  await page.getByRole('button', { name: new RegExp(`^${level}\\b`) }).click()
  await page.getByRole('button', { name: side, exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
}

const moves = (page: Page) => page.locator('.move-tree [data-san]')

test('the bot answers moves and a takeback undoes the move with its reply', async ({ page }) => {
  await startBotGame(page, '1', 'White')
  await expect(page.locator('.bot-opponent')).toContainText('Chessy bot (level 1)')
  const board = await boardDriver(page)
  await board.play(['e2', 'e4'])
  await expect(moves(page)).toHaveCount(2, { timeout: 15_000 })
  await expect(page.getByRole('status')).toHaveCount(0) // done thinking

  await page.getByRole('button', { name: 'Takeback' }).click()
  await expect(moves(page)).toHaveCount(0)
  await board.play(['d2', 'd4'])
  await expect(moves(page)).toHaveCount(2, { timeout: 15_000 })
  await expect(moves(page).first()).toHaveAttribute('data-san', 'd4')
})

test('as Black the bot opens and the board is turned around', async ({ page }) => {
  await startBotGame(page, '2', 'Black')
  await expect(moves(page)).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/)
  await expect(page.getByRole('button', { name: 'Takeback' })).toBeDisabled()
})

test('a resigned game is saved and opens straight into its review', async ({ page }) => {
  await startBotGame(page, '1', 'White')
  const board = await boardDriver(page)
  await board.play(['e2', 'e4'])
  await expect(moves(page)).toHaveCount(2, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Resign' }).click()

  await expect(page.locator('.status')).toContainText('You resigned · Black wins')
  await expect(page.getByText('Saved to your games.')).toBeVisible()
  await page.getByRole('button', { name: 'Review game' }).click()

  await expect(page).toHaveURL(/\/analysis\?game=/)
  await expect(page.getByRole('tab', { name: /Review/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('accuracy-white')).toContainText(/\d+\.\d/, { timeout: 60_000 })
  await expect(page.locator('.player-bar').first()).toBeVisible()

  await page.getByRole('link', { name: 'Games' }).click()
  const row = page.getByTestId('game-row').first()
  await expect(row).toContainText('You')
  await expect(row).toContainText('Chessy bot (level 1)')
  await expect(row).toContainText('Lost')
  await expect(row).toContainText('Chessy')
  await expect(row.getByTitle(/Open on/)).toHaveCount(0)
})
