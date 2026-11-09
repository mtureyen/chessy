import type { PositionEval } from '@pawnia/analysis'
import type { LibraryGame } from '@pawnia/library'
import { Dexie, type EntityTable, type Table } from 'dexie'

export interface SettingRow {
  key: string
  value: unknown
}

export interface EvalRow {
  key: string
  value: PositionEval
}

/**
 * The browser database. Schema changes go through a new `version(n)` with an upgrade
 * function; never edit an existing version.
 */
export class PawniaDb extends Dexie {
  games!: EntityTable<LibraryGame, 'id'>
  settings!: Table<SettingRow, string>
  evals!: Table<EvalRow, string>

  constructor(name = 'pawnia') {
    super(name)
    this.version(1).stores({
      games: 'id, &[source+externalId], playedAt, source',
      settings: 'key',
    })
    // v2: cached engine evaluations for game reviews.
    this.version(2).stores({ evals: 'key' })
  }
}

/** Where this browser kept its data under the app's old name. */
export const OLD_DB_NAME = 'chessy'

/**
 * The browser database, with the data from under the app's old name moved in first: rows the new
 * one already has win, games played here get their new source, and the old database is deleted
 * once everything is copied. If the move fails, the old one stays for the next start.
 */
export async function openPawniaDb(name = 'pawnia', oldName = OLD_DB_NAME): Promise<PawniaDb> {
  const db = new PawniaDb(name)
  if (!(await Dexie.exists(oldName))) return db
  try {
    const old = new PawniaDb(oldName)
    const [games, settings, evals] = await Promise.all([
      old.games.toArray(),
      old.settings.toArray(),
      old.evals.toArray(),
    ])
    old.close()
    await db.transaction('rw', db.games, db.settings, db.evals, async () => {
      const renamed = games.map((game) =>
        (game.source as string) === 'chessy' ? { ...game, source: 'pawnia' as const } : game,
      )
      await db.games.bulkAdd(await missingFrom(db.games, renamed, (game) => game.id))
      await db.settings.bulkAdd(await missingFrom(db.settings, settings, (row) => row.key))
      await db.evals.bulkAdd(await missingFrom(db.evals, evals, (row) => row.key))
    })
    await Dexie.delete(oldName)
  } catch (error) {
    console.warn(`Moving the browser data from "${oldName}" failed; trying again next time`, error)
  }
  return db
}

/** The rows whose key `table` does not hold yet. */
async function missingFrom<T>(
  table: { toCollection(): { primaryKeys(): PromiseLike<string[]> } },
  rows: T[],
  key: (row: T) => string,
): Promise<T[]> {
  const present = new Set(await table.toCollection().primaryKeys())
  return rows.filter((row) => !present.has(key(row)))
}
