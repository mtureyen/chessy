import 'fake-indexeddb/auto'
import { gameRepositoryContract } from '@chessy/library/testing'
import { describe, expect, it } from 'vitest'
import { ChessyDb } from './db'
import { DexieEvalCache } from './dexieEvalCache'
import { DexieGameRepository } from './dexieGameRepository'
import { DexieSettingsStore } from './dexieSettingsStore'

let n = 0
const freshDb = () => new ChessyDb(`test-${++n}`)

gameRepositoryContract('Dexie (IndexedDB)', () => new DexieGameRepository(freshDb()))

describe('DexieEvalCache', () => {
  it('stores evaluations by key', async () => {
    const cache = new DexieEvalCache(freshDb())
    const value = {
      depth: 18,
      lines: [{ rank: 1, depth: 18, score: { type: 'cp' as const, value: 25 }, pv: ['e2e4'] }],
    }
    expect(await cache.get('k')).toBeUndefined()
    await cache.put('k', value)
    expect(await cache.get('k')).toEqual(value)
  })
})

describe('DexieSettingsStore', () => {
  it('starts empty and keeps what was saved', async () => {
    const db = freshDb()
    expect(await new DexieSettingsStore(db).load()).toEqual({ usernames: {} })
    await new DexieSettingsStore(db).save({
      usernames: { lichess: 'alice' },
      lastSource: 'lichess',
    })
    expect(await new DexieSettingsStore(db).load()).toEqual({
      usernames: { lichess: 'alice' },
      lastSource: 'lichess',
    })
  })
})
