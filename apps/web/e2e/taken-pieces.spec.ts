import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

// Tall enough for the whole board with a player bar above and below it.
test.use({ viewport: { width: 1280, height: 1000 } })

/** The row of taken pieces next to a side; its label says what it shows. */
const taken = (page: Page, color: 'white' | 'black') => page.getByTestId(`taken-${color}`)
const moves = (page: Page) => page.locator('.move-tree [data-san]')

async function openAnalysis(page: Page, search: Record<string, string>) {
  await page.goto(`/analysis?${new URLSearchParams(search)}`)
  return boardDriver(page)
}

test('local play: each side’s taken pieces and the lead follow the game', async ({ page }) => {
  await page.goto('/')
  const board = await boardDriver(page)
  await expect(page.getByTestId('player-white')).toContainText('White')
  await expect(page.getByTestId('player-black')).toContainText('Black')
  await expect(taken(page, 'white')).toHaveCount(0)
  await expect(taken(page, 'black')).toHaveCount(0)

  // 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qxa2 4. Nxa2
  await board.play(['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'], ['d8', 'd5'])
  await board.play(['b1', 'c3'], ['d5', 'a2'], ['c3', 'a2'])
  await expect(taken(page, 'white')).toHaveAccessibleName(
    'White has taken 1 pawn, 1 queen, ahead by 8',
  )
  await expect(taken(page, 'white')).toContainText('+8')
  await expect(taken(page, 'black')).toHaveAccessibleName('Black has taken 2 pawns')
  // In the piece set on the board, and the other side's pieces.
  await expect(taken(page, 'white').locator('[data-role="queen"] .taken-piece')).toHaveCSS(
    'background-image',
    /pieces\/cburnett\/bQ\.svg/,
  )
  await expect(taken(page, 'black').locator('[data-role="pawn"] .taken-piece')).toHaveCount(2)

  // The bars swap with the board.
  await expect(page.locator('.player-bar').last()).toContainText('White')
  await page.getByRole('button', { name: 'Flip' }).click()
  await expect(page.locator('.player-bar').last()).toContainText('Black')

  // Stepping back takes the last capture off again.
  await page.keyboard.press('ArrowLeft')
  await expect(taken(page, 'white')).toHaveAccessibleName('White has taken 1 pawn')
  await expect(taken(page, 'black')).toHaveAccessibleName('Black has taken 2 pawns, ahead by 1')
  await page.keyboard.press('Home')
  await expect(taken(page, 'white')).toHaveCount(0)
})

test('analysis: the rows follow the move shown, in a variation too', async ({ page }) => {
  await openAnalysis(page, {
    pgn: '1. e4 d5 2. exd5 (2. Nc3 dxe4 3. Nxe4 Qd5 4. Nc3 Qxg2) 2... Qxd5 *',
  })
  await expect(taken(page, 'white')).toHaveAccessibleName('White has taken 1 pawn')
  await expect(taken(page, 'black')).toHaveAccessibleName('Black has taken 1 pawn')

  await page.locator('.variations').getByText('Qxg2').click()
  await expect(taken(page, 'white')).toHaveAccessibleName('White has taken 1 pawn')
  await expect(taken(page, 'black')).toHaveAccessibleName('Black has taken 2 pawns, ahead by 1')
  // Back to 2... dxe4, before White took back.
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft')
  await expect(taken(page, 'white')).toHaveCount(0)
  await expect(taken(page, 'black')).toHaveAccessibleName('Black has taken 1 pawn, ahead by 1')
})

test('analysis from a position: a pawn that promotes is not taken, the new queen can be', async ({
  page,
}) => {
  const board = await openAnalysis(page, { fen: '7r/P6k/8/8/8/8/8/K7 w - - 0 1' })
  // What is missing from a full set counts as taken before.
  const before = 'Black has taken 7 pawns, 2 knights, 2 bishops, 2 rooks, 1 queen'
  await expect(taken(page, 'black')).toHaveAccessibleName(`${before}, ahead by 4`)

  await expect(async () => {
    await board.drag('a7', 'a8')
    await page.getByRole('button', { name: 'Promote to queen' }).click({ timeout: 1000 })
  }).toPass()
  await expect(moves(page)).toHaveCount(1)
  await expect(taken(page, 'black')).toHaveAccessibleName(before)
  await expect(taken(page, 'white')).toHaveAccessibleName(
    'White has taken 8 pawns, 2 knights, 2 bishops, 1 rook, 1 queen, ahead by 4',
  )

  await board.play(['h8', 'a8'])
  await expect(taken(page, 'black')).toHaveAccessibleName(
    'Black has taken 7 pawns, 2 knights, 2 bishops, 2 rooks, 2 queens, ahead by 5',
  )
})

