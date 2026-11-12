import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

test.use({ viewport: { width: 1280, height: 1000 } })

const AS_BLACK = '[White "rival"]\n[Black "8sly"]\n\n1. e4 e5 2. Nf3 Nc6 *'
const AS_WHITE = '[White "8sly"]\n[Black "rival"]\n\n1. e4 e5 2. Nf3 Nc6 *'
const SOMEONE_ELSES = '[White "rival"]\n[Black "stranger"]\n\n1. e4 e5 2. Nf3 Nc6 *'

const board = (page: Page) => page.locator('.cg-wrap')
/** The player bar under the board. */
const bottom = (page: Page) => page.locator('.player-bar').last()
const flip = (page: Page) => page.getByRole('button', { name: 'Flip' })
const analysis = (pgn: string) => `/analysis?${new URLSearchParams({ pgn })}`

/**
 * The user's profile on the server, with the given account. With `hold` the answer waits until
 * the returned function is called: a profile that arrives after the board.
 */
async function profileServer(
  page: Page,
  { source = 'chesscom', username = '8sly', hold = false } = {},
) {
  let release = () => {}
  const held = hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
  await page.route('**/api/v1/profile', async (route) => {
    await held
    await route.fulfill({
      json: {
        profile: {
          id: 'p1',
          displayName: username,
          accounts: [{ source, username }],
          createdAt: '2026-11-05T00:00:00.000Z',
          updatedAt: '2026-11-05T00:00:00.000Z',
        },
      },
    })
  })
  return () => release()
}

test('a game the user played as Black opens with Black at the bottom', async ({ page }) => {
  await profileServer(page)
  await page.goto(analysis(AS_BLACK))
  await expect(board(page)).toHaveClass(/orientation-black/)
  await expect(bottom(page)).toContainText('8sly')

  // The flip button turns it both ways from there.
  await flip(page).click()
  await expect(board(page)).toHaveClass(/orientation-white/)
  await expect(bottom(page)).toContainText('rival')
  await page.keyboard.press('f')
  await expect(board(page)).toHaveClass(/orientation-black/)

  // Moves land where they are dragged on the turned board.
  const driver = await boardDriver(page)
  driver.setFlipped(true)
  await driver.play(['f3', 'e5'])
  await expect(page.locator('.move-tree .move-current')).toHaveText('Nxe5')
})

test('as White, and in a game that is not the user’s, White stays at the bottom', async ({
  page,
}) => {
  await profileServer(page)
  await page.goto(analysis(AS_WHITE))
  await expect(bottom(page)).toContainText('8sly')
  await expect(board(page)).toHaveClass(/orientation-white/)

  await page.goto(analysis(SOMEONE_ELSES))
  await expect(bottom(page)).toContainText('rival')
  await expect(page.getByRole('link', { name: 'Profile: 8sly' })).toBeVisible() // the profile is in
  await expect(board(page)).toHaveClass(/orientation-white/)
})

test('a profile that arrives after the board turns it once it is known', async ({ page }) => {
  const arrive = await profileServer(page, { hold: true })
  await page.goto(analysis(AS_BLACK))
  await expect(page.locator('.move-tree .move-current')).toHaveText('Nc6')
  await expect(board(page)).toHaveClass(/orientation-white/)

  arrive()
  await expect(board(page)).toHaveClass(/orientation-black/)
  await expect(bottom(page)).toContainText('8sly')
})

for (const [side, pgn] of [
  ['Black', AS_BLACK],
  ['White', AS_WHITE],
] as const) {
  test(`a board the user turned by hand stays as it is when the profile arrives (as ${side})`, async ({
    page,
  }) => {
    const arrive = await profileServer(page, { hold: true })
    await page.goto(analysis(pgn))
    await expect(board(page)).toHaveClass(/orientation-white/)
    await flip(page).click()
    await expect(board(page)).toHaveClass(/orientation-black/)

    arrive()
    await expect(page.getByRole('link', { name: 'Profile: 8sly' })).toBeVisible()
    await expect(board(page)).toHaveClass(/orientation-black/)
  })
}

test('a pasted game of the user’s turns the board to their side', async ({ page }) => {
  await profileServer(page)
  await page.goto('/analysis')
  await expect(board(page)).toHaveClass(/orientation-white/)
  await page.getByText('Import / export').click()
  await page.fill('#import', AS_BLACK)
  await page.getByRole('button', { name: 'Load' }).click()
  await expect(board(page)).toHaveClass(/orientation-black/)

  await page.fill('#import', SOMEONE_ELSES)
  await page.getByRole('button', { name: 'Load' }).click()
  await expect(board(page)).toHaveClass(/orientation-white/)
})

test('a game from the library opens from the side of the user’s account', async ({ page }) => {
  // The recorded chess.com games are hikaru's; in this one he has Black.
  await profileServer(page, { username: 'hikaru' })
  await page.goto('/games')
  await page.getByRole('radio', { name: 'chess.com' }).click()
  await page.getByRole('textbox', { name: 'chess.com username' }).fill('hikaru')
  await page.getByRole('button', { name: 'Import recent games' }).click()
  await expect(page.getByRole('status')).toContainText('imported')

  await page.goto(
    `/open?${new URLSearchParams({ url: 'https://www.chess.com/game/live/185932092650' })}`,
  )
  await expect(page).toHaveURL(/\/analysis\?game=/)
  await expect(page.getByTestId('player-black')).toContainText('Hikaru')
  await expect(board(page)).toHaveClass(/orientation-black/)
  await expect(bottom(page)).toContainText('Hikaru')

  // From the list of games as well.
  await page.getByRole('link', { name: 'Games' }).click()
  await page
    .getByTestId('game-row')
    .filter({ hasText: 'KodandaPrime' })
    .first()
    .getByRole('link', { name: 'Analyse' })
    .click()
  await expect(page).toHaveURL(/\/analysis\?game=/)
  await expect(bottom(page)).toContainText('Hikaru')
  await expect(board(page)).toHaveClass(/orientation-black/)
})

test('a bot game played as Black is reviewed from Black’s side', async ({ page }) => {
  await page.goto('/bot')
  await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: /^1\b/ }).click()
  await page.getByRole('group', { name: 'You play' }).getByRole('button', { name: 'Black' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.move-tree [data-san]')).toHaveCount(1, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.getByText('Saved to your games.')).toBeVisible()
  await page.getByRole('button', { name: 'Review game' }).click()

  await expect(page).toHaveURL(/\/analysis\?game=/)
  await expect(bottom(page)).toContainText('You')
  await expect(board(page)).toHaveClass(/orientation-black/)
})
