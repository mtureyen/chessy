import type { Profile, ProfileStore } from '@pawnia/library'
import type { PawniaDb } from './db'

const KEY = 'profile'

/** The user's profile in this browser's database (settings table). */
export class DexieProfileStore implements ProfileStore {
  private readonly db: PawniaDb

  constructor(db: PawniaDb) {
    this.db = db
  }

  async load(): Promise<Profile | undefined> {
    const row = await this.db.settings.get(KEY)
    return row?.value as Profile | undefined
  }

  async save(profile: Profile): Promise<void> {
    await this.db.settings.put({ key: KEY, value: profile })
  }
}
