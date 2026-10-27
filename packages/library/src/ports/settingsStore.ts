import type { SourceId } from '../domain/game'

export interface LibrarySettings {
  /** The user's own account per platform, remembered for the next import. */
  usernames: Partial<Record<SourceId, string>>
  lastSource?: SourceId
}

/** Port: small per-user preferences of the library. */
export interface SettingsStore {
  load(): Promise<LibrarySettings>
  save(settings: LibrarySettings): Promise<void>
}