test('analysis from a position no game leads to: who has more of what', async ({ page }) => {
  // Three queens next to all eight pawns: nothing can be said about captures.
  await openAnalysis(page, { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/QNBQKBNQ w kq - 0 1' })
  await expect(taken(page, 'white')).toHaveAccessibleName('White has 2 queens more, ahead by 8')
  await expect(taken(page, 'black')).toHaveAccessibleName('Black has 2 rooks more')
  // Its own pieces this time, not taken ones.
  await expect(taken(page, 'white').locator('.taken-piece').first()).toHaveCSS(
    'background-image',
    /wQ\.svg/,
  )
})

test('bot game: both rows count what is gone from the board', async ({ page }) => {
  await page.goto('/bot')
  await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: /^1\b/ }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const board = await boardDriver(page)
  await expect(taken(page, 'white')).toHaveCount(0)

  // The queen runs up the h-file: it takes something or is taken, whatever the bot plays.
  for (const [from, to] of [
    ['e2', 'e4'],
    ['d1', 'h5'],
    ['h5', 'h6'],
    ['h6', 'h7'],
  ] as const) {
    const before = await moves(page).count()
    await board.drag(from, to)
    // An illegal drag (the queen is gone) plays nothing; otherwise wait for the bot's answer.
    await page.waitForTimeout(300)
    if ((await moves(page).count()) > before) {
      await expect(moves(page)).toHaveCount(before + 2, { timeout: 15_000 })
    }
  }

  const shown = async (color: 'white' | 'black') =>
    taken(page, color).locator('.taken-piece').count()
  const onBoard = (color: 'white' | 'black') =>
    page.locator(`cg-board piece.${color}:not(.ghost):not(.fading)`).count()
  await expect(async () => {
    const [byWhite, byBlack] = [await shown('white'), await shown('black')]
    expect(byWhite + byBlack).toBeGreaterThan(0)
    expect(byWhite).toBe(16 - (await onBoard('black')))
    expect(byBlack).toBe(16 - (await onBoard('white')))
  }).toPass()
  // Next to the players in the panel.
  await expect(page.locator('.bot-opponent .taken, .bot-you .taken').first()).toBeVisible()
})

test('on a phone the rows fit above and below the board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // Nearly everything is off the board, with a long name, a title and clocks.
  const pgn = [
    '[White "MagnusCarlsenFan2000"]',
    '[Black "rival"]',
    '[WhiteElo "2850"]',
    '[WhiteTitle "GM"]',
    '[SetUp "1"]',
    '[FEN "4k3/7p/8/8/8/8/P7/4K2R w K - 0 1"]',
    '',
    '1. Rh6 {[%clk 0:04:59]} Kd7 {[%clk 1:04:59]} 2. Rxh7+ {[%clk 0:04:50]} *',
  ].join('\n')
  await openAnalysis(page, { pgn })
  await expect(taken(page, 'white')).toHaveAccessibleName(/^White has taken 8 pawns.*ahead by 6$/)

  const boardBox = (await page.locator('cg-board').boundingBox())!
  expect(boardBox.width).toBeGreaterThan(300)
  for (const color of ['white', 'black'] as const) {
    const bar = (await page.getByTestId(`player-${color}`).boundingBox())!
    const row = (await taken(page, color).boundingBox())!
    expect(row.x).toBeGreaterThanOrEqual(bar.x)
    expect(row.x + row.width).toBeLessThanOrEqual(bar.x + bar.width)
    await expect(page.getByLabel(`${color} clock`)).toBeInViewport()
  }
  await expect(page.getByTestId('player-white')).toContainText('MagnusCarlsenFan2000')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
