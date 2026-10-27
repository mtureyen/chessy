import type { LibraryGame } from '@chessy/library'
import { Dexie, type EntityTable, type Table } from 'dexie'

export interface SettingRow {
  key: string
  value: unknown
}

/**
 * The browser database. Schema changes go through a new `version(n)` with an upgrade
 * function; never edit an existing version.
 */
export class ChessyDb extends Dexie {
  games!: EntityTable<LibraryGame, 'id'>
  settings!: Table<SettingRow, string>

  constructor(name = 'chessy') {
    super(name)
    this.version(1).stores({
      games: 'id, &[source+externalId], playedAt, source',
      settings: 'key',
    })
  }
}
