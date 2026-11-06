import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * Keeps a made-up review of a line in the server's history, as a review on the server would. All
 * the moves are "best" but the last, a blunder. The run's tests share that history: each test
 * takes a line of its own.
 */
async function storeReview(page: Page, moves: { san: string; uci: string }[]) {
  const reviewed = moves.map(({ san, uci }, i) => ({
    ply: i + 1,
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? 'white' : 'black',
    san,
    uci,
    winBefore: 50,
    winAfter: 50,
    accuracy: 100,
    classification: i === moves.length - 1 ? 'blunder' : 'best',
  }))
  const last = reviewed.at(-1)!
  const res = await page.request.post('/api/v1/library/reviews', {
    data: {
      startFen: START,
      moves: moves.map((m) => m.uci),
      review: {
        startFen: START,
        positions: [{ whiteWin: 50 }, ...moves.map(() => ({ whiteWin: 50 }))],
        moves: reviewed,
        accuracy: { white: 87.5, black: 64.5 },
        counts: { white: { best: 1 }, black: { [last.classification]: 1 } },
        settings: { engine: 'StoredFish 1', nodes: 123_000 },
      },
    },
  })
  expect(res.status()).toBe(200)
}

const openAnalysis = (page: Page, pgn: string, search = '') =>
  page.goto(`/analysis?${new URLSearchParams({ pgn })}${search}`)

/** Fails the test if a review gets started: no progress bar, no "Review 12%" on the tab. */
async function expectNoReviewRun(page: Page) {
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: /Review \d+%/ })).toHaveCount(0)
}

test('a stored review shows at once: report, graph and badges, nothing reviewed again', async ({
  page,
}) => {
  await storeReview(page, [
    { san: 'a3', uci: 'a2a3' },
    { san: 'a6', uci: 'a7a6' },
  ])
  // A review started by mistake would ask the engine, here or on the server.
  let evaluated = false
  page.on('request', (request) => {
    if (request.url().includes('/engine/evaluations')) evaluated = true
  })
  await openAnalysis(page, '1. a3 a6 *')

  await expect(page.getByRole('img', { name: 'Evaluation graph' })).toBeVisible()
  await expect(page.locator('.move-tree [data-san="a6"] .class-badge')).toHaveAttribute(
    'data-class',
    'blunder',
  )

  await page.getByRole('tab', { name: 'Review' }).click()
  await expect(page.getByTestId('accuracy-white')).toContainText('87.5')
  await expect(page.locator('.review-meta')).toContainText('StoredFish 1')
  await expect(page.locator('.review-moments li', { hasText: 'a6' })).toContainText('Blunder')
  await expect(page.getByRole('button', { name: 'Review again' })).toBeVisible()
  await expectNoReviewRun(page)
  expect(evaluated).toBe(false)
})

test('a game that opens straight into its review is not reviewed again', async ({ page }) => {
  await storeReview(page, [
    { san: 'b3', uci: 'b2b3' },
    { san: 'b6', uci: 'b7b6' },
  ])
  await openAnalysis(page, '1. b3 b6 *', '&review=true')

  await expect(page.getByTestId('accuracy-white')).toContainText('87.5')
  // Past the point where it would have started: the server's engine is known.
  await expect(page.getByRole('combobox', { name: 'Review quality' })).toBeEnabled()
  await page.waitForLoadState('networkidle')
  await expectNoReviewRun(page)
  await expect(page.locator('.review-meta')).toContainText('StoredFish 1')
})

