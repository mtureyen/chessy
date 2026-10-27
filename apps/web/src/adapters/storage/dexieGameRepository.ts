import {
  DuplicateGameError,
  type GameRepository,
  type LibraryGame,
  type ListGamesOptions,
  type SourceId,
} from '@chessy/library'
import type { ChessyDb } from './db'

/** GameRepository on IndexedDB (via Dexie). */
export class DexieGameRepository implements GameRepository {
  private readonly db: ChessyDb

  constructor(db: ChessyDb) {
    this.db = db
  }

  async saveAll(games: LibraryGame[]): Promise<void> {
    await this.db.transaction('rw', this.db.games, async () => {
      for (const game of games) {
        const owner = await this.findByExternalId(game.source, game.externalId)
        if (owner && owner.id !== game.id)
          throw new DuplicateGameError(game.source, game.externalId)
      }
      await this.db.games.bulkPut(games)
    })
  }

  get(id: string): Promise<LibraryGame | undefined> {
    return this.db.games.get(id)
  }

  findByExternalId(source: SourceId, externalId: string): Promise<LibraryGame | undefined> {
    return this.db.games.where('[source+externalId]').equals([source, externalId]).first()
  }

  async list({ source, limit }: ListGamesOptions = {}): Promise<LibraryGame[]> {
    const ordered = this.db.games.orderBy('playedAt').reverse()
    const filtered = source ? ordered.filter((game) => game.source === source) : ordered
    return limit === undefined ? filtered.toArray() : filtered.limit(limit).toArray()
  }

  async delete(id: string): Promise<void> {
    await this.db.games.delete(id)
  }
}
