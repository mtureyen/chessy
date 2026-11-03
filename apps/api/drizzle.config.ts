import { defineConfig } from 'drizzle-kit'

// `bun run db:generate` turns schema changes into a migration under drizzle/.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/adapters/db/schema.ts',
  out: './drizzle',
})
