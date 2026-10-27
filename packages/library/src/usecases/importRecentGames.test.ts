import { describe, expect, it } from 'vitest'
import { InMemoryGameRepository } from '../adapters/inMemoryGameRepository'
import { InvalidUsernameError, UserNotFoundError } from '../domain/errors'
import type { SourceGame } from '../domain/game'
import type { GameSource } from '../ports/gameSource'
import { sampleGame } from '../testing'
import { importRecentGames } from './importRecentGames'

function sourceGame(externalId: string, playedAt: string): SourceGame {
  const { id: _id, importedAt: _importedAt, ...game } = sampleGame({ externalId, playedAt })
  return game
}

function setup(games: SourceGame[] | Error) {
  const repository = new InMemoryGameRepository()
  const requests: { username: string; max: number }[] = []
  const source: GameSource = {
    id: 'lichess',
    async recentGames(username, { max }) {
      requests.push({ username, max })
      if (games instanceof Error) throw games
      return games
    },
  }
  let id = 0
  const deps = {
    source,
    repository,
    newId: () => `new-${++id}`,
    now: () => new Date('2026-10-27T12:00:00Z'),
  }
  return { deps, repository, requests }
}

describe('importRecentGames', () => {
  it('stores fetched games with new ids and reports how many were added', async () => {
    const { deps, repository, requests } = setup([
      sourceGame('a', '2026-10-02'),
      sourceGame('b', '2026-10-01'),
    ])
    const report = await importRecentGames(deps, { username: ' alice ', max: 2 })
    expect(requests).toEqual([{ username: 'alice', max: 2 }])
    expect(report.added).toBe(2)
    expect(report.games.map((g) => [g.id, g.externalId, g.importedAt])).toEqual([
      ['new-1', 'a', '2026-10-27T12:00:00.000Z'],
      ['new-2', 'b', '2026-10-27T12:00:00.000Z'],
    ])
    expect(await repository.list()).toHaveLength(2)
  })

  it('keeps id and import date of games already in the library', async () => {
    const { deps, repository } = setup([sourceGame('a', '2026-10-02')])
    await repository.saveAll([
      { ...sampleGame({ externalId: 'a' }), id: 'kept', importedAt: '2026-01-01T00:00:00.000Z' },
    ])
    const report = await importRecentGames(deps, { username: 'alice' })
    expect(report.added).toBe(0)
    expect(report.games[0]).toMatchObject({
      id: 'kept',
      importedAt: '2026-01-01T00:00:00.000Z',
      playedAt: '2026-10-02',
    })
  })

  it('defaults to 20 games and validates the username', async () => {
    const { deps, requests } = setup([])
    await importRecentGames(deps, { username: 'alice' })
    expect(requests[0]?.max).toBe(20)
    await expect(importRecentGames(deps, { username: 'a b' })).rejects.toBeInstanceOf(
      InvalidUsernameError,
    )
    await expect(importRecentGames(deps, { username: '' })).rejects.toBeInstanceOf(
      InvalidUsernameError,
    )
  })

  it('passes source errors through and stores nothing', async () => {
    const { deps, repository } = setup(new UserNotFoundError('lichess', 'ghost'))
    await expect(importRecentGames(deps, { username: 'ghost' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    )
    expect(await repository.list()).toEqual([])
  })
})
