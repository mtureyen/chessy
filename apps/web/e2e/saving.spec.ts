import { expect, test } from '@playwright/test'
import { boardDriver } from './board'

const moves = (page: import('@playwright/test').Page) => page.locator('.move-tree [data-san]')

test('a bot game left midway is kept as unfinished and can be resumed', async ({ page }) => {
  await page.goto('/bot')
  await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: /^1\b/ }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const board = await boardDriver(page)
  await board.play(['e2', 'e4'])
  await expect(moves(page)).toHaveCount(2, { timeout: 15_000 })

  // Leave the game: it's in the history as unfinished, under Bots.
  await page.getByRole('link', { name: 'Games' }).click()
  await page.getByRole('tab', { name: /Bots/ }).click()
  await expect(page.getByTestId('game-row').first()).toContainText('Unfinished')

  await page.reload()
  await page.getByRole('link', { name: 'vs Bot' }).click()
  const resume = page.getByTestId('resume-bot-game')
  await expect(resume).toContainText('vs Chessy bot (level 1) · 1 move · no clock')
  await resume.getByRole('button', { name: 'Resume' }).click()

  await expect(moves(page)).toHaveCount(2)
  await expect(moves(page).first()).toHaveAttribute('data-san', 'e4')
  const resumed = await boardDriver(page)
  await resumed.play(['d2', 'd4'])
  await expect(moves(page)).toHaveCount(4, { timeout: 15_000 })
})

test('games on the local board are saved: finished ones by themselves, others on request', async ({
  page,
}) => {
  await page.goto('/')
  const board = await boardDriver(page)
  await board.play(['e2', 'e4'])
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('updated with every move')
  // Scholar's mate ends it: saved again by itself, now with the result.
  await board.play(
    ['e7', 'e5'],
    ['f1', 'c4'],
    ['b8', 'c6'],
    ['d1', 'h5'],
    ['g8', 'f6'],
    ['h5', 'f7'],
  )
  await expect(page.getByRole('status')).toContainText('Saved to your games.')

  await page.getByRole('link', { name: 'Games' }).click()
  await page.getByRole('tab', { name: /Local/ }).click()
  const rows = page.getByTestId('game-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('1-0')
  await expect(rows.first()).toContainText('White')
})
