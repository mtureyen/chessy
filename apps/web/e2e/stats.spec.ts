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
  const summary = page.getByRole('region', { name: 'Summary', exact: true })
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

/** knightowl88 on chess.com: his games, and one of them by its page id. */
async function lookupServer(page: Page) {
  const asked: string[] = []
  await page.route('**/api/v1/stats/players/**', (route) => {
    const url = new URL(route.request().url())
    asked.push(`${url.pathname} ${url.searchParams.get('last')}`)
    if (url.pathname.endsWith('/ghost'))
      return route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        json: { title: 'User not found', status: 404, detail: 'No chess.com user "ghost"' },
      })
    const own = stats(100)
    return route.fulfill({
      json: {
        ...own,
        player: {
          kind: 'lookup',
          profile: {
            source: 'chesscom',
            username: 'knightowl88',
            url: 'https://www.chess.com/member/knightowl88',
            ratings: { blitz: 1642 },
          },
        },
        window: { last: 100, found: 4, since: '2025-11-10T00:00:00.000Z', more: false },
        quality: undefined,
        // Page links like chess.com's own: the game's number.
        games: own.games.map((g, i) => ({
          ...g,
          url: `https://www.chess.com/game/live/${2000 + i}`,
        })),
      },
    })
  })
  await page.route('**/api/v1/sources/chesscom/games/2001?*', (route) =>
    route.fulfill({
      json: {
        game: {
          source: 'chesscom',
          externalId: 'uuid-g2',
          url: 'https://www.chess.com/game/live/2001',
          pgn: '[White "knightowl88"]\n[Black "rival-g2"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 0-1',
          white: { name: 'knightowl88' },
          black: { name: 'rival-g2' },
          result: '0-1',
          speed: 'blitz',
          rated: true,
          playedAt: '2026-11-08T20:00:00.000Z',
        },
      },
    }),
  )
  return asked
}

test('stats: look anyone up, with what stands out, and open one of their games', async ({
  page,
}) => {
  const asked = await lookupServer(page)
  await page.goto('/stats')
  const search = page.getByRole('search', { name: 'Look up a player' })
  await search.getByLabel('Platform').selectOption('chesscom')
  await search.getByLabel('Username').fill('knightowl88')
  await search.getByRole('button', { name: 'Look up' }).click()

  await expect(page).toHaveURL(/\/stats\?source=chesscom&user=knightowl88/)
  const summary = page.getByRole('region', { name: 'Summary', exact: true })
  await expect(summary).toContainText('knightowl88')
  await expect(summary).toContainText('Blitz 1642')
  await expect(summary).toContainText('Last 4 games (all since')
  expect(asked[0]).toBe('/api/v1/stats/players/chesscom/knightowl88 100')
  await expect(page.getByRole('region', { name: 'Against knightowl88' })).toContainText(
    'As White almost always 1.e4',
  )
  await expect(page.getByRole('region', { name: 'Move quality' })).toHaveCount(0)

  // One of the games opens on the board without going into the library.
  await page.getByRole('region', { name: 'Openings' }).getByText('Vienna Game').click()
  await page.getByRole('button', { name: /rival-g2/ }).click()
  await expect(page).toHaveURL(/\/analysis\?pgn=/)
  await expect(page.locator('.move-tree [data-san]')).toHaveCount(4)

  // The search is remembered.
  await page.goto('/stats')
  await expect(page.locator('.stats-recent')).toContainText('knightowl88')
  await page.locator('.stats-recent').getByRole('link', { name: 'knightowl88' }).click()
  await expect(page.getByRole('region', { name: 'Summary', exact: true })).toContainText(
    'knightowl88',
  )
})

test('stats: an unknown player is said so', async ({ page }) => {
  await lookupServer(page)
  await page.goto('/stats?source=chesscom&user=ghost')
  await expect(page.getByRole('alert')).toHaveText('No chess.com user "ghost"')
})

test('stats: from a game in the library to the opponent’s stats', async ({ page }) => {
  await page.goto('/games')
  await page.getByRole('radio', { name: 'lichess' }).click()
  await page.getByRole('textbox', { name: 'lichess username' }).fill('DrNykterstein')
  await page.getByRole('button', { name: 'Import recent games' }).click()
  await expect(page.getByRole('status')).toContainText('2 games imported')
  // A recorded game DrNykterstein played with White against Night-King96 (other tests may add
  // more games to the shared server, so find it by name).
  const row = page.getByTestId('game-row').filter({ hasText: 'Night-King96' }).first()
  await expect(row.getByRole('link', { name: 'Stats of Night-King96' })).toHaveAttribute(
    'href',
    '/stats?source=lichess&user=Night-King96',
  )
})

