/**
 * Verify market catalog API data (DB-backed, no Pokedata).
 * Usage: pnpm exec tsx scripts/verify-market-catalog.ts
 */
import 'dotenv/config'
import { db, marketSets, marketCards } from '../src/db'
import { eq, sql } from 'drizzle-orm'
import { searchMarketCards, toSearchResults } from '../src/market/marketSearch'
import fs from 'fs'
import path from 'path'

async function main() {
  const synced = await db
    .select({
      id: marketSets.pokedataSetId,
      name: marketSets.name,
      cardCount: marketSets.cardCount,
    })
    .from(marketSets)
    .where(sql`${marketSets.cardsSyncedAt} IS NOT NULL`)
    .orderBy(marketSets.name)

  console.log('Synced sets in DB:', synced.length)
  for (const s of synced) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketCards)
      .where(eq(marketCards.pokedataSetId, s.id))
    const slugDir = path.join(__dirname, '../src/pokedata/sets')
    const slugFile = fs.readdirSync(slugDir).find((f) => f.startsWith(`${s.id}-`))
    console.log(`  ${s.name} (id=${s.id}): market_sets.card_count=${s.cardCount}, market_cards rows=${count}, slug=${slugFile ?? 'missing'}`)
  }

  const search = await searchMarketCards('Charizard', { limit: 3 })
  console.log('\nSample search (Charizard):', toSearchResults(search).length, 'hit(s)')
  if (search[0]) {
    console.log('  ', search[0].name, '#', search[0].number, '—', search[0].set)
  }

  const index = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../src/pokedata/setCards/_index.json'), 'utf8'),
  ) as { bySetId: Record<string, unknown> }
  console.log('\nJSON index entries:', Object.keys(index.bySetId).length)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
