import type { EvalCache, PositionEval } from '@pawnia/analysis'
import type {
  GameRepository,
  LibrarySettings,
  ListGamesOptions,
  SettingsStore,
  GameOrigin,
  Profile,
  ProfileStore,
} from '@pawnia/library'

type Storage = {
  games: GameRepository
  settings: SettingsStore
  evals: EvalCache
  profile: ProfileStore
}

/**
 * Storage ports whose IndexedDB implementation (Dexie, ~1/5 of the app's code) is only
 * downloaded the first time a page actually touches stored data.
 */
export function createLazyStorage(load: () => Promise<Storage>): Storage {
  let storage: Promise<Storage> | undefined
  const get = () => (storage ??= load())

  const games: GameRepository = {
    saveAll: async (list) => (await get()).games.saveAll(list),
    get: async (id: string) => (await get()).games.get(id),
    findByExternalId: async (source: GameOrigin, externalId: string) =>
      (await get()).games.findByExternalId(source, externalId),
    list: async (options?: ListGamesOptions) => (await get()).games.list(options),
    delete: async (id: string) => (await get()).games.delete(id),
  }
  const settings: SettingsStore = {
    load: async () => (await get()).settings.load(),
    save: async (value: LibrarySettings) => (await get()).settings.save(value),
  }
  const evals: EvalCache = {
    get: async (key: string) => (await get()).evals.get(key),
    put: async (key: string, value: PositionEval) => (await get()).evals.put(key, value),
  }
  const profile: ProfileStore = {
    load: async () => (await get()).profile.load(),
    save: async (value: Profile) => (await get()).profile.save(value),
  }
  return { games, settings, evals, profile }
}
