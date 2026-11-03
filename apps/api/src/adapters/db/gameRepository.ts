import { gameLine } from '@chessy/history'
import {
  DuplicateGameError,
  type GameOrigin,
  type GameRepository,
  type LibraryGame,
  type ListGamesOptions,
} from '@chessy/library'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { Database } from './types'
import { lineHash } from './lineHash'
import { games } from './schema'

/** Library games in PostgreSQL: the server's copy the app syncs to. */
export class PostgresGameRepository implements GameRepository {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async saveAll(batch: LibraryGame[]): Promise<void> {
    if (batch.length === 0) return
    await this.db.transaction(async (tx) => {
      const taken = await tx
        .select({ id: games.id, source: games.source, externalId: games.externalId })
        .from(games)
        .where(
          or(
            ...batch.map((g) =>
              and(eq(games.source, g.source), eq(games.externalId, g.externalId)),
            ),
          ),
        )
      for (const row of taken) {
        const game = batch.find((g) => g.source === row.source && g.externalId === row.externalId)
        if (game && game.id !== row.id) throw new DuplicateGameError(game.source, game.externalId)
      }
      const rows = batch.map(toRow)
      await tx
        .insert(games)
        .values(rows)
        .onConflictDoUpdate({
          target: games.id,
          set: Object.fromEntries(
            Object.keys(rows[0]!)
              .filter((key) => key !== 'id')
              .map((key) => [key, sql.raw(`excluded.${columnName(key)}`)]),
          ),
        })
    })
  }

  async get(id: string): Promise<LibraryGame | undefined> {
    const [row] = await this.db.select({ data: games.data }).from(games).where(eq(games.id, id))
    return row?.data
  }

  async findByExternalId(source: GameOrigin, externalId: string): Promise<LibraryGame | undefined> {
    const [row] = await this.db
      .select({ data: games.data })
      .from(games)
      .where(and(eq(games.source, source), eq(games.externalId, externalId)))
    return row?.data
  }

  async list({ source, limit }: ListGamesOptions = {}): Promise<LibraryGame[]> {
    const query = this.db
      .select({ data: games.data })
      .from(games)
      .where(source ? eq(games.source, source) : undefined)
      .orderBy(desc(games.playedAt))
    const rows = limit === undefined ? await query : await query.limit(limit)
    return rows.map((row) => row.data)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(games).where(eq(games.id, id))
  }

  /** Which of these ids aren't stored yet. */
  async missing(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const stored = await this.db
      .select({ id: games.id })
      .from(games)
      .where(inArray(games.id, [...ids]))
    const known = new Set(stored.map((row) => row.id))
    return ids.filter((id) => !known.has(id))
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(games)
    return row?.count ?? 0
  }
}

function toRow(game: LibraryGame): typeof games.$inferInsert {
  return {
    id: game.id,
    source: game.source,
    externalId: game.externalId,
    playedAt: new Date(game.playedAt),
    whiteName: game.white.name,
    whiteRating: game.white.rating ?? null,
    blackName: game.black.name,
    blackRating: game.black.rating ?? null,
    result: game.result,
    speed: game.speed,
    rated: game.rated,
    openingEco: game.opening?.eco ?? null,
    openingName: game.opening?.name ?? null,
    lineHash: lineHash(gameLine(game.pgn)),
    data: game,
  }
}

/** The SQL column of a schema property (e.g. playedAt → played_at). */
function columnName(key: string): string {
  return games[key as keyof typeof games.$inferInsert].name
}
