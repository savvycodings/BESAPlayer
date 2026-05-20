/**
 * Add store_listings.quantity only — safe alternative to `drizzle-kit push`
 * (push can try to drop legacy columns not in an older schema.ts).
 *
 * Usage: pnpm run db:ensure-listing-quantity
 */
import 'dotenv/config'
import { pool } from '../src/db/drizzle'

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('Set DATABASE_URL in server/.env')
  }
  console.log('Adding store_listings.quantity if missing…')
  await pool.query(`
    ALTER TABLE "store_listings"
    ADD COLUMN IF NOT EXISTS "quantity" integer DEFAULT 1 NOT NULL;
  `)
  console.log('Done.')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
