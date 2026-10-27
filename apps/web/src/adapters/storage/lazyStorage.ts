import type {
  GameRepository,
  LibrarySettings,
  ListGamesOptions,
  SettingsStore,
  SourceId,
} from '@chessy/library'

type Storage = { games: GameRepository; settings: SettingsStore }

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
    findByExternalId: async (source: SourceId, externalId: string) =>
      (await get()).games.findByExternalId(source, externalId),
    list: async (options?: ListGamesOptions) => (await get()).games.list(options),
    delete: async (id: string) => (await get()).games.delete(id),
  }
  const settings: SettingsStore = {
    load: async () => (await get()).settings.load(),
    save: async (value: LibrarySettings) => (await get()).settings.save(value),
  }
  return { games, settings }
}
