import { expect, test, type Page } from '@playwright/test'

/** A server whose review run advances each time it is asked; nothing is really reviewed. */
async function scriptedQueue(page: Page) {
  const started: unknown[] = []
  let state = { status: 'idle', total: 0, done: 0, failed: 0 }
  await page.route('**/api/v1/profile', (route) =>
    route.fulfill({
      json: {
        profile: {
          id: 'p1',
          displayName: '8sly',
          accounts: [],
          createdAt: '2026-11-05T00:00:00.000Z',
          updatedAt: '2026-11-05T00:00:00.000Z',
        },
      },
    }),
  )
  await page.route('**/api/v1/library/review-queue', (route) => {
    if (route.request().method() === 'POST') {
      started.push(route.request().postDataJSON())
      state = { status: 'running', total: 30, done: 3, failed: 0 }
    } else if (state.status === 'running' && state.done < 30) {
      state = { ...state, done: 12 }
    }
    return route.fulfill({ json: state })
  })
  await page.route('**/api/v1/library/review-queue/pause', (route) => {
    state = { ...state, status: 'paused' }
    return route.fulfill({ json: state })
  })
  await page.route('**/api/v1/library/review-queue/resume', (route) => {
    state = { ...state, status: 'finished', done: 29, failed: 1 }
    return route.fulfill({ json: state })
  })
  return started
}

test('review the last games: choose how many, watch it, pause and resume', async ({ page }) => {
  const started = await scriptedQueue(page)
  await page.goto('/profile')
  const box = page.getByRole('region', { name: 'Review recent games' })

  await expect(box.getByLabel('How many games')).toHaveValue('30')
  await box.getByLabel('Speed').selectOption('rapid')
  await box.getByRole('button', { name: 'Review' }).click()

  await expect(box.getByRole('status')).toContainText('Reviewing your games · 12 of 30')
  expect(started).toEqual([{ count: 30, speed: 'rapid' }])

  await box.getByRole('button', { name: 'Pause' }).click()
  await expect(box.getByRole('status')).toContainText('Paused · 12 of 30')

  await box.getByRole('button', { name: 'Resume' }).click()
  await expect(box.getByRole('status')).toHaveText(
    '29 of 30 games reviewed. 1 could not be reviewed.',
  )
})

test('any number of games can be chosen', async ({ page }) => {
  const started = await scriptedQueue(page)
  await page.goto('/profile')
  const box = page.getByRole('region', { name: 'Review recent games' })
  await box.getByLabel('How many games').selectOption('custom')
  await box.getByLabel('Number of games').fill('0')
  await expect(box.getByRole('button', { name: 'Review' })).toBeDisabled()
  await box.getByLabel('Number of games').fill('12')
  await box.getByRole('button', { name: 'Review' }).click()
  await expect(box.getByRole('status')).toContainText('Reviewing your games')
  expect(started).toEqual([{ count: 12 }])
})
