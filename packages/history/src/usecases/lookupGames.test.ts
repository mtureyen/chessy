import type { GameSource, HistoryPage, SourceGame } from '@pawnia/library'
import { sampleSourceGame } from '@pawnia/library/testing'
import { describe, expect, it } from 'vitest'
import { lookupGames } from './lookupGames'

const NOW = new Date('2026-11-10T12:00:00.000Z')

/** A platform whose history is these pages, recording the calls. */
function source(id: GameSource['id'], pages: SourceGame[][]) {
  const calls: { cursor?: string; since?: string }[] = []
  const fake: GameSource = {
    id,
    recentGames: () => Promise.reject(new Error('unused')),
    game: () => Promise.reject(new Error('unused')),
    player: () => Promise.reject(new Error('unused')),
    history: async (_username, options): Promise<HistoryPage> => {
      calls.push(options)
      const index = options.cursor ? Number(options.cursor) : 0
      return {
        games: pages[index] ?? [],
        ...(index + 1 < pages.length && { next: String(index + 1) }),
        progress: { done: index + 1, total: pages.length },
      }
    },
  }
  return { fake, calls }
}

const played = (overrides: Partial<SourceGame> = {}) =>
  sampleSourceGame({ white: { name: 'Alice', rating: 1500 }, ...overrides })

describe('lookupGames', () => {
  it("reads pages until it has enough of the player's finished games, with their facts", async () => {
    const { fake, calls } = source('lichess', [
      [played(), played({ result: '*' }), played({ speed: 'bullet' })],
      [played(), played()],
      [played()],
    ])
    const found = await lookupGames(fake, 'alice', { last: 3, speed: 'blitz', now: NOW })
    expect(found.games).toHaveLength(3)
    expect(found.games[0]).toMatchObject({
      side: 'white',
      outcome: 'win',
      facts: { end: 'checkmate', plies: 7 },
      game: { reviewed: false, url: expect.stringContaining('lichess.org') },
    })
    expect(calls).toHaveLength(2) // the third page wasn't needed
    expect(calls[0]).toEqual({ since: '2025-11-10T12:00:00.000Z' })
    expect(found.more).toBe(false)
  })

  it('says when older games were left unread', async () => {
    const pages = Array.from({ length: 5 }, () => [played()])
    const { fake, calls } = source('lichess', pages)
    const found = await lookupGames(fake, 'alice', { last: 10, now: NOW })
    expect(calls).toHaveLength(3) // lichess: at most three pages
    expect(found).toMatchObject({ more: true })
    expect(found.games).toHaveLength(3)
  })

  it('stops at the end of the history', async () => {
    const { fake } = source('lichess', [[played()]])
    expect(await lookupGames(fake, 'alice', { last: 30, now: NOW })).toMatchObject({ more: false })
  })

  it("leaves out games the player isn't in", async () => {
    const { fake } = source('lichess', [[played({ white: { name: 'carol' } })]])
    expect((await lookupGames(fake, 'alice', { last: 30, now: NOW })).games).toEqual([])
  })
})
