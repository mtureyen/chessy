import { expect, test, type Page } from '@playwright/test'

async function squareCenter(page: Page, square: string) {
  const box = (await page.locator('cg-board').boundingBox())!
  const size = box.width / 8
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  return { x: box.x + (file + 0.5) * size, y: box.y + (7 - rank + 0.5) * size }
}

async function rightClick(page: Page, square: string, modifier?: 'Shift' | 'Alt') {
  const { x, y } = await squareCenter(page, square)
  if (modifier) await page.keyboard.down(modifier)
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  // chessground finds the square under the mouse on the next frame; a real click takes that long.
  await page.waitForTimeout(50)
  await page.mouse.up({ button: 'right' })
  if (modifier) await page.keyboard.up(modifier)
}

const marked = (page: Page, cls: string) => page.locator(`cg-board square.${cls}`)

test('right-click colours squares, right-drag draws arrows, left-click clears them', async ({
  page,
}) => {
  await page.goto('/analysis')
  await page.waitForSelector('cg-board')

  await rightClick(page, 'e4')
  await expect(marked(page, 'mark-default')).toHaveCount(1)
  await rightClick(page, 'd5', 'Shift')
  await expect(marked(page, 'mark-green')).toHaveCount(1)
  await rightClick(page, 'e4') // again: cleared
  await expect(marked(page, 'mark-default')).toHaveCount(0)

  const from = await squareCenter(page, 'g1')
  const to = await squareCenter(page, 'f3')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.waitForTimeout(50)
  await page.mouse.up({ button: 'right' })
  await expect(page.locator('svg.cg-shapes line[stroke="#ffaa00"]')).toHaveCount(1)

  const empty = await squareCenter(page, 'e5')
  await page.mouse.click(empty.x, empty.y)
  await expect(marked(page, 'mark-green')).toHaveCount(0)
  await expect(page.locator('svg.cg-shapes line[stroke="#ffaa00"]')).toHaveCount(0)
})

test('markings stay when the board is flipped and clear with a new position', async ({ page }) => {
  await page.goto('/analysis')
  await page.waitForSelector('cg-board')
  await rightClick(page, 'e4')
  await page.keyboard.press('f')
  await expect(marked(page, 'mark-default')).toHaveCount(1)
  await page.keyboard.press('f')

  const e2 = await squareCenter(page, 'e2')
  const e4 = await squareCenter(page, 'e4')
  await page.mouse.move(e2.x, e2.y)
  await page.mouse.down()
  await page.mouse.move(e4.x, e4.y, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('.move-tree [data-san="e4"]')).toHaveCount(1)
  await expect(marked(page, 'mark-default')).toHaveCount(0)
})
