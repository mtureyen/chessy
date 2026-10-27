import 'fake-indexeddb/auto'
import { gameRepositoryContract } from '@chessy/library/testing'
import { describe, expect, it } from 'vitest'
import { ChessyDb } from './db'
import { createDexieStorage } from './dexieStorage'
import { createLazyStorage } from './lazyStorage'

let n = 0
gameRepositoryContract(
  'lazy Dexie',
  () => createLazyStorage(async () => createDexieStorage(new ChessyDb(`lazy-test-${++n}`))).games,
)

describe('createLazyStorage', () => {
  it('loads the real storage once, on first use', async () => {
    let loads = 0
    const storage = createLazyStorage(async () => {
      loads++
      return createDexieStorage(new ChessyDb(`lazy-once-${++n}`))
    })
    expect(loads).toBe(0)
    await Promise.all([storage.games.list(), storage.settings.load(), storage.games.get('x')])
    expect(loads).toBe(1)
  })
})
