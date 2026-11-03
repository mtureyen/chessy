import { expect, test } from '@playwright/test'

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
