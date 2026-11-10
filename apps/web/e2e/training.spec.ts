import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

const AFTER_NC6 = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3'
const UCI = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7']

const WHY = 'Bc4 brings a second attacker to **f7**.'

const puzzle = (ply: number, id: string, explanation?: string) => ({
  line: {
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: UCI,
  },
  ply,
  fen: AFTER_NC6,
  color: 'white',
  played: '3. Qxf7+',
  verdict: 'blunder',
  best: { move: 'Bc4', uci: 'f1c4', line: '3. Bc4 Nf6' },
  game: { id, opponent: 'rival', date: '2026-11-02' },
  ...(explanation && { explanation }),
})

/** A server with two puzzles due; a move to c4 is right, anything else wrong. */
async function scriptedServer(page: Page, due = [puzzle(5, 'a', WHY), puzzle(5, 'b')]) {
  const results: Record<string, unknown>[] = []
  await page.route('**/api/v1/training', (route) =>
    route.fulfill({ json: { due, waiting: 1, solved: 2 } }),
  )
  await page.route('**/api/v1/training/results', (route) => {
    results.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill({ json: { stored: true } })
  })
  await page.route('**/api/v1/coach/tries', (route) => {
    const { tried } = route.request().postDataJSON() as { tried: string }
    return route.fulfill({
      json:
        tried === 'f1c4'
          ? { verdict: 'right', san: 'Bc4', fen: 'after' }
          : { verdict: 'wrong', san: 'Qh4', fen: 'after', comment: 'Your queen just goes back.' },
    })
  })
  await page.goto('/training')
  return results
}

test('train my mistakes: solve one at once and see why, miss the next', async ({ page }) => {
  const results = await scriptedServer(page)
  await expect(page.getByRole('status')).toHaveText('2 to do · 1 coming back later · 2 solved')
  await page.getByRole('button', { name: 'Start' }).click()

  const panel = page.getByRole('complementary', { name: 'Puzzle' })
  await expect(panel).toContainText('You played 3. Qxf7+ here against rival on 2026-11-02.')
  await expect(panel).not.toContainText('Bc4')
  const board = await boardDriver(page)
  await board.drag('f1', 'c4')
  await expect(panel).toContainText('Yes, Bc4 works!')
  await expect(panel).toContainText('Best was Bc4: 3. Bc4 Nf6')
  // The coach's word from the walkthrough, which the user only sees once the move is found.
  await expect(panel.locator('.training-why')).toHaveText('Bc4 brings a second attacker to f7.')
  await expect(panel.locator('.training-why strong')).toHaveText('f7')
  await expect.poll(() => results.length).toBe(1)
  expect(results[0]).toMatchObject({ ply: 5, moves: UCI, solvedFirstTry: true })

  await panel.getByRole('button', { name: 'Next' }).click()
  await expect(panel).not.toContainText('Bc4')
  await board.drag('h5', 'h4')
  await expect(panel).toContainText('Your queen just goes back.')
  await panel.getByRole('button', { name: 'Try again' }).click()
  await board.drag('f1', 'c4')
  await expect(panel).toContainText('Yes, Bc4 works!')
  // No walkthrough covers this one.
  await expect(panel).toContainText("The coach hasn't written about this move")
  await expect(panel.locator('.training-why')).toHaveCount(0)
  await expect.poll(() => results.length).toBe(2)
  expect(results[1]).toMatchObject({ solvedFirstTry: false })

  await panel.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Train my mistakes' })).toBeVisible()
})

test('showing the answer counts as a miss, once', async ({ page }) => {
  const results = await scriptedServer(page, [puzzle(5, 'a', WHY)])
  await page.getByRole('button', { name: 'Start' }).click()
  const panel = page.getByRole('complementary', { name: 'Puzzle' })
  await panel.getByRole('button', { name: 'Show the answer' }).click()
  await expect(panel).toContainText('Best was Bc4')
  await expect(panel).toContainText('Bc4 brings a second attacker to f7.')
  await expect.poll(() => results.length).toBe(1)
  expect(results[0]).toMatchObject({ solvedFirstTry: false })
})

test('without reviews it points to the review of recent games', async ({ page }) => {
  await page.route('**/api/v1/training', (route) =>
    route.fulfill({ json: { due: [], waiting: 0, solved: 0 } }),
  )
  await page.goto('/')
  await page.getByRole('link', { name: 'Train' }).click()
  await page.getByRole('link', { name: 'review your recent games' }).click()
  await expect(page).toHaveURL(/\/profile$/)
})
