import { expect, test } from '@playwright/test'
import { boardDriver } from './board'

// The E2E API serves the checked-in library (apps/api/data/opening-library.json).

test('opening library: pick Black, open the Caro-Kann and explore what is played', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/training')
  await page
    .getByRole('navigation', { name: 'Training' })
    .getByRole('link', { name: 'Opening library' })
    .click()
  await expect(page.getByRole('region', { name: 'For White' })).toContainText('Italian Game')

  await page.getByRole('button', { name: 'Black', exact: true }).click()
  await expect(page.getByRole('region', { name: 'For Black against 1.d4' })).toContainText(
    'Slav Defense',
  )
  await page
    .getByRole('region', { name: 'For Black against 1.e4' })
    .getByRole('link', { name: /Caro-Kann Defense/ })
    .click()
  await expect(page).toHaveURL(/id=caro-kann/)
  await expect(page.getByRole('heading', { name: /Caro-Kann Defense/ })).toBeVisible()

  // After 1.e4 c6 White plays 2.d4 most; a click explores it, and the board can go on.
  const explorer = page.getByRole('complementary', { name: 'What is played here' })
  await expect(explorer.getByRole('button').filter({ hasText: /^d4$/ })).toBeVisible()
  await explorer.getByRole('button').filter({ hasText: /^d4$/ }).click()
  await expect(page.locator('.library-nav')).toContainText('1.e4 c6 2.d4')
  const board = await boardDriver(page)
  board.setFlipped(true) // Black's side at the bottom
  await board.drag('d7', 'd5')
  await expect(page.locator('.library-nav')).toContainText('2.d4 d5')
  await expect(explorer.getByRole('button').filter({ hasText: /^e5$/ })).toBeVisible()

  // Named lines: the most played first, the rest on request.
  const lines = page.getByRole('region', { name: 'Named lines' })
  await lines
    .getByRole('button', { name: /^Advance Variation/ })
    .first()
    .click()
  await expect(page.locator('.library-nav')).toContainText('3.e5')
  await expect(lines.getByRole('button', { name: /Show all \d+ lines/ })).toBeVisible()
})

test('opening library: a trap shows on the board', async ({ page }) => {
  await page.goto('/training/library?id=italian')
  const traps = page.getByRole('region', { name: 'Traps' })
  await expect(traps).toContainText('A trap you can set')
  await expect(traps).toContainText('play Ke8. White then scores')
  await traps
    .getByRole('listitem')
    .filter({ hasText: 'play Ke8.' })
    .getByRole('button', { name: 'Show on the board' })
    .click()
  await expect(page.locator('.library-nav')).toContainText('7.Qf3+')
  await expect(
    page.getByRole('complementary', { name: 'What is played here' }).getByRole('button').filter({
      hasText: /^Ke8$/,
    }),
  ).toBeVisible()
})

test('opening library: the coach writes a guide once, and its moves go on the board', async ({
  page,
}) => {
  const guide = {
    story: 'Named after **Horatio Caro** and Marcus Kann.',
    ideas: 'Prepare ...d5 with ...c6.',
    opponents: 'Most play 2.d4.',
    moves: [
      { ply: 1, san: 'e4', note: 'White takes the centre.' },
      { ply: 2, san: 'c6', note: 'Black prepares ...d5.' },
      { ply: 3, san: 'd4', note: 'A broad centre.' },
      { ply: 4, san: 'd5', note: 'The challenge to e4.' },
    ],
    agent: 'Scripted coach',
    writtenAt: '2026-11-11T12:00:00.000Z',
  }
  let written = 0
  await page.route('**/api/v1/opening-library/caro-kann/guide', (route) => {
    if (route.request().method() === 'POST') {
      written++
      return route.fulfill({ json: guide })
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      json: { title: 'No guide', status: 404 },
    })
  })
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/training/library?id=caro-kann')
  const section = page.getByRole('region', { name: 'Guide' })
  await expect(section).toContainText('The coach can write a guide to the Caro-Kann Defense')
  await section.getByRole('button', { name: 'Write the guide' }).click()
  await expect(section.getByRole('heading', { name: 'The story' })).toBeVisible()
  await expect(section.locator('strong')).toHaveText('Horatio Caro')
  await expect(section).toContainText('Written by Scripted coach')
  expect(written).toBe(1)

  await section.getByRole('button', { name: '2...d5' }).click()
  await expect(page.locator('.library-nav')).toContainText('1.e4 c6 2.d4 d5')
})
