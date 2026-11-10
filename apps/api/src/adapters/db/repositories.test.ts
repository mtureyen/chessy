import { gameLine } from '@pawnia/history'
import { reviewRepositoryContract, sampleReview } from '@pawnia/history/testing'
import { gameRepositoryContract, sampleGame } from '@pawnia/library/testing'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './database'
import { PostgresGameHistory } from './gameHistory'
import { PostgresGameRepository } from './gameRepository'
import { PostgresReviewRepository } from './reviewRepository'
import { PostgresTrainingStore, progressKey } from './trainingStore'
import { PostgresWalkthroughStore } from './walkthroughStore'

// The same suites as every other adapter, on an in-memory Postgres (PGlite) with the migrations.
// One database for the file (starting one takes a while), emptied before each test.
const shared = openDatabase('pglite:memory')
async function fresh() {
  const { db } = await shared
  await db.execute(sql`truncate games, reviews, review_moves, walkthroughs, training_progress`)
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
  it('reads the PGNs of the games asked for', async () => {
    const db = await fresh()
    const [a, b] = [sampleGame(), sampleGame({ pgn: '1. d4 d5 *' })]
    await new PostgresGameRepository(db).saveAll([a, b])
    const history = new PostgresGameHistory(db)
    expect(await history.pgns([b.id, 'unknown'])).toEqual(new Map([[b.id, '1. d4 d5 *']]))
    expect(await history.pgns([])).toEqual(new Map())
  })

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

describe('PostgresWalkthroughStore', () => {
  it('keeps one walkthrough per line and side, and goes with its review', async () => {
    const db = await fresh()
    const stored = sampleReview()
    await new PostgresReviewRepository(db).save(stored)
    const store = new PostgresWalkthroughStore(db)
    const walkthrough = {
      summary: 'A short game.',
      moments: [{ ply: 1, what: 'A move.' }],
      focus: 'More moves.',
      agent: 'Test',
      writtenAt: '2026-11-06T12:00:00.000Z',
    }
    const kept = { reviewedAt: '2026-11-05T10:00:00.000Z', walkthrough }
    expect(await store.find(stored.line, 'white')).toBeUndefined()

    await store.save(stored.line, 'white', kept)
    expect(await store.find(stored.line, 'white')).toEqual(kept)
    expect(await store.find(stored.line, 'black')).toBeUndefined()

    const newer = { ...kept, walkthrough: { ...walkthrough, summary: 'Written again.' } }
    await store.save(stored.line, 'white', newer)
    expect(await store.find(stored.line, 'white')).toEqual(newer)

    await db.execute(sql`truncate reviews cascade`)
    expect(await store.find(stored.line, 'white')).toBeUndefined()
  })
})

describe('PostgresTrainingStore', () => {
  it('keeps the progress per puzzle, and goes with its review', async () => {
    const db = await fresh()
    const stored = sampleReview()
    await new PostgresReviewRepository(db).save(stored)
    const store = new PostgresTrainingStore(db)
    const key = progressKey(stored.line, 1)
    expect((await store.all()).get(key)).toBeUndefined()

    await store.save(stored.line, 1, { misses: 1, dueAt: '2026-11-07T12:00:00.000Z' })
    expect((await store.all()).get(key)).toEqual({ misses: 1, dueAt: '2026-11-07T12:00:00.000Z' })

    await store.save(stored.line, 1, { misses: 1 })
    expect((await store.all()).get(key)).toEqual({ misses: 1 })

    await db.execute(sql`truncate reviews cascade`)
    expect((await store.all()).size).toBe(0)
  })
})
