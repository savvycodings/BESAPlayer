import { db, cardPrices } from "../db"
import { eq } from "drizzle-orm"
import { pokedataClient } from "./client"
import { setToSetCode } from "./setCodeMap"

const CACHE_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

const POKEMON_TCG_IMAGE_BASE = 'https://images.pokemontcg.io'

/** Build image URL from setId + cardNumber so we never return a stale wrong URL from cache. Exported for use in GET collections. */
export function buildImageUrl(setId: string | null, cardNumber: string | null): string | null {
  const setCode = setToSetCode(setId)
  const num = cardNumber != null ? String(cardNumber).trim() || null : null
  if (setCode && num) return `${POKEMON_TCG_IMAGE_BASE}/${encodeURIComponent(setCode)}/${encodeURIComponent(num)}_hires.png`
  return null
}

export type CardLookupResult = {
  id: string
  cardName: string | null
  setName: string | null
  setId: string | null
  cardNumber: string | null
  imageUrl: string | null
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
    const setId = cached.setId ?? null
    const cardNum = cached.cardNumber ?? null
    const imageUrl = buildImageUrl(setId, cardNum) ?? cached.imageUrl ?? null
    return {
      id: cached.id,
      cardName: cached.cardName,
      setName: cached.setName,
      setId,
      cardNumber: cardNum,
      imageUrl,
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
    const raw = pricing as any
    const cardNumber = raw.num ?? raw.number ?? null
    const setName = raw.set_name ?? raw.setName ?? null
    // Always resolve to images.pokemontcg.io set code (e.g. PRE -> sv8pt5). Never store Pokedata codes in URL.
    const rawSet =
      raw.set_code != null && String(raw.set_code).trim()
        ? String(raw.set_code).trim()
        : (setName ?? raw.set_id ?? raw.setId ?? raw.set ?? null)
    const setId = setToSetCode(rawSet) ?? rawSet
    const setIdStr = setId != null ? String(setId).trim() || null : null
    const cardNumStr = cardNumber != null ? String(cardNumber).trim() || null : null
    const imageUrl =
      setIdStr && cardNumStr
        ? `${POKEMON_TCG_IMAGE_BASE}/${encodeURIComponent(setIdStr)}/${encodeURIComponent(cardNumStr)}_hires.png`
        : null
    console.log("[Pokedata API] Price return — marketPrice (USD):", marketPrice, "| ebayLastSold (USD):", ebayLastSold, "| setId (stored):", setIdStr, "| cardNumber:", cardNumStr, "| imageUrl:", imageUrl ?? "none")

    await db
      .insert(cardPrices)
      .values({
        id,
        cardName: pricing.name ?? null,
        setName: setName ?? null,
        setId: setIdStr,
        cardNumber: cardNumStr,
        imageUrl,
        marketPrice: marketPrice != null ? String(marketPrice) : null,
        ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : null,
        currency,
        lastFetchedAt: now,
      })
      .onConflictDoUpdate({
        target: cardPrices.id,
        set: {
          cardName: pricing.name ?? undefined,
          setName: setName ?? undefined,
          setId: setIdStr ?? undefined,
          cardNumber: cardNumStr ?? undefined,
          imageUrl: imageUrl ?? undefined,
          marketPrice: marketPrice != null ? String(marketPrice) : undefined,
          ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : undefined,
          currency,
          lastFetchedAt: now,
          updatedAt: now,
        },
      })

    console.log("[Pokedata] Stored in card_prices id=%s imageUrl=%s marketPrice=%s ebayLastSold=%s", id, imageUrl ?? "none", marketPrice, ebayLastSold)

    return {
      id,
      cardName: pricing.name ?? null,
      setName: setName ?? null,
      setId: setIdStr,
      cardNumber: cardNumStr,
      imageUrl,
      marketPrice,
      ebayLastSold,
      currency,
      lastFetchedAt: now.toISOString(),
      fromCache: false,
    }
  } catch (err) {
    console.error("getCardLookupOrFetch API error:", err)
    if (cached) {
      const setId = cached.setId ?? null
      const cardNum = cached.cardNumber ?? null
      const imageUrl = buildImageUrl(setId, cardNum) ?? cached.imageUrl ?? null
      return {
        id: cached.id,
        cardName: cached.cardName,
        setName: cached.setName,
        setId,
        cardNumber: cardNum,
        imageUrl,
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