/** The coach's summary route, answered when the test says so. */
async function scriptedCoach(page: Page) {
  const asked: { player: Record<string, string>; last: number; speed?: string }[] = []
  let release: () => void = () => {}
  let held = Promise.resolve()
  await page.route('**/api/v1/stats/summaries', async (route) => {
    const body = route.request().postDataJSON() as (typeof asked)[number]
    asked.push(body)
    await held
    const lookup = body.player.kind === 'lookup'
    return route.fulfill({
      json: {
        kind: body.player.kind,
        summary: lookup
          ? 'knightowl88 opens **1.e4** in every White game.'
          : `You play **1.e4** and the Vienna Game (written ${asked.length}).`,
        focus: lookup
          ? '- Prepare against the Vienna Game\n- Keep the clock busy: they lose on time'
          : 'Blunders in the middlegame: 2 per game. Train on puzzles from your own mistakes.',
        agent: 'Scripted coach',
        writtenAt: '2026-11-14T12:00:00.000Z',
      },
    })
  })
  return {
    asked,
    /** Holds the answers back until `release` is called. */
    hold: () => {
      held = new Promise((resolve) => (release = resolve))
      return () => release()
    },
  }
}

test('stats: the coach says how you play and what to work on, paid for once', async ({ page }) => {
  const coach = await scriptedCoach(page)
  await scriptedServer(page)
  const section = page.getByRole('region', { name: 'Coach summary' })
  await expect(section).toContainText('the one thing to work on first')
  await expect(section).toContainText('With the Claude API as coach this is one paid request.')

  // Writing, the page is left and shown again: the button stays busy, nothing is asked twice.
  const release = coach.hold()
  await section.getByRole('button', { name: 'Write the summary' }).click()
  await expect(section.getByRole('button', { name: /writing… \(up to a minute\)/ })).toBeDisabled()
  await page.getByRole('link', { name: 'Games', exact: true }).click()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(section.getByRole('button', { name: /writing…/ })).toBeDisabled()
  release()
  await expect(section.getByRole('heading', { name: 'How you play' })).toBeVisible()
  await expect(section.locator('strong')).toHaveText('1.e4')
  await expect(section.getByRole('heading', { name: 'Work on first' })).toBeVisible()
  await expect(section).toContainText('Blunders in the middlegame')
  expect(coach.asked).toEqual([{ player: { kind: 'me' }, last: 30, tz: expect.any(String) }])

  // Kept in the browser for these filters; other filters are another summary.
  await page.getByRole('link', { name: 'Games', exact: true }).click()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(section).toContainText('(written 1)')
  await page.getByRole('group', { name: 'Last' }).getByRole('button', { name: '100' }).click()
  await expect(section.getByRole('button', { name: 'Write the summary' })).toBeVisible()
  await page
    .getByRole('group', { name: 'Last' })
    .getByRole('button', { name: '30', exact: true })
    .click()
  await expect(section).toContainText('(written 1)')

  await section.getByRole('button', { name: 'Write it again' }).click()
  await expect(section).toContainText('(written 2)')
  expect(coach.asked).toHaveLength(2)
})

test('stats: the coach says how to meet a looked-up player, and errors are shown', async ({
  page,
}) => {
  await lookupServer(page)
  const coach = await scriptedCoach(page)
  // Routes added later go first: the first writing fails, the next reaches the coach.
  let failures = 1
  await page.route('**/api/v1/stats/summaries', async (route) => {
    if (failures-- > 0)
      return route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        json: { title: 'Coach unavailable', status: 503, detail: 'No coach is switched on' },
      })
    return route.fallback()
  })
  await page.goto('/stats?source=chesscom&user=knightowl88')
  const section = page.getByRole('region', { name: 'Coach summary' })
  await expect(section).toContainText('how knightowl88 plays and how to meet them')
  await expect(section).toContainText('says nothing about how well they move')

  await section.getByRole('button', { name: 'Write the summary' }).click()
  await expect(section.getByRole('alert')).toHaveText('No coach is switched on')
  await section.getByRole('button', { name: 'Write the summary' }).click()
  await expect(section.getByRole('heading', { name: 'How knightowl88 plays' })).toBeVisible()
  await expect(section.getByRole('heading', { name: 'How to meet them' })).toBeVisible()
  await expect(section.getByRole('listitem')).toHaveCount(2)
  await expect(section.getByRole('alert')).toHaveCount(0)
  expect(coach.asked).toEqual([
    {
      player: { kind: 'lookup', source: 'chesscom', username: 'knightowl88' },
      last: 100,
      tz: expect.any(String),
    },
  ])
})
