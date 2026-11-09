import 'fake-indexeddb/auto'
import { gameRepositoryContract } from '@pawnia/library/testing'
import { describe, expect, it } from 'vitest'
import { PawniaDb } from './db'
import { createDexieStorage } from './dexieStorage'
import { createLazyStorage } from './lazyStorage'

let n = 0
gameRepositoryContract(
  'lazy Dexie',
  () => createLazyStorage(async () => createDexieStorage(new PawniaDb(`lazy-test-${++n}`))).games,
)

describe('createLazyStorage', () => {
  it('loads the real storage once, on first use', async () => {
    let loads = 0
    const storage = createLazyStorage(async () => {
      loads++
      return createDexieStorage(new PawniaDb(`lazy-once-${++n}`))
    })
    expect(loads).toBe(0)
    await Promise.all([storage.games.list(), storage.settings.load(), storage.games.get('x')])
    expect(loads).toBe(1)
  })
})
