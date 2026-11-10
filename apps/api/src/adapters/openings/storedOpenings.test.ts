import { buildBookData, createOpeningBook, type GameReview } from '@pawnia/analysis'
import { gameLine, type GameSummary, type StoredReview } from '@pawnia/history'
import { sampleSummary } from '@pawnia/history/testing'
import { buildProfile } from '@pawnia/library'
import { describe, expect, it } from 'vitest'
import { StoredOpenings, type OpeningsLibrary } from './storedOpenings'

const book = createOpeningBook(
  buildBookData([
    { eco: 'C26', name: 'Vienna Game: Stanley Variation', pgn: '1. e4 e5 2. Nc3 Nf6 3. Bc4' },
  ]),
)
const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: 'me' }] },
  { id: 'p', now: '2026-11-10T00:00:00.000Z' },
)

const PGNS: Record<string, string> = {
  a: '1. e4 e5 2. Nc3 Nf6 3. d3 Bc5 0-1',
  b: '1. e4 e5 2. Nc3 Nf6 3. d3 d5 0-1',
  c: '1. e4 e5 2. Nc3 Nf6 3. Bc4 Bc5 1-0',
  bot: '1. e4 e5 0-1',
}

const vienna = (id: string, result: GameSummary['result'], reviewed = false) =>
  sampleSummary({
    id,
    white: { name: 'me' },
    black: { name: 'them' },
    result,
    opening: { name: 'Vienna Game: Stanley Variation' },
    reviewed,
  })

/** White's winning chance after move 12 is 30 in the reviewed game, with one opening mistake. */
const REVIEW = {
  positions: Array.from({ length: 30 }, (_, i) => ({ whiteWin: i === 24 ? 30 : 50 })),
  moves: [{ ply: 5, color: 'white', classification: 'mistake' }],
} as unknown as GameReview

function library() {
  const asked: string[][] = []
  const fake: OpeningsLibrary = {
    summaries: async () => [
      vienna('a', '0-1', true),
      vienna('b', '0-1'),
      vienna('c', '1-0'),
      sampleSummary({ id: 'bot', source: 'pawnia', white: { name: 'You' }, result: '0-1' }),
    ],
    profile: async () => profile,
    pgns: async (ids) => {
      asked.push([...ids])
      return new Map(ids.map((id) => [id, PGNS[id]!]))
    },
    findReview: async (line) =>
      JSON.stringify(line) === JSON.stringify(gameLine(PGNS.a!))
        ? ({ line, review: REVIEW, reviewedAt: '2026-11-01T00:00:00.000Z' } as StoredReview)
        : undefined,
  }
  return { fake, asked }
}

describe('StoredOpenings', () => {
  it('lists the platform openings and reads each game once', async () => {
    const { fake, asked } = library()
    const openings = new StoredOpenings(fake, async () => book)
    const body = await openings.openings({ last: 300 })
    expect(body.window).toEqual({ last: 300, found: 3 })
    expect(body.openings).toEqual([
      expect.objectContaining({
        color: 'white',
        family: 'Vienna Game',
        // Game c stayed in this small book until it ended.
        departures: { you: 2, them: 0, none: 1, youAt: 3 },
      }),
    ])
    await openings.openings({ last: 300 })
    expect(asked).toEqual([['a', 'b', 'c']])
  })

  it('shows one opening with how the reviewed games came out of it', async () => {
    const openings = new StoredOpenings(library().fake, async () => book)
    const body = await openings.opening('white', 'Vienna Game', { last: 300 })
    expect(body?.lines.find((l) => l.moves.join(' ') === 'e4 e5 Nc3 Nf6 d3')).toMatchObject({
      book: false,
      yours: true,
      theory: ['Bc4'],
    })
    expect(body?.after).toEqual({ reviewedGames: 1, win: 30, errorsPerGame: 1 })
    expect(await openings.opening('black', 'Vienna Game', { last: 300 })).toBeUndefined()
  })

  it('needs the opening book', async () => {
    const openings = new StoredOpenings(library().fake, async () => undefined)
    await expect(openings.openings({ last: 300 })).rejects.toThrow('No opening book')
  })
})
