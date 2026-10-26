import { expect, test } from '@playwright/test'

test('shows the API as online (web → typed client → proxy → API)', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.api-status')).toHaveClass(/api-status-online/)
  await expect(page.locator('.api-status')).toHaveAttribute('title', /API \d+\.\d+\.\d+ online/)
})

test('has no console errors on load', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.waitForSelector('cg-board')
  expect(errors).toEqual([])
})
