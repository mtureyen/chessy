import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

const RUY_LOPEZ = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 (3... Nf6 4. O-O) 4. Ba4 *'

const engineStatus = (page: Page) => page.getByTestId('engine-status')
const moveTree = (page: Page) => page.locator('.move-tree')

async function openAnalysis(page: Page, search: Record<string, string> = {}) {
  await page.goto(`/analysis?${new URLSearchParams(search)}`)
  await page.waitForSelector('cg-board')
}

/** Waits until the engine reports at least `depth` for the current position. */
async function waitForDepth(page: Page, depth: number) {
  await expect
    .poll(
      async () => Number((await engineStatus(page).innerText()).match(/Depth (\d+)/)?.[1] ?? 0),
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThanOrEqual(depth)
}

test('analyses a game from the URL: eval, best lines, arrows, eval bar', async ({ page }) => {
  await openAnalysis(page, { pgn: RUY_LOPEZ })
  await expect(moveTree(page).locator('.move-current')).toHaveText('Ba4')
  await expect(page.locator('.variations')).toHaveText('3... Nf6 4. O-O')

  await waitForDepth(page, 10)
  await expect(page.locator('.engine-line')).toHaveCount(3)
  await expect(page.getByTestId('engine-eval')).toHaveText(/^[+-]\d+\.\d\d$/)
  await expect(page.locator('svg.cg-shapes line').first()).toBeAttached()
  await expect(page.getByRole('meter', { name: 'Evaluation' })).toHaveAttribute(
    'aria-valuetext',
    /\d\.\d\d/,
  )
})

test('clicking a move in an engine line plays the line up to it', async ({ page }) => {
  await openAnalysis(page)
  await waitForDepth(page, 8)
  const firstLine = page.locator('.engine-line').first()
  // Lines keep updating while the engine thinks: read and click in one step.
  const clicked = await firstLine
    .locator('.engine-line-move')
    .nth(1)
    .evaluate((button: HTMLElement) => {
      const text = button.textContent ?? ''
      button.click()
      return text
    })
  await expect(moveTree(page).locator('.move-current')).toHaveText(
    clicked.replace(/^\d+\.+\s*/, ''),
  )
  await expect(moveTree(page).locator('button.move')).toHaveCount(2)
})

test('promotes, makes main line and deletes variations', async ({ page }) => {
  await openAnalysis(page, { pgn: RUY_LOPEZ })
  await page.locator('.variation-move', { hasText: 'O-O' }).click()
  await expect(page.getByRole('button', { name: 'Main line' })).toBeEnabled()

  await page.getByRole('button', { name: 'Main line' }).click()
  await expect(page.locator('.move-row').nth(2)).toContainText('Nf6')
  await expect(page.locator('.move-row').nth(3)).toContainText('O-O')
  await expect(page.locator('.variations')).toHaveText('3... a6 4. Ba4')

  await page.locator('.variation-move', { hasText: 'a6' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.variations')).toHaveCount(0)
  await expect(moveTree(page).locator('.move-current')).toHaveText('Bb5')
})

test('moves on the board create variations instead of overwriting', async ({ page }) => {
  await openAnalysis(page, { pgn: '1. e4 e5 2. Nf3 *' })
  await page.keyboard.press('ArrowLeft')
  const board = await boardDriver(page)
  await board.play(['b1', 'c3'])
  await expect(page.locator('.variations')).toHaveText('2. Nc3')
  await expect(page.locator('.move-row').nth(1)).toContainText('Nf3')
})

test('engine can be switched off and on (switch and L key)', async ({ page }) => {
  await openAnalysis(page)
  await waitForDepth(page, 5)
  await page.getByRole('checkbox', { name: 'Engine' }).uncheck()
  await expect(engineStatus(page)).toHaveText('Off')
  await expect(page.locator('.engine-line')).toHaveCount(0)
  await expect(page.locator('svg.cg-shapes line')).toHaveCount(0)

  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('l')
  await waitForDepth(page, 5)
  await expect(page.locator('.engine-line')).toHaveCount(3)
})

test('shows game over for a checkmate and flips the eval bar with the board', async ({ page }) => {
  await openAnalysis(page, { fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3' })
  await expect(engineStatus(page)).toHaveText('Game over')
  const bar = page.getByRole('meter', { name: 'Evaluation' })
  await expect(bar).toHaveAttribute('aria-valuetext', '0-1')
  await expect(bar).toHaveAttribute('aria-valuenow', '0')

  await page.keyboard.press('f')
  await expect(bar).toHaveClass(/eval-bar-flipped/)
})

test('reports an invalid position in the URL and falls back to the start', async ({ page }) => {
  await openAnalysis(page, { fen: 'not a fen' })
  await expect(page.locator('.analysis-load-error')).toContainText('Could not open')
  await expect(page.locator('.status')).toHaveText('White to move')
})

test('the play page hands its game to the analysis board', async ({ page }) => {
  await page.goto('/')
  const board = await boardDriver(page)
  await board.play(['e2', 'e4'], ['c7', 'c5'])
  await page.getByRole('button', { name: 'Analyse' }).click()
  await expect(page).toHaveURL(/\/analysis\?pgn=/)
  await expect(moveTree(page).locator('.move-current')).toHaveText('c5')
  await expect(page.getByRole('link', { name: 'Analysis' })).toHaveClass(/active/)
})

test('arrows drawn by the user survive engine updates', async ({ page }) => {
  await openAnalysis(page)
  await waitForDepth(page, 5)
  const box = (await page.locator('cg-board').boundingBox())!
  const square = (file: number, rank: number) => ({
    x: box.x + (file + 0.5) * (box.width / 8),
    y: box.y + (7 - rank + 0.5) * (box.width / 8),
  })
  // Right-drag a1 → h8: an arrow no engine line would suggest.
  const from = square(0, 0)
  const to = square(7, 7)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up({ button: 'right' })

  const arrows = page.locator('svg.cg-shapes line')
  const engineArrows = 3
  await expect(arrows).toHaveCount(engineArrows + 1)
  // Let the engine deliver a few more depths (each one replaces the engine arrows).
  const depthNow = Number((await engineStatus(page).innerText()).match(/Depth (\d+)/)?.[1] ?? 0)
  await waitForDepth(page, depthNow + 2)
  await expect(arrows).toHaveCount(engineArrows + 1)
})
