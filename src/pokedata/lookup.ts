import { db, cardPrices } from "../db"
import { eq } from "drizzle-orm"
import { pokedataClient } from "./client"

const CACHE_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

export type CardLookupResult = {
  id: string
  cardName: string | null
  setName: string | null
  marketPrice: number | null
  ebayLastSold: number | null
  currency: string
  lastFetchedAt: string
  fromCache: boolean
}

/**
 * Get card price from DB if fresh (< 48h), else fetch from Pokedata API, store, return.
 * Saves API credits by only calling external API when cache is missing or stale.
 */
export async function getCardLookupOrFetch(
  id: string,
  assetType: "CARD" | "SEALED" = "CARD"
): Promise<CardLookupResult | null> {
  const now = new Date()
  const cutoff = new Date(now.getTime() - CACHE_TTL_MS)

  const [cached] = await db.select().from(cardPrices).where(eq(cardPrices.id, id)).limit(1)

  if (cached && new Date(cached.lastFetchedAt) > cutoff) {
    return {
      id: cached.id,
      cardName: cached.cardName,
      setName: cached.setName,
      marketPrice: cached.marketPrice != null ? parseFloat(cached.marketPrice.toString()) : null,
      ebayLastSold: cached.ebayLastSold != null ? parseFloat(cached.ebayLastSold.toString()) : null,
      currency: cached.currency || "USD",
      lastFetchedAt: cached.lastFetchedAt.toISOString(),
      fromCache: true,
    }
  }

  try {
    console.log("[Pokedata] Cache miss or stale for id=%s (assetType=%s), calling Pokedata pricing API.", id, assetType)
    const pricing = await pokedataClient.getCardPricing(id, assetType)
    const markets = pricing.pricing || {}
    const tcg = markets["TCGPlayer"]
    const pokedataRaw = markets["Pokedata Raw"]
    const ebay = markets["eBay Raw"]
    // Use USD sources only (TCGPlayer, Pokedata Raw). We convert to ZAR in the app; no EUR.
    const marketSource = tcg ?? pokedataRaw
    const marketPrice = marketSource?.value != null ? marketSource.value : null
    const ebayLastSold = ebay?.value != null ? ebay.value : null
    const currency = "USD"
    console.log("[Pokedata API] Price return — marketPrice (USD):", marketPrice, "| ebayLastSold (USD):", ebayLastSold)

    await db
      .insert(cardPrices)
      .values({
        id,
        cardName: pricing.name ?? null,
        setName: null,
        marketPrice: marketPrice != null ? String(marketPrice) : null,
        ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : null,
        currency,
        lastFetchedAt: now,
      })
      .onConflictDoUpdate({
        target: cardPrices.id,
        set: {
          cardName: pricing.name ?? undefined,
          marketPrice: marketPrice != null ? String(marketPrice) : undefined,
          ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : undefined,
          currency,
          lastFetchedAt: now,
          updatedAt: now,
        },
      })

    console.log("[Pokedata] Stored in card_prices id=%s marketPrice=%s ebayLastSold=%s", id, marketPrice, ebayLastSold)

    return {
      id,
      cardName: pricing.name ?? null,
      setName: null,
      marketPrice,
      ebayLastSold,
      currency,
      lastFetchedAt: now.toISOString(),
      fromCache: false,
    }
  } catch (err) {
    console.error("getCardLookupOrFetch API error:", err)
    if (cached) {
      return {
        id: cached.id,
        cardName: cached.cardName,
        setName: cached.setName,
        marketPrice: cached.marketPrice != null ? parseFloat(cached.marketPrice.toString()) : null,
        ebayLastSold: cached.ebayLastSold != null ? parseFloat(cached.ebayLastSold.toString()) : null,
        currency: cached.currency || "USD",
        lastFetchedAt: cached.lastFetchedAt.toISOString(),
        fromCache: true,
      }
    }
    return null
  }
}
