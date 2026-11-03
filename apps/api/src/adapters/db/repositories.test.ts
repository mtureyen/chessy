import { reviewRepositoryContract } from '@chessy/history/testing'
import { gameRepositoryContract, sampleGame } from '@chessy/library/testing'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './database'
import { PostgresGameRepository } from './gameRepository'
import { PostgresReviewRepository } from './reviewRepository'

// The same suites as every other adapter, on an in-memory Postgres (PGlite) with the migrations.
const fresh = async () => (await openDatabase('pglite:memory')).db

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
