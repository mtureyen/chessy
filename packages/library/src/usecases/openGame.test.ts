import { describe, expect, it } from 'vitest'
import { InMemoryGameRepository } from '../adapters/inMemoryGameRepository'
import { GameNotFoundError } from '../domain/errors'
import type { SourceGame } from '../domain/game'
import type { GameSource } from '../ports/gameSource'
import { sampleSourceGame } from '../testing'
import { openGame, UnsupportedGameUrlError } from './openGame'

/** A source that knows one game, and records what it was asked. */
function source(id: 'lichess' | 'chesscom', game: SourceGame) {
  const asked: { id: string; username?: string }[] = []
  const src: GameSource = {
    id,
    recentGames: async () => [],
    async game(gameId, options) {
      asked.push({ id: gameId, ...options })
      if (gameId !== 'HqjDTU4A' && gameId !== '186381504066')
        throw new GameNotFoundError(id, gameId)
      return game
    },
    player: async () => {
      throw new Error('not used')
    },
    history: async () => {
      throw new Error('not used')
    },
  }
  return { src, asked }
}

function setup() {
  const lichess = source('lichess', sampleSourceGame({ source: 'lichess', externalId: 'HqjDTU4A' }))
  const chesscom = source(
    'chesscom',
    sampleSourceGame({ source: 'chesscom', externalId: 'uuid-1' }),
  )
  const repository = new InMemoryGameRepository()
  let n = 0
  const deps = {
    sources: { lichess: lichess.src, chesscom: chesscom.src },
    repository,
    newId: () => `id-${++n}`,
    now: () => new Date('2026-11-03T10:00:00Z'),
  }
  return { deps, repository, lichess, chesscom }
}

describe('openGame', () => {
  it('fetches a lichess game into the library and returns it', async () => {
    const { deps, repository, lichess } = setup()
    const game = await openGame(deps, { url: 'https://lichess.org/HqjDTU4A/black', usernames: {} })
    expect(game).toMatchObject({ id: 'id-1', source: 'lichess', externalId: 'HqjDTU4A' })
    expect(lichess.asked).toEqual([{ id: 'HqjDTU4A' }])
    expect(await repository.get('id-1')).toEqual(game)
  })

  it('keeps the library id when the game is there already', async () => {
    const { deps } = setup()
    const url = 'https://lichess.org/HqjDTU4A'
    const first = await openGame(deps, { url, usernames: {} })
    const again = await openGame(deps, { url, usernames: {} })
    expect(again.id).toBe(first.id)
  })

  it('looks chess.com games up among the user’s own, so it needs the username', async () => {
    const { deps, chesscom } = setup()
    const url = 'https://www.chess.com/game/live/186381504066'
    await expect(openGame(deps, { url, usernames: {} })).rejects.toThrow(/chess.com username/)
    const game = await openGame(deps, { url, usernames: { chesscom: ' 8sly ' } })
    expect(game.externalId).toBe('uuid-1')
    expect(chesscom.asked).toEqual([{ id: '186381504066', username: '8sly' }])
  })

  it('rejects URLs that name no game', async () => {
    const { deps } = setup()
    await expect(
      openGame(deps, { url: 'https://lichess.org/analysis', usernames: {} }),
    ).rejects.toBeInstanceOf(UnsupportedGameUrlError)
  })
})
