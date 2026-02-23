/**
 * One-off migration: add twitch_url and youtube_url to stores table.
 * Run with: pnpm run db:migrate:stores-social
 */
import 'dotenv/config'
import { pool } from '../src/db/drizzle'

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  console.log('Adding twitch_url and youtube_url to stores table...')
  try {
    await pool.query('ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "twitch_url" text;')
    await pool.query('ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "youtube_url" text;')
    console.log('Done. Stores table now has twitch_url and youtube_url.')
  } catch (e: any) {
    console.error('Migration failed:', e?.message || e)
    process.exit(1)
  } finally {
    await pool.end()
  }
  process.exit(0)
}

run()
