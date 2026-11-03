import type { Profile, ProfileStore } from '@chessy/library'
import { desc } from 'drizzle-orm'
import { profiles } from './schema'
import type { Database } from './types'

/** The user's profile in PostgreSQL; with several stored, the most recently saved one. */
export class PostgresProfileStore implements ProfileStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async load(): Promise<Profile | undefined> {
    const [row] = await this.db
      .select({ data: profiles.data })
      .from(profiles)
      .orderBy(desc(profiles.updatedAt))
      .limit(1)
    return row?.data
  }

  async save(profile: Profile): Promise<void> {
    const row = {
      id: profile.id,
      displayName: profile.displayName,
      updatedAt: new Date(profile.updatedAt),
      data: profile,
    }
    const { id: _id, ...update } = row
    await this.db
      .insert(profiles)
      .values(row)
      .onConflictDoUpdate({ target: profiles.id, set: update })
  }
}
