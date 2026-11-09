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
