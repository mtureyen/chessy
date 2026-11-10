import { expect, test, type Page } from '@playwright/test'

const tally = (wins: number, draws: number, losses: number) => {
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

const game = (id: string, outcome: 'win' | 'loss', opening: string) => ({
  id,
  url: `https://www.chess.com/game/live/${id}`,
  playedAt: '2026-11-08T20:00:00.000Z',
  speed: 'blitz',
  side: 'white',
  outcome,
  opponent: { name: `rival-${id}`, rating: 800 },
  opening,
  end: outcome === 'win' ? 'checkmate' : 'time',
  moves: 31,
})

/** What the API answers for the last 30 games; the last 100 have one more. */
function stats(last: number) {
  const record = last === 100 ? tally(3, 0, 1) : tally(2, 0, 1)
  return {
    player: {
      kind: 'me',
      displayName: 'Sly',
      accounts: [{ source: 'chesscom', username: 'sly' }],
    },
    window: { last, found: record.games },
    record,
    ratings: [
      {
        category: 'chesscom',
        speed: 'blitz',
        points: [
          { at: '2026-11-07T20:00:00.000Z', rating: 780 },
          { at: '2026-11-08T20:00:00.000Z', rating: 812 },
        ],
      },
    ],
    openings: {
      white: [
        {
          family: 'Vienna Game',
          tally: record,
          variations: [{ name: 'Vienna Game: Max Lange Defense', tally: record }],
        },
      ],
      black: [],
    },
    repertoire: {
      white: [
        { moves: ['e4'], tally: record, opening: 'Vienna Game' },
        { moves: ['e4', 'e5'], tally: record },
      ],
      black: [],
    },
    endings: {
      wins: [{ reason: 'checkmate', games: record.wins }],
      draws: [],
      losses: [{ reason: 'time', games: 1 }],
      averageMoves: 31,
    },
    opponents: [{ key: 'similar (within 100)', tally: record }],
    activity: {
      timeZone: 'Europe/Berlin',
      dayParts: [{ key: 'evening', tally: record }],
      weekdays: [{ key: 'sat', tally: record }],
    },
    quality: {
      reviewedGames: 1,
      averageAccuracy: 74,
      phases: {
        opening: { moves: 10, errors: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 } },
        middlegame: { moves: 12, errors: { inaccuracy: 1, mistake: 1, miss: 0, blunder: 2 } },
        endgame: { moves: 9, errors: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 } },
      },
      errorsPerGame: { inaccuracy: 1, mistake: 1, miss: 0, blunder: 2 },
      accuracy: [{ at: '2026-11-08T20:00:00.000Z', accuracy: 74 }],
    },
    games: [
      game('g1', 'win', 'Vienna Game: Max Lange Defense'),
      game('g2', 'loss', 'Vienna Game: Max Lange Defense'),
      game('g3', 'win', 'Vienna Game: Max Lange Defense'),
      ...(last === 100 ? [game('g4', 'win', 'Vienna Game: Max Lange Defense')] : []),
    ],
  }
}

async function scriptedServer(page: Page) {
  const asked: URLSearchParams[] = []
  await page.route('**/api/v1/stats/me?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    asked.push(query)
    return route.fulfill({ json: stats(Number(query.get('last'))) })
  })
  await page.goto('/stats')
  return asked
}

test('stats: the record, openings, endings and move quality of the last games', async ({
  page,
}) => {
  const asked = await scriptedServer(page)
  const summary = page.getByRole('region', { name: 'Summary' })
  await expect(summary).toContainText('Sly')
  await expect(summary).toContainText('sly on chess.com')
  await expect(summary).toContainText('Last 3 games')
  await expect(summary.getByRole('img', { name: '2 won · 1 lost' })).toBeVisible()
  expect(asked[0]?.get('last')).toBe('30')
  expect(asked[0]?.get('tz')).toBeTruthy()

  await expect(page.getByRole('region', { name: 'Rating' })).toContainText('chess.com blitz 812')
  await expect(page.getByRole('region', { name: 'Rating' })).toContainText('+32 over 2 games')

  const openings = page.getByRole('region', { name: 'Openings' })
  await openings.getByText('Vienna Game').click()
  await expect(openings).toContainText('Max Lange Defense')
  await openings.getByRole('link', { name: /rival-g2/ }).click()
  await expect(page).toHaveURL(/\/analysis\?game=g2/)
  await page.goBack()

  await expect(page.getByRole('tree', { name: 'Repertoire as white' })).toContainText('1.e4')
  await expect(page.getByRole('region', { name: 'How games end' })).toContainText('Checkmate')
  await expect(page.getByRole('region', { name: 'How games end' })).toContainText(
    'Games last 31 moves on average.',
  )
  await expect(page.getByRole('region', { name: 'Move quality' })).toContainText(
    'From the 1 reviewed game among these; average accuracy 74.',
  )

  await page.getByRole('group', { name: 'Last' }).getByRole('button', { name: '100' }).click()
  await expect(summary).toContainText('Last 4 games')
  await page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: 'Blitz' }).click()
  await expect.poll(() => asked.at(-1)?.get('speed')).toBe('blitz')
  expect(asked.at(-1)?.get('last')).toBe('100')
})

test('stats: without linked accounts it says where to start', async ({ page }) => {
  await page.route('**/api/v1/stats/me?*', (route) =>
    route.fulfill({
      json: {
        ...stats(30),
        player: { kind: 'me', displayName: 'You', accounts: [] },
        window: { last: 30, found: 0 },
        record: { games: 0, wins: 0, draws: 0, losses: 0, unfinished: 0 },
        games: [],
      },
    }),
  )
  await page.goto('/stats')
  await expect(
    page.getByRole('link', { name: /Link your chess.com or lichess account/ }),
  ).toHaveAttribute('href', '/profile')
})
