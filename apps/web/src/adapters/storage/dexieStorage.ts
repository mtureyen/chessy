import { ChessyDb } from './db'
import { DexieEvalCache } from './dexieEvalCache'
import { DexieGameRepository } from './dexieGameRepository'
import { DexieProfileStore } from './dexieProfileStore'
import { DexieSettingsStore } from './dexieSettingsStore'

/** Everything stored in IndexedDB. Loaded on demand by lazyStorage.ts. */
export function createDexieStorage(db = new ChessyDb()) {
  return {
    games: new DexieGameRepository(db),
    settings: new DexieSettingsStore(db),
    evals: new DexieEvalCache(db),
    profile: new DexieProfileStore(db),
  }
}
