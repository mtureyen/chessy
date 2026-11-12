import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

const GREEN = '#5f9e2f'
const BLUE = '#3f9fd8'
/** The arrows the app drew on the board, all or of one colour. */
const arrows = (page: Page, color?: string) =>
  page.locator(color ? `svg.cg-shapes line[stroke="${color}"]` : 'svg.cg-shapes line')

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

test('opening library: arrows show what is played, and the move pointed at', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/training/library?id=caro-kann')
  // After 1.e4 c6: 2.d4 and the other moves of the Caro-Kann in green, none pointed at.
  await expect.poll(() => arrows(page, GREEN).count()).toBeGreaterThan(1)
  await expect(arrows(page, BLUE)).toHaveCount(0)
  const all = await arrows(page).count()

  const explorer = page.getByRole('complementary', { name: 'What is played here' })
  await explorer.getByRole('button').filter({ hasText: /^Nc3$/ }).hover()
  await expect(arrows(page, BLUE)).toHaveCount(1)
  await expect(arrows(page)).toHaveCount(all)
  await page.getByRole('heading', { name: /Caro-Kann Defense/ }).hover()
  await expect(arrows(page, BLUE)).toHaveCount(0)

  // Switched off, they stay off in this browser.
  await page.getByRole('button', { name: 'Arrows' }).click()
  await expect(arrows(page)).toHaveCount(0)
  await page.reload()
  await expect(explorer.getByRole('button').filter({ hasText: /^d4$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Arrows' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(arrows(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Arrows' }).click()
  await expect(arrows(page)).toHaveCount(all)
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

test('opening library: learn a line, watching it first, then playing it from memory', async ({
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
  await page.getByRole('button', { name: 'Learn this line' }).first().click()

  const panel = page.getByRole('complementary', { name: 'Learn the line' })
  await expect(panel).toContainText('Step 1 of 2: watch the line.')
  await expect(panel.getByRole('status')).toHaveText('The start position.')
  // The next three moves are on the board as arrows: Black's own (1...c6) in green.
  await expect(arrows(page)).toHaveCount(3)
  await expect(arrows(page, GREEN)).toHaveCount(1)
  await panel.getByRole('button', { name: 'Next ▶' }).click()
  await expect(panel.getByRole('status')).toHaveText('1.e4')
  await page.keyboard.press('ArrowRight')
  await expect(panel.getByRole('status')).toHaveText('1...c6')
  await page.keyboard.press('ArrowLeft')
  await expect(panel.getByRole('status')).toHaveText('1.e4')

  // The line plays by itself until paused; the arrows can be switched off.
  await panel.getByRole('button', { name: 'Play through' }).click()
  await expect(panel.getByRole('status')).toHaveText('2.d4', { timeout: 8000 })
  await panel.getByRole('button', { name: 'Pause' }).click()
  await expect(panel.getByRole('button', { name: 'Play through' })).toBeVisible()
  await expect(arrows(page)).toHaveCount(2)
  await panel.getByRole('button', { name: 'Arrows' }).click()
  await expect(arrows(page)).toHaveCount(0)
  await panel.getByRole('button', { name: 'Arrows' }).click()
  await expect(arrows(page)).toHaveCount(2)

  // What a move off the line is worth comes from the server (no engine in this test).
  await page.route('**/api/v1/training/openings/practice', (route) =>
    route.fulfill({
      json: { verdict: 'playable', san: 'g6', fen: 'x', theory: [], replies: [] },
    }),
  )
  await panel.getByRole('button', { name: 'Play it yourself' }).click()
  await expect(panel).toContainText('Step 2 of 2: play your moves. This time the arrows show them.')
  const board = await boardDriver(page)
  board.setFlipped(true) // Black at the bottom
  /** A move once it's the user's turn (the board may still be moving the other side's piece). */
  const move = async (from: string, to: string, expected: RegExp) => {
    await expect(panel.getByRole('status')).toHaveText(/^Your move/)
    await expect(async () => {
      await board.drag(from, to)
      await expect(panel.locator('.practice-feedback')).toHaveText(expected, { timeout: 500 })
    }).toPass({ timeout: 5000 })
  }
  // The first run shows every move of Black's as an arrow.
  await expect(panel.getByRole('status')).toHaveText(/^Your move/)
  await expect(arrows(page, GREEN)).toHaveCount(1)
  await move('c7', 'c6', /^1\.\.\.c6, right\./)
  await move(
    'g7',
    'g6',
    /^2\.\.\.g6 is playable, but this line’s move is better\. The arrow shows it\.$/,
  )
  await move('d7', 'd5', /^2\.\.\.d5, right\./)
  await expect(panel.getByRole('status')).toHaveText('Line done, with the arrows.')

  // The second run shows a move only after a miss.
  await panel.getByRole('button', { name: 'Again, with less help' }).click()
  await expect(panel).toContainText('An arrow comes only after a miss.')
  await expect(panel.getByRole('status')).toHaveText(/^Your move/)
  await expect(arrows(page)).toHaveCount(0)
  await move(
    'g7',
    'g6',
    /^1\.\.\.g6 is playable, but this line’s move is better\. The arrow shows it\.$/,
  )
  await expect(arrows(page, GREEN)).toHaveCount(1)
  await move('c7', 'c6', /^1\.\.\.c6, right\./)
  await move('d7', 'd5', /^2\.\.\.d5, right\./)
  await expect(panel.getByRole('status')).toHaveText(
    'Line done: 1 of 2 moves right at the first try.',
  )

  // The third is from memory; "Without help" would have gone there straight away.
  await panel.getByRole('button', { name: 'Again, from memory' }).click()
  await expect(panel).toContainText('Step 2 of 2: play your moves from memory.')
  await expect(panel.getByRole('button', { name: 'Without help' })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Back to the opening' }).click()
  await expect(page.locator('.library-nav')).toContainText('3.e5')
})
