import { createGame } from '@pawnia/chess'
import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

const UCI = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7']
const SAN = ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+', 'Kxf7']
const GAME = '[White "8sly"]\n[Black "rival"]\n\n1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7 *'
/** The coach's colours, as the board draws them. */
const COACH_GREEN = '#5f9e2f'
const COACH_RED = '#d64534'

/** A stored review of the game: 3. Qxf7+ is a blunder, 3. Bc4 was better. */
function review() {
  const game = createGame()
  const fens = [game.root.fen, ...UCI.map((uci) => game.play(uci)!.fen)]
  const moves = UCI.map((uci, i) => ({
    ply: i + 1,
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? 'white' : 'black',
    san: SAN[i],
    uci,
    winBefore: 50,
    winAfter: 50,
    accuracy: i === 4 ? 10 : 90,
    classification: i < 2 ? 'book' : i === 4 ? 'blunder' : 'best',
    facts: {},
    ...(i === 4 && { best: { uci: 'f1c4', san: 'Bc4', line: ['f1c4'] } }),
  }))
  return {
    startFen: fens[0],
    positions: fens.map((fen) => ({ fen, score: { type: 'cp', value: 0 }, whiteWin: 50 })),
    moves,
    accuracy: { white: 52, black: 90 },
    counts: { white: { blunder: 1 }, black: {} },
    settings: { engine: 'FakeFish 9', nodes: 500_000 },
  }
}

const WRITTEN = {
  summary: 'You gave your **queen** away on move 3.',
  opening: {
    name: "King's Pawn Game",
    ply: 2,
    text: 'A classical start.',
    record: { of: "King's Pawn Game", games: 12, wins: 5, draws: 1, losses: 6 },
  },
  moments: [{ ply: 5, what: 'The king simply takes.', better: 'Developing keeps the pressure.' }],
  focus: 'Check what guards a square before you go there.',
  agent: 'Claude (test)',
  writtenAt: '2026-11-06T12:00:00.000Z',
}

/** The server has a review of the game and a coach that writes; the user is 8sly. */
async function scriptedServer(
  page: Page,
  answer?: () => { status: number; json: unknown },
  pgn = GAME,
) {
  const asked: Record<string, unknown>[] = []
  await page.route('**/api/v1/library/reviews/find', (route) =>
    route.fulfill({ json: { review: review(), reviewedAt: '2026-11-05T10:00:00.000Z' } }),
  )
  await page.route('**/api/v1/coach/walkthroughs', (route) => {
    asked.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill(answer?.() ?? { json: WRITTEN })
  })
  await page.route('**/api/v1/coach', (route) =>
    route.fulfill({ json: { agents: [{ id: 'claude-api', label: 'Claude', available: true }] } }),
  )
  await page.route('**/api/v1/profile', (route) =>
    route.fulfill({
      json: {
        profile: {
          id: 'p1',
          displayName: '8sly',
          accounts: [{ source: 'chesscom', username: '8sly' }],
          createdAt: '2026-11-05T00:00:00.000Z',
          updatedAt: '2026-11-05T00:00:00.000Z',
        },
      },
    }),
  )
  await page.goto(`/analysis?${new URLSearchParams({ pgn })}`)
  await page.waitForSelector('cg-board')
  await page.getByRole('tab', { name: 'Review' }).click()
  return asked
}

const arrow = (page: Page, color: string) => page.locator(`svg.cg-shapes line[stroke="${color}"]`)

test('walk through a game: summary, opening, a moment and what to work on', async ({ page }) => {
  const asked = await scriptedServer(page)
  await page.getByRole('button', { name: 'Walk me through it' }).click()

  const tour = page.getByRole('region', { name: 'Coach walkthrough' })
  await expect(tour.locator('strong')).toHaveText('queen')
  await expect(tour).toContainText('1 of 4')
  await expect(tour).toContainText('Opening')
  expect(asked).toEqual([{ startFen: review().startFen, moves: UCI, side: 'white' }])

  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour.getByRole('heading', { name: "King's Pawn Game" })).toBeVisible()
  await expect(tour).toContainText("King's Pawn Game with white: 5 won, 1 drawn, 6 lost")

  // The moment: the board shows the move played; the better one waits until asked for.
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour).toContainText('The king simply takes.')
  await expect(tour).not.toContainText('Bc4')
  await expect(arrow(page, COACH_RED)).toHaveCount(1)
  await expect(arrow(page, COACH_GREEN)).toHaveCount(0)

  await tour.getByRole('button', { name: 'Show the better move' }).click()
  await expect(tour).toContainText('Better was Bc4')
  await expect(tour).toContainText('Developing keeps the pressure.')
  await expect(arrow(page, COACH_GREEN)).toHaveCount(1)

  // Asking the coach leaves the walkthrough where it was.
  await tour.getByRole('button', { name: 'Ask about this' }).click()
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible()
  await page.getByRole('tab', { name: 'Review' }).click()
  await expect(tour).toContainText('3 of 4')

  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour).toContainText('Check what guards a square')
  await tour.getByRole('button', { name: 'Done' }).click()
  await expect(tour).toHaveCount(0)
  await expect(page.getByTestId('accuracy-white')).toContainText('52.0')
})

