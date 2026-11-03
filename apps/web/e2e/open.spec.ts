import { expect, test } from '@playwright/test'

// The E2E API serves recorded responses: lichess game HqjDTU4A (DrNykterstein), chess.com "hikaru".

const open = (url: string) => `/open?${new URLSearchParams({ url })}`

test('opens a lichess game from its page URL on the analysis board and keeps it', async ({
  page,
}) => {
  await page.goto(open('https://lichess.org/HqjDTU4A/black'))
  await expect(page).toHaveURL(/\/analysis\?game=/)
  await expect(page.getByTestId('player-white')).toContainText('DrNykterstein')
  await expect(page.locator('.move-tree [data-san]').first()).toBeVisible()

  await page.getByRole('link', { name: 'Games' }).click()
  await expect(page.getByTestId('game-row')).toHaveCount(1)

  // Opening it again reuses the stored game.
  await page.goto(open('https://lichess.org/HqjDTU4A'))
  await expect(page).toHaveURL(/\/analysis\?game=/)
  await page.getByRole('link', { name: 'Games' }).click()
  await expect(page.getByTestId('game-row')).toHaveCount(1)
})

test('opens chess.com games among the user’s own, once the username is known', async ({ page }) => {
  const url = 'https://www.chess.com/game/live/185932092650'
  await page.goto(open(url))
  await expect(page.getByRole('alert')).toContainText('chess.com username')

  await page.goto('/games')
  await page.getByRole('radio', { name: 'chess.com' }).click()
  await page.getByRole('textbox', { name: 'chess.com username' }).fill('hikaru')
  await page.getByRole('button', { name: 'Import recent games' }).click()
  await expect(page.getByRole('status')).toContainText('imported')

  await page.goto(open(url))
  await expect(page).toHaveURL(/\/analysis\?game=/)
  await expect(page.getByTestId('player-white')).toContainText('KodandaPrime')
  await expect(page.getByTestId('player-black')).toContainText('Hikaru')
})

test('explains links that name no game', async ({ page }) => {
  await page.goto(open('https://lichess.org/analysis'))
  await expect(page.getByRole('alert')).toContainText('Not a lichess or chess.com game')
})
