import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

const GREEN = '#5f9e2f'
const BLUE = '#3f9fd8'
const RED = '#d64534'
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
      {
        ply: 4,
        san: 'd5',
        note: 'The challenge to e4.',
        draw: {
          arrows: [{ from: 'd5', to: 'e4', color: 'red' }],
          squares: [{ square: 'c6', color: 'green' }],
        },
      },
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

  // A guide move goes on the board with the coach's drawing of its idea, in place of the
  // arrows of what's played.
  await section.getByRole('button', { name: '2...d5' }).click()
  await expect(page.locator('.library-nav')).toContainText('1.e4 c6 2.d4 d5')
  await expect(page.getByText('The coach’s drawing of this move’s idea.')).toBeVisible()
  await expect(arrows(page)).toHaveCount(1)
  await expect(arrows(page, RED)).toHaveCount(1)
  await expect(page.locator(`svg.cg-shapes circle[stroke="${GREEN}"]`)).toHaveCount(1)
  await page.getByRole('button', { name: 'Show what’s played here' }).click()
  await expect(arrows(page, RED)).toHaveCount(0)
  await expect.poll(() => arrows(page).count()).toBeGreaterThan(1)

  // Watching the guide's line, the drawing comes with its move.
  await section.getByRole('button', { name: 'Learn this line' }).click()
  const panel = page.getByRole('complementary', { name: 'Learn the line' })
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await expect(panel.getByRole('status')).toHaveText('2...d5')
  await expect(panel).toContainText('The challenge to e4.')
  await expect(panel).toContainText('the coach’s drawing of this move’s idea')
  await expect(arrows(page, RED)).toHaveCount(1)
  await expect(page.locator(`svg.cg-shapes circle[stroke="${GREEN}"]`)).toHaveCount(1)
})

test('opening library: learn a line, watching it first, then playing it from memory', async ({
  page,
}) => {
  // The coach's notes on the line: none until asked for, then kept.
  const explained: string[][] = []
  const notes = {
    moves: ['e4', 'c6', 'd4', 'd5', 'e5'].map((san, i) => ({
      ply: i + 1,
      san,
      note: `Why ${san}.`,
    })),
    agent: 'Scripted coach',
    writtenAt: '2026-11-12T12:00:00.000Z',
  }
  await page.route(/\/api\/v1\/opening-library\/caro-kann\/line-notes/, (route) => {
    if (route.request().method() === 'POST') {
      explained.push((route.request().postDataJSON() as { moves: string[] }).moves)
      return route.fulfill({ json: notes })
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      json: { title: 'No notes', status: 404 },
    })
  })
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
  // No notes on this line yet: the coach writes one for every move, once.
  await panel.getByRole('button', { name: 'Explain every move' }).click()
  await expect(panel.getByRole('button', { name: 'Explain every move' })).toHaveCount(0)
  expect(explained).toEqual([['e4', 'c6', 'd4', 'd5', 'e5']])
  // The next three moves are on the board as arrows: Black's own (1...c6) in green.
  await expect(arrows(page)).toHaveCount(3)
  await expect(arrows(page, GREEN)).toHaveCount(1)
  await panel.getByRole('button', { name: 'Next ▶' }).click()
  await expect(panel.getByRole('status')).toHaveText('1.e4')
  await expect(panel).toContainText('Why e4.')
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

test('opening library: drill a trap from the side it is set for, and stay out of it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/training/library?id=scotch')
  // After 1.e4 e5 2.Nf3 Nc6 3.d4 Nf6 4.d5 most play 4...Nd4 and lose a pawn; 4...Nb8 holds.
  await page
    .getByRole('region', { name: 'Traps' })
    .getByRole('listitem')
    .filter({ hasText: 'play Nd4.' })
    .getByRole('button', { name: /^Avoid it/ })
    .click()
  const panel = page.getByRole('complementary', { name: 'Learn the line' })
  await expect(panel.getByRole('heading')).toHaveText(
    'Learn: Scotch Game, trap after 4...Nd4: avoid it',
  )
  await panel.getByRole('button', { name: 'Play it yourself' }).click()
  const board = await boardDriver(page)
  board.setFlipped(true) // Black at the bottom
  const move = async (from: string, to: string, expected: RegExp) => {
    await expect(panel.getByRole('status')).toHaveText(/^Your move/)
    await expect(async () => {
      await board.drag(from, to)
      await expect(panel.locator('.practice-feedback')).toHaveText(expected, { timeout: 500 })
    }).toPass({ timeout: 5000 })
  }
  await move('e7', 'e5', /^1\.\.\.e5, right\./)
  await move('b8', 'c6', /^2\.\.\.Nc6, right\./)
  await move('g8', 'f6', /^3\.\.\.Nf6, right\./)
  // The move most players make gets its own answer, and what follows it.
  await move(
    'c6',
    'd4',
    /^4\.\.\.Nd4 is the trap: after 5\. Nxe5 .* White scores \d+% under 1600\./,
  )
  await move('c6', 'b8', /^4\.\.\.Nb8, right\. This stays out of the trap\./)
  await expect(panel.getByRole('status')).toHaveText('Line done, with the arrows.')
  await panel.getByRole('button', { name: 'Back to the opening' }).click()
  await expect(page.locator('.library-nav')).toContainText('4.d5 Nb8')
})

