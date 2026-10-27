import { expect, test } from '@playwright/test'
import { boardDriver } from './board'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

const status = (page: import('@playwright/test').Page) => page.locator('.status')
const fen = (page: import('@playwright/test').Page) => page.locator('#fen')
const moves = (page: import('@playwright/test').Page) => page.locator('.move-tree')

async function load(page: import('@playwright/test').Page, text: string) {
  await page.fill('#import', text)
  await page.getByRole('button', { name: 'Load' }).click()
}

test('moves by click and by drag, rejects illegal moves', async ({ page }) => {
  const board = await boardDriver(page)
  await board.click('e2')
  await expect(page.locator('cg-board square.move-dest')).toHaveCount(2)
  await board.click('e4')
  await expect(moves(page)).toContainText('e4')
  await board.play(['e7', 'e5'])
  await expect(moves(page)).toContainText('e5')

  const before = await fen(page).inputValue()
  await board.drag('e1', 'e3')
  await expect(fen(page)).toHaveValue(before)
})

test("detects checkmate and freezes the board (fool's mate)", async ({ page }) => {
  const board = await boardDriver(page)
  await board.play(['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'])
  await expect(status(page)).toHaveText('Checkmate · Black wins')
  await expect(page.locator('cg-board square.check')).toHaveCount(1)

  await page.keyboard.press('ArrowLeft')
  await expect(status(page)).toHaveText('Black to move')
})

test('promotes via the picker and can cancel it', async ({ page }) => {
  const board = await boardDriver(page)
  await load(page, '1n5k/P7/8/8/8/8/8/K7 w - - 0 1')

  await board.drag('a7', 'b8')
  await expect(page.locator('.promotion-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.promotion-dialog')).toBeHidden()
  await expect(fen(page)).toHaveValue('1n5k/P7/8/8/8/8/8/K7 w - - 0 1')

  await board.click('a7')
  await board.click('a8')
  await page.getByRole('button', { name: 'Promote to knight' }).click()
  await expect(fen(page)).toHaveValue(/^Nn5k\/8/)
  await expect(moves(page)).toContainText('a8=N')
})

test('castles by dragging the king, also onto the rook', async ({ page }) => {
  const board = await boardDriver(page)
  await load(page, 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1')
  await board.drag('e1', 'g1')
  await expect(fen(page)).toHaveValue(/R4RK1 b kq/)
  await board.drag('e8', 'a8')
  await expect(fen(page)).toHaveValue(/^2kr3r\//)
})

test('imports PGN with variations onto the main line, reports bad input', async ({ page }) => {
  await load(page, '1. e4 (1. d4 d5) e5 2. Nf3 Nc6 3. Bb5 a6 *')
  await expect(page.locator('.message')).toHaveText('Game loaded')
  await expect(moves(page)).toContainText('Bb5')
  // The side line is shown as a variation block, the main line stays in the rows.
  await expect(page.locator('.variations')).toHaveText('1. d4 d5')
  await expect(page.locator('.move-row')).not.toContainText(['d4'])
  await expect(page.locator('.move-current')).toHaveText('a6')

  await load(page, 'garbage that is not chess')
  await expect(page.locator('.message')).toHaveText('No game found in PGN')
})

test('flips the board', async ({ page }) => {
  await expect(page.locator('cg-container coords.ranks')).not.toHaveClass(/black/)
  await page.keyboard.press('f')
  await expect(page.locator('cg-container coords.ranks')).toHaveClass(/black/)
})
