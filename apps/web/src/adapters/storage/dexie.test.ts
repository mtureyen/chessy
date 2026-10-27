import 'fake-indexeddb/auto'
import { gameRepositoryContract } from '@chessy/library/testing'
import { describe, expect, it } from 'vitest'
import { ChessyDb } from './db'
import { DexieGameRepository } from './dexieGameRepository'
import { DexieSettingsStore } from './dexieSettingsStore'

let n = 0
const freshDb = () => new ChessyDb(`test-${++n}`)

gameRepositoryContract('Dexie (IndexedDB)', () => new DexieGameRepository(freshDb()))

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
