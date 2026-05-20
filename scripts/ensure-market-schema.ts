/**
 * Apply market_sets + market_cards DDL without drizzle migrate.
 * Usage: pnpm run db:ensure-market
 */
import 'dotenv/config'
import { ensureMarketSchema } from '../src/market/ensureMarketSchema'
import { countMarketCards } from '../src/market/marketSearch'
import { db, marketSets } from '../src/db'
import { sql } from 'drizzle-orm'

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('Set DATABASE_URL in server/.env')
  }
  console.log('Ensuring market_sets + market_cards…')
  await ensureMarketSchema()
  const [{ sets }] = await db.select({ sets: sql<number>`count(*)::int` }).from(marketSets)
  const cards = await countMarketCards()
  console.log(`Done. market_sets: ${sets ?? 0}, market_cards: ${cards}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
