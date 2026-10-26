import { expect, type Page } from '@playwright/test'

/** Drives the chessground board by square name. */
export async function boardDriver(page: Page) {
  await page.waitForSelector('cg-board')
  let flipped = false

  const center = async (square: string) => {
    const box = await page.locator('cg-board').boundingBox()
    if (!box) throw new Error('board not visible')
    const file = square.charCodeAt(0) - 97
    const rank = Number(square[1]) - 1
    const size = box.width / 8
    const col = flipped ? 7 - file : file
    const row = flipped ? rank : 7 - rank
    return { x: box.x + (col + 0.5) * size, y: box.y + (row + 0.5) * size }
  }

  return {
    setFlipped(value: boolean) {
      flipped = value
    },
    async click(square: string) {
      const p = await center(square)
      await page.mouse.click(p.x, p.y)
    },
    async drag(from: string, to: string) {
      const a = await center(from)
      const b = await center(to)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(b.x, b.y, { steps: 8 })
      await page.mouse.up()
    },
    /** Drags each move and waits until the move list shows it before the next one. */
    async play(...moves: [string, string][]) {
      const played = page.locator('.move-list button.move')
      for (const [from, to] of moves) {
        const before = await played.count()
        await this.drag(from, to)
        await expect(played).toHaveCount(before + 1)
      }
    },
  }
}
