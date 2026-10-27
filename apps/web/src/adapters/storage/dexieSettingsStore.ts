import type { LibrarySettings, SettingsStore } from '@chessy/library'
import type { ChessyDb } from './db'

const KEY = 'library'

export class DexieSettingsStore implements SettingsStore {
  private readonly db: ChessyDb

  constructor(db: ChessyDb) {
    this.db = db
  }

  async load(): Promise<LibrarySettings> {
    const row = await this.db.settings.get(KEY)
    return (row?.value as LibrarySettings | undefined) ?? { usernames: {} }
  }

  async save(settings: LibrarySettings): Promise<void> {
    await this.db.settings.put({ key: KEY, value: settings })
  }
}
