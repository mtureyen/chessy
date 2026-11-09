import { openPawniaDb, PawniaDb } from './db'
import { DexieEvalCache } from './dexieEvalCache'
import { DexieGameRepository } from './dexieGameRepository'
import { DexieProfileStore } from './dexieProfileStore'
import { DexieSettingsStore } from './dexieSettingsStore'

/** The storage this app runs on, after moving in data kept under the old name. */
export async function openDexieStorage() {
  return createDexieStorage(await openPawniaDb())
}

/** Everything stored in IndexedDB. Loaded on demand by lazyStorage.ts. */
export function createDexieStorage(db = new PawniaDb()) {
  return {
    games: new DexieGameRepository(db),
    settings: new DexieSettingsStore(db),
    evals: new DexieEvalCache(db),
    profile: new DexieProfileStore(db),
  }
}