test('opening library: practise against what real players reply', async ({ page }) => {
  // What is played, scripted: 2.a3 (in no named line), then mostly 2...d5, then no more games.
  const none = [0, 0, 0]
  const stats = (r: number[]) => ({
    'under-1200': r,
    '1200-1599': none,
    '1600-1999': none,
    '2000+': none,
  })
  const played: Record<string, object[]> = {
    'e4,c6': [{ san: 'a3', stats: stats([10, 0, 10]) }],
    'e4,c6,a3': [
      { san: 'd5', stats: stats([40, 10, 50]) },
      { san: 'e5', stats: stats([5, 0, 5]) },
    ],
  }
  await page.route('**/api/v1/opening-library/position?*', (route) => {
    const moves = played[new URL(route.request().url()).searchParams.get('moves') ?? '']
    return moves
      ? route.fulfill({ json: { moves } })
      : route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          json: { title: 'No games', status: 404 },
        })
  })
  // The check of the user's move (no engine in this test).
  await page.route('**/api/v1/training/openings/practice', (route) =>
    route.fulfill({ json: { verdict: 'theory', san: 'd5', fen: 'x', theory: [], replies: [] } }),
  )
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/training/library?id=caro-kann')
  await page.getByRole('button', { name: 'Practise against real replies' }).click()

  const panel = page.getByRole('complementary', { name: 'Practice' })
  await expect(panel.getByRole('heading')).toHaveText('Practise: Caro-Kann Defense as Black')
  await expect(panel).toContainText('Starts where the opening does, after 1.e4 c6.')
  // The reply is not in the Caro-Kann's named lines: the trainer says what players do then.
  await expect(panel).toContainText(
    '2.a3 leaves this opening’s named lines. Players of all ratings answer most with 2…d5 (91%), scoring 55%.',
  )
  const board = await boardDriver(page)
  board.setFlipped(true)
  await expect(panel.getByRole('status')).toHaveText('Your move.')
  await board.drag('d7', 'd5')
  await expect(panel.locator('.practice-right')).toHaveText('2…d5 is theory.')
  await expect(panel.getByRole('status')).toHaveText(
    'The library’s games end here: 1 of 1 moves right at the first try.',
  )
  await panel.getByRole('button', { name: 'Back to the opening' }).click()
  await expect(page.getByRole('heading', { name: /Caro-Kann Defense/ })).toBeVisible()
})

test('opening library: the user’s own games with an opening, and the coach for a position', async ({
  page,
}) => {
  // The user's openings, as "My openings" counts them: chess.com spells them without hyphens.
  await page.route(/\/api\/v1\/training\/openings\?/, (route) =>
    route.fulfill({
      json: {
        window: { last: 300, found: 120 },
        openings: [
          {
            color: 'black',
            family: 'Caro Kann Defense',
            tally: { games: 14, wins: 5, draws: 0, losses: 9, unfinished: 0, score: 36 },
            departures: { you: 6, them: 8, none: 0 },
          },
        ],
      },
    }),
  )
  await page.goto('/training/library?id=caro-kann')
  const summary = page.getByRole('region', { name: 'Summary' })
  await expect(summary).toContainText('You played it 14 times in your last 120 games, scoring 36%.')
  await expect(summary.getByRole('link', { name: 'Your games with it' })).toHaveAttribute(
    'href',
    /\/training\/openings\?color=black&family=Caro(\+|%20)Kann(\+|%20)Defense/,
  )

  // The position on the board goes to the analysis board, with the coach's tab in front.
  await page.getByRole('link', { name: 'Ask the coach' }).click()
  await expect(page).toHaveURL(/\/analysis\?pgn=.*coach=true/)
  await expect(page.getByRole('tab', { name: 'Coach' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(page.locator('.moves')).toContainText('c6')
})
