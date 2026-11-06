import { expect, test, type Page } from '@playwright/test'

const SCHOLARS_MATE = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'

// Every review here reaches the run's one database; a test must not find another test's.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/library/reviews/find', (route) => route.fulfill({ status: 404 }))
})

async function openAnalysis(page: Page, pgn: string) {
  await page.goto(`/analysis?${new URLSearchParams({ pgn })}`)
  await page.waitForSelector('cg-board')
}

async function runReview(page: Page, quality: 'fast' | 'standard' | 'deep' = 'fast') {
  await page.getByRole('tab', { name: /Review/ }).click()
  await page.getByRole('combobox', { name: 'Review quality' }).selectOption(quality)
  await page.getByRole('button', { name: /Start review|Review again/ }).click()
}

test('reviews a game: accuracy, classification, key moments, graph and badges', async ({
  page,
}) => {
  await openAnalysis(page, SCHOLARS_MATE)
  await runReview(page)

  await expect(page.getByTestId('accuracy-white')).toContainText(/\d+\.\d/, { timeout: 60_000 })
  await expect(page.getByTestId('accuracy-black')).toContainText(/\d+\.\d/)
  await expect(page.getByTestId('count-blunder')).toContainText('1') // 3... Nf6??
  await expect(page.getByTestId('count-book')).not.toHaveText(/^0\s.*\s0$/) // the first moves are theory

  const moment = page.locator('.review-moments li', { hasText: 'Nf6' })
  await expect(moment).toContainText('Blunder')
  await expect(moment).toContainText('best was g6')
  await expect(page.getByRole('img', { name: 'Evaluation graph' })).toBeVisible()

  await moment.getByRole('button').click()
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(page.locator('.move-tree .move-current')).toContainText('Nf6')
  await expect(page.locator('.move-tree [data-san="Nf6"] .class-badge')).toHaveAttribute(
    'data-class',
    'blunder',
  )
  await expect(page.locator('svg.cg-custom-svgs circle')).toHaveCount(1) // the badge on the board
})

test('a second review of the same game comes from the cache', async ({ page }) => {
  await openAnalysis(page, SCHOLARS_MATE)
  await runReview(page)
  const accuracy = page.getByTestId('accuracy-white').locator('.review-accuracy-value')
  await expect(accuracy).toContainText(/\d/, { timeout: 60_000 })
  const first = await accuracy.innerText()

  await runReview(page)
  await expect(accuracy).toHaveText(first, { timeout: 5_000 })
})

test('a running review can be cancelled', async ({ page }) => {
  await openAnalysis(
    page,
    '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 Nxd5 *',
  )
  await runReview(page, 'deep')
  await expect(page.getByRole('progressbar')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Review \d+%/ })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Review' })).toBeVisible()
})

test('loading another game discards the review', async ({ page }) => {
  await openAnalysis(page, SCHOLARS_MATE)
  await runReview(page)
  await expect(page.getByTestId('accuracy-white')).toBeVisible({ timeout: 60_000 })

  await page.locator('.io-details summary').click()
  await page.fill('#import', '1. d4 d5 *')
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Evaluation graph' })).toHaveCount(0)
})

test('reviews on the server engine when the API has one', async ({ page }) => {
  // Simulate a server with a native engine (CI has none): status + NDJSON evaluation stream.
  let requested: { fens: string[]; nodes: number; multiPv: number } | undefined
  await page.route('**/api/v1/engine', (route) =>
    route.fulfill({ json: { available: true, name: 'FakeFish 9', parallelism: 4 } }),
  )
  await page.route('**/api/v1/engine/evaluations', async (route) => {
    requested = route.request().postDataJSON()
    const lines = requested!.fens.map((_, index) =>
      JSON.stringify({
        type: 'evaluated',
        index,
        eval: {
          depth: 12,
          lines: [{ rank: 1, depth: 12, score: { type: 'cp', value: 0 }, pv: [] }],
        },
      }),
    )
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: [...lines, JSON.stringify({ type: 'done' })].join('\n') + '\n',
    })
  })

  await openAnalysis(page, SCHOLARS_MATE)
  await page.getByRole('tab', { name: /Review/ }).click()
  const engine = page.getByRole('combobox', { name: 'Review engine' })
  await expect(engine).toHaveValue('server')
  await expect(engine.locator('option[value="server"]')).toHaveText(
    'Server · FakeFish 9 · 4× parallel',
  )

  await page.getByRole('button', { name: 'Start review' }).click()
  await expect(page.getByTestId('accuracy-white')).toBeVisible()
  await expect(page.locator('.review-meta')).toContainText('FakeFish 9')
  // Only positions with legal moves go to the engine (the final mate does not).
  expect(requested).toMatchObject({ nodes: 500_000, multiPv: 2 })
  expect(requested!.fens).toHaveLength(7)
})

test('waits to know whether the server has an engine before a review can start', async ({
  page,
}) => {
  // The API answers slowly; until it has, starting would pick an engine at random.
  await page.route('**/api/v1/engine', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.fulfill({ json: { available: false, reason: 'none here' } })
  })
  await openAnalysis(page, SCHOLARS_MATE)
  await page.getByRole('tab', { name: /Review/ }).click()
  const start = page.getByRole('button', { name: 'Start review' })
  await expect(start).toBeDisabled()
  await expect(start).toBeEnabled({ timeout: 5000 })
})