test('no flash of "start review" while the lookup is on its way', async ({ page }) => {
  await storeReview(page, [
    { san: 'c3', uci: 'c2c3' },
    { san: 'c6', uci: 'c7c6' },
  ])
  let answer = () => {}
  const answered = new Promise<void>((resolve) => (answer = resolve))
  await page.route('**/api/v1/library/reviews/find', async (route) => {
    await answered
    await route.continue()
  })
  await openAnalysis(page, '1. c3 c6 *', '&review=true')

  await expect(page.getByText('Looking for a stored review')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(0)
  answer()
  await expect(page.getByTestId('accuracy-white')).toContainText('87.5')
})

test('it survives variations, follows the main line and comes back with it', async ({ page }) => {
  await storeReview(page, [
    { san: 'd3', uci: 'd2d3' },
    { san: 'd6', uci: 'd7d6' },
  ])
  await openAnalysis(page, '1. d3 d6 *')
  const graph = page.getByRole('img', { name: 'Evaluation graph' })
  await expect(graph).toBeVisible()
  const board = await boardDriver(page)

  // A variation next to the main line changes nothing.
  await page.getByTitle('Back (←)').click()
  await board.play(['h7', 'h6'])
  await expect(graph).toBeVisible()
  await expect(page.locator('.move-tree [data-san="d6"] .class-badge')).toBeVisible()

  // Now it is the main line: the review is not of this game any more.
  await page.getByRole('button', { name: 'Main line' }).click()
  await expect(graph).toHaveCount(0)
  await page.getByRole('tab', { name: 'Review' }).click()
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible()

  // Back to the old main line: the review with it.
  await page.getByRole('tab', { name: 'Moves' }).click()
  await page.locator('.move-tree [data-san="d6"]').click()
  await page.getByRole('button', { name: 'Main line' }).click()
  await expect(graph).toBeVisible()

  // Deleting a reviewed move leaves another line, too.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(graph).toHaveCount(0)
})

test('moves played on from the end keep the review; a new game drops it', async ({ page }) => {
  await storeReview(page, [
    { san: 'e3', uci: 'e2e3' },
    { san: 'e6', uci: 'e7e6' },
  ])
  await openAnalysis(page, '1. e3 e6 *')
  const graph = page.getByRole('img', { name: 'Evaluation graph' })
  await expect(graph).toBeVisible()
  const board = await boardDriver(page)

  await board.play(['d2', 'd4'])
  await expect(page.locator('.move-tree [data-san="e6"] .class-badge')).toBeVisible()
  await expect(graph).toBeVisible()

  await page.locator('.io-details summary').click()
  await page.fill('#import', '1. e3 d5 *')
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.locator('.move-tree [data-san="d5"]')).toBeVisible()
  await expect(graph).toHaveCount(0)
})

test('a new review can be started by hand, in another quality', async ({ page }) => {
  await storeReview(page, [
    { san: 'f3', uci: 'f2f3' },
    { san: 'f6', uci: 'f7f6' },
  ])
  await openAnalysis(page, '1. f3 f6 *')
  await page.getByRole('tab', { name: 'Review' }).click()
  await expect(page.locator('.review-meta')).toContainText('StoredFish 1')

  await page.getByRole('combobox', { name: 'Review quality' }).selectOption('fast')
  await page.getByRole('button', { name: 'Review again' }).click()
  await expect(page.locator('.review-meta')).not.toContainText('StoredFish 1', { timeout: 60_000 })
  await expect(page.getByTestId('accuracy-white')).toContainText(/\d+\.\d/)
})

test('a review run here gives way to the stored one of a new main line', async ({ page }) => {
  await storeReview(page, [
    { san: 'a4', uci: 'a2a4' },
    { san: 'h5', uci: 'h7h5' },
  ])
  await openAnalysis(page, '1. a4 a5 *')
  await page.getByRole('tab', { name: 'Review' }).click()
  await page.getByRole('combobox', { name: 'Review quality' }).selectOption('fast')
  await page.getByRole('button', { name: /Start review|Review again/ }).click()
  await expect(page.getByTestId('accuracy-white')).toContainText(/\d+\.\d/, { timeout: 60_000 })
  await expect(page.locator('.review-meta')).not.toContainText('StoredFish 1')

  await page.getByTitle('Back (←)').click()
  const board = await boardDriver(page)
  await page.getByRole('tab', { name: 'Moves' }).click()
  await board.play(['h7', 'h5'])
  await page.getByRole('button', { name: 'Main line' }).click()
  await page.getByRole('tab', { name: 'Review' }).click()
  await expect(page.locator('.review-meta')).toContainText('StoredFish 1')
})

test('without a stored review the Review tab works as before', async ({ page }) => {
  // Answered here: on a retry the run's history has this test's own review.
  await page.route('**/api/v1/library/reviews/find', (route) => route.fulfill({ status: 404 }))
  await openAnalysis(page, '1. g3 g6 *')
  await page.getByRole('tab', { name: 'Review' }).click()
  await expect(page.getByRole('button', { name: 'Start review' })).toBeEnabled()
  await expect(page.getByRole('img', { name: 'Evaluation graph' })).toHaveCount(0)

  await page.getByRole('combobox', { name: 'Review quality' }).selectOption('fast')
  await page.getByRole('button', { name: 'Start review' }).click()
  await expect(page.getByTestId('accuracy-white')).toContainText(/\d+\.\d/, { timeout: 60_000 })
  await expect(page.getByRole('img', { name: 'Evaluation graph' })).toBeVisible()
})

test('a server without a history, or none at all, changes nothing', async ({ page }) => {
  let answer = 503
  await page.route('**/api/v1/library/reviews/find', (route) =>
    answer ? route.fulfill({ status: answer }) : route.abort(),
  )
  await openAnalysis(page, '1. h3 h6 *')
  await page.getByRole('tab', { name: 'Review' }).click()
  await expect(page.getByRole('button', { name: 'Start review' })).toBeEnabled()

  answer = 0
  await openAnalysis(page, '1. h3 h6 *', '&review=true')
  await expect(page.getByTestId('accuracy-white')).toContainText(/\d+\.\d/, { timeout: 60_000 })
})
