import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schema from './schema'

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

export interface OpenDatabase {
  db: Database
  /** e.g. "PostgreSQL" or "PGlite (memory)", for status and logs. */
  name: string
  close(): Promise<void>
}
