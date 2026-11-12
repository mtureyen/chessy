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

  // The opening shows how far the user is with it, the line that it's kept, the tab what is due.
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText(
    /\d lines? in your repertoire, \d due\. Review them/,
  )
  await expect(
    page
      .getByRole('region', { name: 'Named lines' })
      .getByRole('button', { name: /^Advance Variation/ })
      .first(),
  ).toContainText('In your repertoire')
  const tab = page
    .getByRole('navigation', { name: 'Training' })
    .getByRole('link', { name: 'My repertoire' })
  await expect(tab.locator('.training-due')).toHaveText(/^\d+$/)
  await page.goto('/training/library')
  await page.getByRole('button', { name: 'Black', exact: true }).click()
  await expect(page.getByRole('link', { name: /Caro-Kann Defense/ })).toContainText(
    /\d lines? in your repertoire/,
  )

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

test('repertoire: a review tells the coach’s note where a move was missed', async ({ page }) => {
  // The opening's guide, as the coach wrote it; and what a move off the line is worth.
  await page.route('**/api/v1/opening-library/caro-kann/guide', (route) =>
    route.fulfill({
      json: {
        story: 'A story.',
        ideas: 'Ideas.',
        opponents: 'Opponents.',
        moves: [
          { ply: 1, san: 'e4', note: 'White takes the centre.' },
          { ply: 2, san: 'c6', note: 'Black prepares ...d5.' },
          { ply: 3, san: 'd4', note: 'A broad centre.' },
          { ply: 4, san: 'd5', note: 'The challenge to e4.' },
        ],
        agent: 'Scripted coach',
        writtenAt: '2026-11-11T12:00:00.000Z',
      },
    }),
  )
  await page.route('**/api/v1/training/openings/practice', (route) =>
    route.fulfill({ json: { verdict: 'wrong', san: 'g6', fen: 'x', theory: [], replies: [] } }),
  )
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/training/library?id=caro-kann')
  await page
    .getByRole('region', { name: 'Named lines' })
    .getByRole('button', { name: /^Exchange Variation/ })
    .first()
    .click()
  await expect(page.locator('.library-nav')).toContainText('3.exd5')
  await page.getByRole('button', { name: 'Add to my repertoire' }).click()
  await expect(page.locator('.library-nav').getByRole('status')).toHaveText('In your repertoire')

  await page.goto('/training/repertoire')
  const row = page
    .getByRole('region', { name: 'With Black' })
    .getByRole('listitem')
    .filter({ hasText: 'Caro-Kann Defense: Exchange Variation' })
  await row.getByRole('button', { name: 'Review' }).click()

  const panel = page.getByRole('complementary', { name: 'Learn the line' })
  await expect(panel).toContainText('Play your moves from memory.')
  // In the middle of a review the line can't be looked at.
  await expect(panel.getByRole('button', { name: 'Watch it again' })).toHaveCount(0)
  const board = await boardDriver(page)
  board.setFlipped(true)
  const move = async (from: string, to: string, expected: RegExp) => {
    await expect(panel.getByRole('status')).toHaveText(/^Your move/)
    await expect(async () => {
      await board.drag(from, to)
      await expect(panel.locator('.practice-feedback')).toHaveText(expected, { timeout: 500 })
    }).toPass({ timeout: 5000 })
  }
  // A move that came by itself gets no note; a missed one does.
  await move('c7', 'c6', /^1\.\.\.c6, right\.$/)
  await move('g7', 'g6', /^2\.\.\.g6 is a mistake here\. Try again\.$/)
  await move('d7', 'd5', /^2\.\.\.d5, right\. The challenge to e4\.$/)
  await expect(panel.getByRole('status')).toHaveText(
    'Line done: 1 of 2 moves right at the first try.',
  )
  // Watching it now and playing it again without a mistake doesn't change the result.
  await panel.getByRole('button', { name: 'Watch it again' }).click()
  await panel.getByRole('button', { name: 'Play it yourself' }).click()
  await move('c7', 'c6', /^1\.\.\.c6, right\.$/)
  await move('d7', 'd5', /^2\.\.\.d5, right\.$/)
  await expect(panel.getByRole('status')).toHaveText(
    'Line done: 2 of 2 moves right at the first try.',
  )
  await panel.getByRole('button', { name: 'Next line' }).click()
  await expect(page.getByRole('region', { name: 'Review done' })).toContainText(
    '0 of 1 line without a mistake',
  )
  await page.getByRole('button', { name: 'Back to my repertoire' }).click()
  await expect(row).toContainText('In 1 day')
  await row.getByRole('button', { name: /^Remove/ }).click()
  await expect(row).toHaveCount(0)
})
