import { expect, test } from '@playwright/test'
import { boardDriver } from './board'

test('a finished bot game and its review also end up in the server’s history', async ({ page }) => {
  await page.goto('/bot')
  await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: /^1\b/ }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const board = await boardDriver(page)
  await board.play(['e2', 'e4'])
  await expect(page.locator('.move-tree [data-san]')).toHaveCount(2, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.getByText('Saved to your games.')).toBeVisible()
  await page.getByRole('button', { name: 'Review game' }).click()
  await expect(page).toHaveURL(/\/analysis\?game=/)
  const id = new URL(page.url()).searchParams.get('game')!

  // The game: uploaded right after it was saved.
  await expect
    .poll(async () => {
      const res = await page.request.post('/api/v1/library/games/missing', { data: { ids: [id] } })
      return ((await res.json()) as { missing: string[] }).missing
    })
    .toEqual([])

  // Its review: uploaded when the review finishes.
  await expect(page.getByTestId('accuracy-white')).toContainText(/\d+\.\d/, { timeout: 60_000 })
  await expect
    .poll(async () => {
      const res = await page.request.get('/api/v1/library')
      return ((await res.json()) as { reviews?: number }).reviews ?? 0
    })
    .toBeGreaterThan(0)
})
