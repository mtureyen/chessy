import { expect, test } from '@playwright/test'
import { boardDriver } from './board'

test('repertoire: keep a line from the library, review it, and it comes back later', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/training/library?id=caro-kann')
  await page
    .getByRole('region', { name: 'Named lines' })
    .getByRole('button', { name: /^Advance Variation/ })
    .first()
    .click()
  await expect(page.locator('.library-nav')).toContainText('3.e5')
  await page.getByRole('button', { name: 'Add to my repertoire' }).click()
  await expect(page.locator('.library-nav').getByRole('status')).toHaveText('In your repertoire')

  await page
    .getByRole('navigation', { name: 'Training' })
    .getByRole('link', { name: 'My repertoire' })
    .click()
  const black = page.getByRole('region', { name: 'With Black' })
  const row = black
    .getByRole('listitem')
    .filter({ hasText: 'Caro-Kann Defense: Advance Variation' })
  await expect(row).toContainText('Due now')
  await row.getByRole('button', { name: 'Review' }).click()

  const panel = page.getByRole('complementary', { name: 'Learn the line' })
  const board = await boardDriver(page)
  board.setFlipped(true)
  const move = async (from: string, to: string, expected: RegExp) => {
    await expect(panel.getByRole('status')).toHaveText(/^Your move/)
    await expect(async () => {
      await board.drag(from, to)
      await expect(panel.locator('.practice-feedback')).toHaveText(expected, { timeout: 500 })
    }).toPass({ timeout: 5000 })
  }
  await move('c7', 'c6', /^1\.\.\.c6, right\./)
  await move('d7', 'd5', /^2\.\.\.d5, right\./)
  await expect(panel.getByRole('status')).toHaveText(
    'Line done: 2 of 2 moves right at the first try.',
  )
  await panel.getByRole('button', { name: 'Next line' }).click()
  await expect(page.getByRole('region', { name: 'Review done' })).toContainText(
    '1 of 1 line without a mistake',
  )
  await page.getByRole('button', { name: 'Back to my repertoire' }).click()
  await expect(row).toContainText('In 1 day')

  await row.getByRole('button', { name: /^Remove/ }).click()
  await expect(row).toHaveCount(0)
})
