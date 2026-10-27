/**
 * Test helpers for adapters of this context's ports. Import from `@chessy/library/testing`.
 * The same contract suite runs against every GameRepository implementation.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { DuplicateGameError } from './domain/errors'
import type { LibraryGame } from './domain/game'
import type { GameRepository } from './ports/gameRepository'

let counter = 0

/** A complete, valid library game; override what the test cares about. */
export function sampleGame(overrides: Partial<LibraryGame> = {}): LibraryGame {
  counter++
  return {
    id: `game-${counter}`,
    importedAt: '2026-10-27T10:00:00.000Z',
    source: 'lichess',
    externalId: `ext${counter}`,
    url: `https://lichess.org/ext${counter}`,
    pgn: '[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
    white: { name: 'alice', rating: 1500 },
    black: { name: 'bob', rating: 1480 },
    result: '1-0',
    speed: 'blitz',
    timeControl: '180+2',
    rated: true,
    playedAt: '2026-10-20T18:00:00.000Z',
    opening: { eco: 'C20', name: "King's Pawn Game" },
    ...overrides,
  }
}

/** Behaviour every GameRepository adapter must show. */
export function gameRepositoryContract(
  name: string,
  create: () => GameRepository | Promise<GameRepository>,
) {
  describe(`GameRepository contract: ${name}`, () => {
    let repo: GameRepository
    beforeEach(async () => {
      repo = await create()
    })

    it('returns undefined for unknown games', async () => {
      expect(await repo.get('nope')).toBeUndefined()
      expect(await repo.findByExternalId('lichess', 'nope')).toBeUndefined()
    })

    it('stores and returns games unchanged', async () => {
      const game = sampleGame()
      await repo.saveAll([game])
      expect(await repo.get(game.id)).toEqual(game)
    })

    it('updates a game saved again under the same id', async () => {
      const game = sampleGame()
      await repo.saveAll([game])
      await repo.saveAll([{ ...game, result: '0-1' }])
      expect((await repo.get(game.id))?.result).toBe('0-1')
      expect(await repo.list()).toHaveLength(1)
    })

    it('finds games by source and external id', async () => {
      const lichess = sampleGame({ source: 'lichess', externalId: 'same' })
      const chesscom = sampleGame({ source: 'chesscom', externalId: 'same' })
      await repo.saveAll([lichess, chesscom])
      expect((await repo.findByExternalId('lichess', 'same'))?.id).toBe(lichess.id)
      expect((await repo.findByExternalId('chesscom', 'same'))?.id).toBe(chesscom.id)
    })

    it('rejects the same platform game under a second id', async () => {
      const game = sampleGame()
      await repo.saveAll([game])
      await expect(repo.saveAll([{ ...game, id: 'other-id' }])).rejects.toBeInstanceOf(
        DuplicateGameError,
      )
    })

    it('lists newest first, filtered by source and limited', async () => {
      const old = sampleGame({ playedAt: '2026-01-01T00:00:00.000Z' })
      const recent = sampleGame({ playedAt: '2026-10-01T00:00:00.000Z' })
      const chesscom = sampleGame({ source: 'chesscom', playedAt: '2026-06-01T00:00:00.000Z' })
      await repo.saveAll([old, recent, chesscom])
      expect((await repo.list()).map((g) => g.id)).toEqual([recent.id, chesscom.id, old.id])
      expect((await repo.list({ source: 'lichess' })).map((g) => g.id)).toEqual([recent.id, old.id])
      expect((await repo.list({ limit: 1 })).map((g) => g.id)).toEqual([recent.id])
    })

    it('deletes games; deleting an unknown id does nothing', async () => {
      const game = sampleGame()
      await repo.saveAll([game])
      await repo.delete(game.id)
      await repo.delete('nope')
      expect(await repo.get(game.id)).toBeUndefined()
    })

    it('hands out copies, not its own objects', async () => {
      const game = sampleGame()
      await repo.saveAll([game])
      const loaded = (await repo.get(game.id))!
      loaded.white.name = 'mutated'
      expect((await repo.get(game.id))?.white.name).toBe(game.white.name)
    })
  })
}
