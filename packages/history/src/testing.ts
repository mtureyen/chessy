/**
 * Test helpers for adapters of this context's ports. Import from `@chessy/history/testing`.
 * The same contract suite runs against every ReviewRepository implementation.
 */
import type { GameReview, ReviewedMove } from '@chessy/analysis'
import type { GameRepository } from '@chessy/library'
import { sampleGame } from '@chessy/library/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { gameLine, type GameLine } from './domain/line'
import type { GameSummary } from './domain/playerGames'
import type { ReviewRepository, StoredReview } from './ports/reviewRepository'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A review of `line` with every move "best"; override what the test cares about. */
export function sampleReview(
  line: GameLine = { startFen: START, moves: ['e2e4', 'e7e5'] },
  overrides: Partial<GameReview> = {},
): StoredReview {
  const moves: ReviewedMove[] = line.moves.map((uci, i) => ({
    ply: i + 1,
    moveNumber: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? 'white' : 'black',
    san: uci,
    uci,
    winBefore: 50,
    winAfter: 50,
    accuracy: 100,
    classification: 'best',
    facts: {
      isBestMove: true,
      winBefore: 50,
      winAfter: 50,
      legalMoves: 20,
      inBook: false,
      sacrifice: 0,
      sacrificeTaken: 0,
      isRecapture: false,
      inCheck: false,
    },
  }))
  return {
    line,
    reviewedAt: '2026-11-03T20:00:00.000Z',
    review: {
      startFen: line.startFen,
      positions: [],
      moves,
      accuracy: { white: 100, black: 100 },
      counts: { white: { best: 1 }, black: { best: 1 } },
      settings: { engine: 'Stockfish 19', nodes: 500_000 },
      ...overrides,
    },
  }
}

/** Behaviour every ReviewRepository adapter must show. */
export function reviewRepositoryContract(
  name: string,
  create: () =>
    | { games: GameRepository; reviews: ReviewRepository }
    | Promise<{ games: GameRepository; reviews: ReviewRepository }>,
) {
  describe(`ReviewRepository contract: ${name}`, () => {
    let games: GameRepository
    let reviews: ReviewRepository
    beforeEach(async () => {
      ;({ games, reviews } = await create())
    })

    it('stores a review per line and returns it unchanged', async () => {
      const stored = sampleReview()
      await reviews.save(stored)
      expect(await reviews.find(stored.line)).toEqual(stored)
      expect(await reviews.find({ ...stored.line, moves: ['d2d4'] })).toBeUndefined()
      expect(await reviews.count()).toBe(1)
    })

    it('replaces an older review of the same line', async () => {
      const line = { startFen: START, moves: ['e2e4'] }
      await reviews.save(sampleReview(line, { settings: { engine: 'old', nodes: 1 } }))
      const newer = sampleReview(line, { settings: { engine: 'new', nodes: 2 } })
      await reviews.save(newer)
      expect(await reviews.find(line)).toEqual(newer)
      expect(await reviews.count()).toBe(1)
    })

    it('finds the review of a stored game by its main line, saved before or after the game', async () => {
      const game = sampleGame()
      const line = gameLine(game.pgn)
      await reviews.save(sampleReview(line))
      expect(await reviews.forGame(game.id)).toBeUndefined() // not stored yet
      await games.saveAll([game])
      expect((await reviews.forGame(game.id))?.line).toEqual(line)
      expect(await reviews.forGame('unknown')).toBeUndefined()
    })
  })
}

/** A chess.com rapid game 8sly won with White, not reviewed. */
export function sampleSummary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: 'g1',
    source: 'chesscom',
    playedAt: '2026-10-01T12:00:00.000Z',
    white: { name: '8sly', rating: 790 },
    black: { name: 'rival', rating: 820 },
    result: '1-0',
    speed: 'rapid',
    rated: true,
    opening: { eco: 'C50', name: 'Italian Game Two Knights Defense' },
    reviewed: false,
    ...overrides,
  }
}