test('look for the better move on the board: a wrong try, then the right one', async ({ page }) => {
  const tried: Record<string, unknown>[] = []
  await page.route('**/api/v1/coach/tries', (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    tried.push(request)
    return route.fulfill({
      json:
        request.tried === 'f1c4'
          ? { verdict: 'right', san: 'Bc4', fen: 'after' }
          : request.tried === 'h5f7'
            ? { verdict: 'played', san: 'Qxf7+', fen: 'after' }
            : {
                verdict: 'wrong',
                san: 'Qh4',
                fen: 'after',
                comment: 'Your queen just goes back.',
              },
    })
  })
  await scriptedServer(page)
  await page.getByRole('button', { name: 'Walk me through it' }).click()
  const tour = page.getByRole('region', { name: 'Coach walkthrough' })
  await tour.getByRole('button', { name: 'Next' }).click()
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour).toContainText('The king simply takes.')

  // The engine rests during a walkthrough: it would give the move away.
  await expect(page.getByTestId('engine-status')).toHaveCount(0)

  const board = await boardDriver(page)
  await tour.getByRole('button', { name: 'Find a better move' }).click()
  await expect(tour).toContainText('Your move')
  await board.drag('h5', 'h4')
  await expect(tour).toContainText("Qh4 isn't it.")
  await expect(tour).toContainText('Your queen just goes back.')
  await expect(tour).not.toContainText('Bc4')
  expect(tried[0]).toMatchObject({ ply: 5, tried: 'h5h4', moves: UCI })

  await tour.getByRole('button', { name: 'Try again' }).click()
  await board.drag('h5', 'f7')
  await expect(tour).toContainText("That's the move you played")

  await tour.getByRole('button', { name: 'Try again' }).click()
  await board.drag('f1', 'c4')
  await expect(tour).toContainText('Yes, Bc4 works!')
  await expect(tour).toContainText('Better was Bc4')
  await expect(arrow(page, COACH_GREEN)).toHaveCount(1)

  // None of it reached the game, and the engine is back after the walkthrough.
  await tour.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(page.locator('.move-tree [data-san]')).toHaveCount(6)
  await expect(page.getByTestId('engine-status')).toBeVisible()
})

test('nothing shows where the game went wrong while the coach walks through it', async ({
  page,
}) => {
  await scriptedServer(page)
  const graph = page.getByRole('img', { name: 'Evaluation graph' })
  const moments = page.getByRole('heading', { name: 'Key moments' })
  const badges = page.locator('.move-tree .class-badge')
  await expect(graph).toBeVisible()
  await expect(moments).toBeVisible()
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(badges).toHaveCount(1)

  await page.getByRole('tab', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Walk me through it' }).click()
  const tour = page.getByRole('region', { name: 'Coach walkthrough' })
  await expect(tour).toContainText('1 of 4')
  await expect(graph).toHaveCount(0)
  await expect(moments).toHaveCount(0)
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(page.locator('.move-tree [data-san]')).toHaveCount(6)
  await expect(badges).toHaveCount(0)

  // All of it is back once the walkthrough is over.
  await page.getByRole('tab', { name: 'Review' }).click()
  await tour.getByRole('button', { name: 'Close' }).click()
  await expect(graph).toBeVisible()
  await expect(moments).toBeVisible()
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(badges).toHaveCount(1)
})

test('the board turns to the side the user played', async ({ page }) => {
  const asBlack = GAME.replace('White "8sly"', 'White "rival"').replace(
    'Black "rival"',
    'Black "8sly"',
  )
  const asked = await scriptedServer(page, undefined, asBlack)
  await page.getByRole('button', { name: 'Walk me through it' }).click()
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/)
  expect(asked[0]).toMatchObject({ side: 'black' })
})

test('it can be written again', async ({ page }) => {
  const asked = await scriptedServer(page)
  await page.getByRole('button', { name: 'Walk me through it' }).click()
  await page.getByRole('button', { name: 'Write it again' }).click()
  await expect.poll(() => asked.length).toBe(2)
  expect(asked[1]).toMatchObject({ regenerate: true })
})

test('says why when there is no walkthrough', async ({ page }) => {
  await scriptedServer(page, () => ({
    status: 503,
    json: { title: 'Coach unavailable', detail: 'No Anthropic API key' },
  }))
  await page.getByRole('button', { name: 'Walk me through it' }).click()
  await expect(page.getByRole('alert')).toHaveText('No Anthropic API key')
  await expect(page.getByRole('button', { name: 'Walk me through it' })).toBeEnabled()
})
