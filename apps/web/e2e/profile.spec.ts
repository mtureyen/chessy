import { expect, test } from '@playwright/test'

// A first visit: no banner closed yet.
test.use({ storageState: { cookies: [], origins: [] } })

// The E2E server's database lives for the whole run, and a browser without a profile takes the
// server's: each test starts as if the server had none (saving still goes through).
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/profile', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { profile: null } })
      : route.continue(),
  )
})

test('set up a profile: account checked against the platform, kept here and on the server', async ({
  page,
}) => {
  await page.goto('/')
  const banner = page.getByRole('region', { name: 'Welcome' })
  await banner.getByRole('link', { name: 'Set up' }).click()
  await expect(page).toHaveURL(/\/welcome$/)

  const save = page.getByRole('button', { name: 'Set up my profile' })
  await expect(save).toBeDisabled()

  const chesscom = page.getByLabel('chess.com', { exact: true })
  await chesscom.fill('ghost')
  await chesscom.press('Enter')
  await expect(page.getByRole('alert')).toContainText(/not found|ghost/i)

  await chesscom.fill('hikaru')
  await chesscom.press('Enter')
  const card = page.getByTestId('player-chesscom')
  await expect(card).toContainText('Hikaru')
  await expect(card).toContainText('Rapid 2838')
  await save.click()

  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hikaru')
  await expect(page.getByRole('link', { name: 'Profile: Hikaru' })).toBeVisible()
  await expect(banner).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hikaru')
  const kept = await (await page.request.get('/api/v1/profile')).json()
  expect(kept).toMatchObject({
    profile: { accounts: [{ source: 'chesscom', username: 'Hikaru' }] },
  })
})

test('the welcome banner can be closed for good', async ({ page }) => {
  await page.goto('/')
  const banner = page.getByRole('region', { name: 'Welcome' })
  await banner.getByRole('button', { name: 'Close' }).click()
  await expect(banner).toBeHidden()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Set up profile' })).toBeVisible()
  await expect(banner).toBeHidden()
})

test('a linked account brings in its whole history, then only new games', async ({ page }) => {
  await page.goto('/welcome')
  const chesscom = page.getByLabel('chess.com', { exact: true })
  await chesscom.fill('hikaru')
  await chesscom.press('Enter')
  await expect(page.getByTestId('player-chesscom')).toBeVisible()
  await page.getByRole('button', { name: 'Set up my profile' }).click()

  // Starts by itself: both recorded months, five standard games.
  const status = page.getByTestId('import-chesscom')
  await expect(status).toContainText('All games imported: 5 games, 5 new.')
  await page.getByRole('link', { name: 'Games' }).click()
  await expect(page.getByTestId('game-row')).toHaveCount(5)

  // Next time only what's new.
  await page.goto('/profile')
  await expect(status).toContainText(/All games imported on|Up to date/)
  await status.getByRole('button', { name: 'Import new games' }).click()
  await expect(status).toContainText(/new games imported|Up to date: no new games/)
})
