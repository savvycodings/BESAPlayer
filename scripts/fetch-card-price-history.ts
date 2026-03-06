/**
 * Fetch today's price from Pokedata for every card in card_prices and upsert one row per card
 * per calendar day into card_price_history (we build history internally; charts read from this table).
 *
 * Run from server/: pnpm run fetch-card-price-history
 * Or: npx tsx scripts/fetch-card-price-history.ts
 * Requires: DATABASE_URL, POKEDATA_API_KEY in server/.env
 *
 * Throttles to ~1 request per second to avoid Pokedata rate limits.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const DELAY_MS = 1200 // ~1 req/sec to be nice to Pokedata

async function main() {
  const { db, cardPrices, cardPriceHistory } = require('../src/db')
  const { pokedataClient } = require('../src/pokedata/client')

  if (!process.env.POKEDATA_API_KEY?.trim()) {
    throw new Error('POKEDATA_API_KEY is required in server/.env')
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required in server/.env')
  }

  const rows = await db.select({ id: cardPrices.id }).from(cardPrices)
  const ids = rows.map((r: { id: string }) => r.id).filter(Boolean)
  if (ids.length === 0) {
    console.log('No cards in card_prices. Nothing to do.')
    return
  }

  console.log(`Found ${ids.length} cards in card_prices. Fetching today's price from Pokedata (one row per card per day, date in SA)...`)

  const now = new Date()
  const recordedDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' }) // YYYY-MM-DD in Cape Town / SA
  let ok = 0
  let err = 0

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    try {
      const pricing = await pokedataClient.getCardPricing(id, 'CARD')
      const markets = pricing.pricing || {}
      const tcg = markets['TCGPlayer']
      const pokedataRaw = markets['Pokedata Raw']
      const ebay = markets['eBay Raw']
      const marketPrice = tcg?.value ?? pokedataRaw?.value ?? null
      const ebayLastSold = ebay?.value ?? null

      await db.insert(cardPriceHistory).values({
        cardId: id,
        recordedAt: now,
        recordedDate: recordedDateStr,
        marketPrice: marketPrice != null ? String(marketPrice) : null,
        ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : null,
        currency: 'USD',
      }).onConflictDoUpdate({
        target: [cardPriceHistory.cardId, cardPriceHistory.recordedDate],
        set: {
          marketPrice: marketPrice != null ? String(marketPrice) : undefined,
          ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : undefined,
          recordedAt: now,
        },
      })
      ok++
      if ((i + 1) % 10 === 0 || i === ids.length - 1) {
        console.log(`  ${i + 1}/${ids.length} — last: ${id} (market: ${marketPrice ?? 'n/a'}, ebay: ${ebayLastSold ?? 'n/a'})`)
      }
    } catch (e: any) {
      err++
      console.warn(`  Failed ${id}:`, e?.message ?? e)
    }

    if (i < ids.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  console.log(`Done. Upserted ${ok} history rows for ${recordedDateStr}, ${err} errors.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
