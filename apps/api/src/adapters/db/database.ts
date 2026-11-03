import { fileURLToPath } from 'node:url'
import * as schema from './schema'
import type { OpenDatabase } from './types'

export type { Database, OpenDatabase } from './types'

const MIGRATIONS = fileURLToPath(new URL('../../../drizzle', import.meta.url))

/**
 * Connects and brings the schema up to date. `url` is a PostgreSQL URL, or `pglite:memory` /
 * `pglite:<folder>` for an embedded Postgres (tests, or running without a database server).
 */
export async function openDatabase(url: string): Promise<OpenDatabase> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle } = await import('drizzle-orm/pglite')
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    const location = url.slice('pglite:'.length)
    const client = location === 'memory' ? new PGlite() : new PGlite(location)
    const db = drizzle({ client, schema })
    await migrate(db, { migrationsFolder: MIGRATIONS })
    return { db, name: `PGlite (${location})`, close: () => client.close() }
  }
  const { SQL } = await import('bun')
  const { drizzle } = await import('drizzle-orm/bun-sql')
  const { migrate } = await import('drizzle-orm/bun-sql/migrator')
  const client = new SQL(url)
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  return { db, name: 'PostgreSQL', close: () => client.close() }
}
