import { defineConfig } from 'drizzle-kit';

/**
 * Config for `npm run db:generate` (drizzle-kit): diffs src/main/db/schema.ts
 * against the snapshots in ./drizzle and scaffolds the SQL for any change.
 * The output is NOT read at runtime — review it (e.g. the COLLATE NOCASE on
 * tags.name is hand-written) and paste it as a new entry in the MIGRATIONS
 * list in src/main/db/migrations.ts.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
});
