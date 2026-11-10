import { expect, test, type Page } from '@playwright/test'

const t = (wins: number, draws: number, losses: number) => {
  const games = wins + draws + losses
  return {
    games,
    wins,
    draws,
    losses,
    unfinished: 0,
    score: Math.round(((wins + draws / 2) / games) * 100),
  }
}

const OVERVIEW = {
  window: { last: 300, found: 120 },
  openings: [
    {
      color: 'white',
      family: 'Caro Kann Defense',
      tally: t(3, 0, 7),
      departures: { you: 3, them: 7, none: 0, youAt: 3 },
    },
    {
      color: 'white',
      family: 'Vienna Game',
      tally: t(4, 1, 6),
      departures: { you: 8, them: 3, none: 0, youAt: 3 },
    },
    {
      color: 'black',
      family: 'Philidor Defense',
      tally: t(5, 2, 7),
      departures: { you: 12, them: 2, none: 0, youAt: 3 },
    },
  ],
}

const VIENNA = {
  window: { last: 300, found: 120 },
  color: 'white',
  family: 'Vienna Game',
  tally: t(4, 1, 6),
  departures: { you: 8, them: 3, none: 0, youAt: 3 },
  lines: [
    { moves: ['e4'], tally: t(4, 1, 6), book: true, yours: true },
    { moves: ['e4', 'e5'], tally: t(4, 1, 6), book: true, yours: false },
    { moves: ['e4', 'e5', 'Nc3'], tally: t(4, 1, 6), book: true, yours: true },
    { moves: ['e4', 'e5', 'Nc3', 'Bb4'], tally: t(1, 0, 4), book: true, yours: false },
    {
      moves: ['e4', 'e5', 'Nc3', 'Bb4', 'd3'],
      tally: t(1, 0, 4),
      book: false,
      yours: true,
      theory: ['Qg4'],
    },
  ],
  games: [
    {
      id: 'g1',
      playedAt: '2026-11-08T20:00:00.000Z',
      outcome: 'loss',
      opponent: { name: 'rival', rating: 500 },
      left: { ply: 5, san: 'd3', theory: ['Qg4'], by: 'you' },
    },
  ],
  after: { reviewedGames: 2, win: 41, errorsPerGame: 1.5 },
}

async function scriptedServer(page: Page) {
  const asked: string[] = []
  await page.route('**/api/v1/training/openings?*', (route) => {
    asked.push(route.request().url())
    return route.fulfill({ json: OVERVIEW })
  })
  await page.route('**/api/v1/training/openings/white?*', (route) => {
    asked.push(route.request().url())
    return route.fulfill({ json: VIENNA })
  })
  return asked
}

test('my openings: worst first, then one opening with where theory was left', async ({ page }) => {
  const asked = await scriptedServer(page)
  await page.goto('/training')
  await page
    .getByRole('navigation', { name: 'Training' })
    .getByRole('link', { name: 'My openings' })
    .click()

  const white = page.getByRole('region', { name: 'Openings as white' })
  await expect(white.getByRole('link').first()).toContainText('against the Caro Kann Defense')
  await expect(white.getByRole('link').first()).toContainText(
    'your opponents leave theory first in 7 of 10',
  )
  await expect(page.getByRole('region', { name: 'Openings as black' })).toContainText(
    'Philidor Defense',
  )
  expect(new URL(asked[0]!).searchParams.get('last')).toBe('300')

  await white.getByRole('link', { name: /Vienna Game/ }).click()
  await expect(page).toHaveURL(/color=white&family=Vienna(\+|%20)Game/)
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText(
    'you leave theory first in 8 of 11, usually at move 3',
  )
  const lines = page.getByRole('tree', { name: 'Lines of the Vienna Game' })
  await expect(lines).toContainText('2…Bb4')
  await expect(lines).toContainText('You left theory: theory has 3.Qg4')
  await expect(page.getByRole('region', { name: 'After the opening' })).toContainText(
    'after move 12 your winning chance is 41% on average',
  )
  await expect(page.getByRole('region', { name: 'Games' })).toContainText(
    'you left theory with 3.d3',
  )

  await page.getByRole('button', { name: 'Blitz' }).click()
  await expect.poll(() => new URL(asked.at(-1)!).searchParams.get('speed')).toBe('blitz')
  await page.getByRole('link', { name: '← All openings' }).click()
  await expect(page.getByRole('region', { name: 'Openings as white' })).toBeVisible()
})
