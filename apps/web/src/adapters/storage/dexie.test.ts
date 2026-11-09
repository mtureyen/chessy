import 'fake-indexeddb/auto'
import type { LibraryGame } from '@pawnia/library'
import { gameRepositoryContract, sampleGame } from '@pawnia/library/testing'
import { Dexie } from 'dexie'
import { describe, expect, it } from 'vitest'
import { openPawniaDb, PawniaDb } from './db'
import { DexieEvalCache } from './dexieEvalCache'
import { DexieGameRepository } from './dexieGameRepository'
import { DexieSettingsStore } from './dexieSettingsStore'

let n = 0
const freshDb = () => new PawniaDb(`test-${++n}`)

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

describe('openPawniaDb', () => {
  const game = (id: string, source: string) =>
    ({ ...sampleGame({ id, externalId: `ext-${id}` }), source }) as LibraryGame

  it("moves the old database's data in, with the new source, and deletes it", async () => {
    const old = new PawniaDb('old-1')
    await old.games.bulkAdd([game('a', 'chessy'), game('b', 'lichess')])
    await old.settings.put({ key: 'library', value: { usernames: { lichess: 'alice' } } })
    await old.evals.put({ key: 'k', value: { depth: 1, lines: [] } })
    old.close()

    const db = await openPawniaDb('new-1', 'old-1')
    expect((await db.games.toArray()).map((g) => [g.id, g.source])).toEqual([
      ['a', 'pawnia'],
      ['b', 'lichess'],
    ])
    expect(await db.settings.get('library')).toBeDefined()
    expect(await db.evals.get('k')).toBeDefined()
    expect(await Dexie.exists('old-1')).toBe(false)
  })

  it('keeps what the new database already has', async () => {
    const old = new PawniaDb('old-2')
    await old.settings.put({ key: 'library', value: 'old' })
    old.close()
    const current = new PawniaDb('new-2')
    await current.settings.put({ key: 'library', value: 'new' })
    current.close()

    const db = await openPawniaDb('new-2', 'old-2')
    expect((await db.settings.get('library'))?.value).toBe('new')
  })

  it('opens as it is when there is nothing to move', async () => {
    const db = await openPawniaDb('new-3', 'never-there')
    expect(await db.games.count()).toBe(0)
  })
})
