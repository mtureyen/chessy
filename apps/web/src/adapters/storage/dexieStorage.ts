import { ChessyDb } from './db'
import { DexieGameRepository } from './dexieGameRepository'
import { DexieSettingsStore } from './dexieSettingsStore'

/** Everything stored in IndexedDB. Loaded on demand by lazyStorage.ts. */
export function createDexieStorage(db = new ChessyDb()) {
  return { games: new DexieGameRepository(db), settings: new DexieSettingsStore(db) }
}
