import { gameLine } from '@chessy/history'
import { reviewRepositoryContract, sampleReview } from '@chessy/history/testing'
import { gameRepositoryContract, sampleGame } from '@chessy/library/testing'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './database'
import { PostgresGameHistory } from './gameHistory'
import { PostgresGameRepository } from './gameRepository'
import { PostgresReviewRepository } from './reviewRepository'

// The same suites as every other adapter, on an in-memory Postgres (PGlite) with the migrations.
// One database for the file (starting one takes a while), emptied before each test.
const shared = openDatabase('pglite:memory')
async function fresh() {
  const { db } = await shared
  await db.execute(sql`truncate games, reviews, review_moves`)
  return db
}

gameRepositoryContract('PostgreSQL (PGlite)', async () => new PostgresGameRepository(await fresh()))

reviewRepositoryContract('PostgreSQL (PGlite)', async () => {
  const db = await fresh()
  return { games: new PostgresGameRepository(db), reviews: new PostgresReviewRepository(db) }
})

describe('PostgresGameRepository', () => {
  it('tells which games it is missing and counts what it has', async () => {
    const repo = new PostgresGameRepository(await fresh())
    const [a, b] = [sampleGame(), sampleGame()]
    await repo.saveAll([a])
    expect(await repo.missing([a.id, b.id])).toEqual([b.id])
    expect(await repo.missing([])).toEqual([])
    expect(await repo.count()).toBe(1)
  })
})

describe('PostgresGameHistory', () => {
  it('lists games without their moves, newest first, with their reviews', async () => {
    const db = await fresh()
    const older = sampleGame({ playedAt: '2026-10-01T10:00:00.000Z' })
    const newer = sampleGame({
      playedAt: '2026-10-02T10:00:00.000Z',
      pgn: '1. d4 d5 2. c4 *',
      opening: undefined,
    })
    await new PostgresGameRepository(db).saveAll([older, newer])
    const line = gameLine(older.pgn)
    const stored = sampleReview(line, {
      accuracy: { white: 91.5, black: 40 },
      // Before move 1 every piece is there; before move 2 only kings, a queen and a rook.
      positions: [
        {
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          score: { type: 'cp', value: 0 },
          whiteWin: 50,
        },
        {
          fen: '4k3/8/8/8/4P3/8/8/R2QK3 b - - 0 1',
          score: { type: 'cp', value: 900 },
          whiteWin: 99,
        },
      ],
    })
    await new PostgresReviewRepository(db).save(stored)

    const history = new PostgresGameHistory(db)
    const [first, second] = await history.summaries()
    expect(first).toEqual({
      id: newer.id,
      source: 'lichess',
      playedAt: newer.playedAt,
      white: newer.white,
      black: newer.black,
      result: '1-0',
      speed: 'blitz',
      timeControl: '180+2',
      rated: true,
      url: newer.url,
      reviewed: false,
    })
    expect(second).toMatchObject({
      id: older.id,
      opening: older.opening,
      reviewed: true,
      accuracy: { white: 91.5, black: 40 },
    })

    const moves = await history.reviewedMoves()
    expect(moves.slice(0, 3)).toEqual([
      { gameId: older.id, ply: 1, color: 'white', classification: 'best', pieces: 14 },
      { gameId: older.id, ply: 2, color: 'black', classification: 'best', pieces: 2 },
      // No position stored for it: the phase can only go by the move number.
      { gameId: older.id, ply: 3, color: 'white', classification: 'best' },
    ])
  })
})
