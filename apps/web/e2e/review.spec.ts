import { expect, test, type Page } from '@playwright/test'

const SCHOLARS_MATE = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'

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
