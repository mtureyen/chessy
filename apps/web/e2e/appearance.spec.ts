import { expect, test, type Page } from '@playwright/test'

test('a8 and h1 are light squares, a1 and h8 dark', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('cg-board')
  await page.evaluate(() => document.querySelectorAll('cg-board piece').forEach((p) => p.remove()))
  const png = (await page.locator('cg-board').screenshot()).toString('base64')
  // Read the screenshot back through a canvas: the colour in the middle of each corner square.
  const corners = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const at = (x: number, y: number) => {
      const [r, g, b] = ctx.getImageData(
        Math.floor(img.width * x),
        Math.floor(img.height * y),
        1,
        1,
      ).data
      return `rgb(${r}, ${g}, ${b})`
    }
    return {
      a8: at(1 / 16, 1 / 16),
      h8: at(15 / 16, 1 / 16),
      a1: at(1 / 16, 15 / 16),
      h1: at(15 / 16, 15 / 16),
    }
  }, png)
  const light = 'rgb(235, 236, 208)'
  const dark = 'rgb(119, 149, 86)'
  expect(corners).toEqual({ a8: light, h8: dark, a1: dark, h1: light })
})

const pieceImage = (page: Page) =>
  page
    .locator('cg-board piece.white.knight')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundImage)

const rootVariable = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

test('board theme and piece set can be changed and survive a reload', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('cg-board')
  expect(await pieceImage(page)).toContain('/pieces/cburnett/wN.svg')

  await page.getByRole('button', { name: 'Board settings' }).click()
  const panel = page.getByRole('dialog', { name: 'Board settings' })
  await panel.getByRole('button', { name: 'Blue' }).click()
  await panel.getByRole('button', { name: 'Merida' }).click()
  await expect(panel.getByRole('button', { name: 'Merida' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await rootVariable(page, '--board-dark')).toBe('#8ca2ad')
  expect(await pieceImage(page)).toContain('/pieces/merida/wN.svg')

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  await page.reload()
  await page.waitForSelector('cg-board')
  expect(await rootVariable(page, '--board-dark')).toBe('#8ca2ad')
  expect(await pieceImage(page)).toContain('/pieces/merida/wN.svg')
})

test('coordinates can be turned off', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('cg-container coords').first()).toBeVisible()
  await page.getByRole('button', { name: 'Board settings' }).click()
  await page.getByRole('checkbox', { name: 'Coordinates' }).uncheck()
  await expect(page.locator('cg-container coords')).toHaveCount(0)
})
