import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

async function startBotGame(page: Page, level: string, side: 'White' | 'Black', clock = 'None') {
  await page.goto('/bot')
  const group = (name: string) => page.getByRole('group', { name })
  await group('Level')
    .getByRole('button', { name: new RegExp(`^${level}\\b`) })
    .click()
  await group('You play').getByRole('button', { name: side, exact: true }).click()
  await group('Clock').getByRole('button', { name: clock, exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
}

const moves = (page: Page) => page.locator('.move-tree [data-san]')

test('the bot answers moves and a takeback undoes the move with its reply', async ({ page }) => {
  await startBotGame(page, '1', 'White')
  await expect(page.locator('.bot-opponent')).toContainText('pawnia bot (level 1)')
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
  await expect(row).toContainText('pawnia bot (level 1)')
  await expect(row).toContainText('Lost')
  await expect(row).toContainText('pawnia')
  await expect(row.getByTitle(/Open on/)).toHaveCount(0)
})

test('on a clock: the clocks start after both first moves and running out loses', async ({
  page,
}) => {
  await page.clock.install()
  await startBotGame(page, '1', 'White', '1+0')
  const mine = page.getByRole('timer', { name: 'white clock' })
  const bots = page.getByRole('timer', { name: 'black clock' })
  await expect(mine).toHaveText('1:00')
  await expect(page.getByRole('button', { name: 'Takeback' })).toHaveCount(0)

  const board = await boardDriver(page)
  await board.play(['e2', 'e4'])
  await expect(moves(page)).toHaveCount(2, { timeout: 15_000 })
  await expect(mine).toHaveClass(/bot-clock-running/)
  await expect(bots).not.toHaveClass(/bot-clock-running/)

  await page.clock.fastForward('00:50')
  await expect(mine).toHaveClass(/bot-clock-low/)
  await page.clock.fastForward('00:15')
  await expect(page.locator('.status')).toContainText('Time out · Black wins')
  await expect(mine).toHaveText('0:00.0')
  await expect(page.getByText('Saved to your games.')).toBeVisible()

  await page.getByRole('link', { name: 'Games' }).click()
  const row = page.getByTestId('game-row').first()
  await expect(row).toContainText('Lost')
  await expect(row).toContainText('Bullet 1+0')
})

test('the bot declines a draw in an even opening', async ({ page }) => {
  await startBotGame(page, '8', 'White')
  const board = await boardDriver(page)
  await board.play(['e2', 'e4'])
  await expect(moves(page)).toHaveCount(2, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Offer draw' }).click()
  await expect(page.getByText('pawnia bot (level 8) declines the draw.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Offer draw' })).toBeDisabled()
})

test('says whether the levels play human-like', async ({ page }) => {
  await page.goto('/bot')
  // With the server's Maia model the human-like levels are named, without it the fallback.
  await expect(page.getByTestId('human-levels')).toHaveText(
    /Levels 1–6 play like humans of their rating|every level plays from the engine/,
  )
})
