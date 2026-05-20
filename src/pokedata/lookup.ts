import { db, cardPrices } from "../db"
import { eq } from "drizzle-orm"
import { pokedataClient } from "./client"
import { setToSetCode, SET_CODES_NOT_ON_CDN } from "./setCodeMap"
import { getMarketCardById } from "../market/marketSearch"
import { parsePricingFromApi, upsertCardPriceFromPricing } from "../pricing/cardPriceUpsert"

const CACHE_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

const POKEMON_TCG_IMAGE_BASE = 'https://images.pokemontcg.io'

/** Prefer stored set code; fall back to resolving set display name (e.g. "Vivid Voltage" → swsh4). */
export function resolveImageSetCode(
  setId: string | null | undefined,
  setName: string | null | undefined,
): string | null {
  const fromId = setId != null && String(setId).trim() ? setToSetCode(setId) : null
  if (fromId) return fromId
  if (setName != null && String(setName).trim()) return setToSetCode(setName)
  return null
}

/** Build image URL from set id/name + cardNumber. Exported for use in GET collections. */
export function buildImageUrl(
  setIdOrName: string | null,
  cardNumber: string | null,
  setName?: string | null,
): string | null {
  const setCode = resolveImageSetCode(setIdOrName, setName)
  const num = cardNumber != null ? String(cardNumber).trim() || null : null
  if (setCode && num) return `${POKEMON_TCG_IMAGE_BASE}/${encodeURIComponent(setCode)}/${encodeURIComponent(num)}_hires.png`
  return null
}

function resolveCardImageUrl(
  setId: string | null,
  setName: string | null,
  cardNumber: string | null,
  storedImageUrl: string | null,
): string | null {
  const setCode = resolveImageSetCode(setId, setName)
  if (setCode && SET_CODES_NOT_ON_CDN.has(setCode)) return storedImageUrl
  return buildImageUrl(setId, cardNumber, setName) ?? storedImageUrl
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
  const marketMeta = await getMarketCardById(id)

  if (cached && new Date(cached.lastFetchedAt) > cutoff) {
    const setId = cached.setId ?? marketMeta?.setId ?? null
    const setName = cached.setName ?? marketMeta?.setName ?? null
    const cardNum = cached.cardNumber ?? marketMeta?.cardNumber ?? null
    const setCode = resolveImageSetCode(setId, setName)
    const imageUrl =
      resolveCardImageUrl(setId, setName, cardNum, cached.imageUrl ?? null) ??
      marketMeta?.imageUrl ??
      null
    return {
      id: cached.id,
      cardName: cached.cardName ?? marketMeta?.cardName ?? null,
      setName,
      setId: setCode ?? setId,
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
    const parsed = parsePricingFromApi(pricing, marketMeta)
    console.log(
      "[Pokedata API] Price return — marketPrice (USD):",
      parsed.marketPrice,
      "| ebayLastSold (USD):",
      parsed.ebayLastSold,
      "| setId:",
      parsed.setId,
      "| cardNumber:",
      parsed.cardNumber,
    )

    await upsertCardPriceFromPricing(id, parsed, { recordedAt: now })

    console.log(
      "[Pokedata] Stored in card_prices id=%s imageUrl=%s marketPrice=%s ebayLastSold=%s",
      id,
      parsed.imageUrl ?? "none",
      parsed.marketPrice,
      parsed.ebayLastSold,
    )

    return {
      id,
      cardName: parsed.cardName,
      setName: parsed.setName,
      setId: parsed.setId,
      cardNumber: parsed.cardNumber,
      imageUrl: parsed.imageUrl,
      marketPrice: parsed.marketPrice,
      ebayLastSold: parsed.ebayLastSold,
      currency: parsed.currency,
      lastFetchedAt: now.toISOString(),
      fromCache: false,
    }
  } catch (err) {
    console.error("getCardLookupOrFetch API error:", err)
    if (marketMeta) {
      return {
        id,
        cardName: marketMeta.cardName,
        setName: marketMeta.setName,
        setId: marketMeta.setId,
        cardNumber: marketMeta.cardNumber,
        imageUrl: marketMeta.imageUrl,
        marketPrice: cached?.marketPrice != null ? parseFloat(cached.marketPrice.toString()) : null,
        ebayLastSold: cached?.ebayLastSold != null ? parseFloat(cached.ebayLastSold.toString()) : null,
        currency: cached?.currency || "USD",
        lastFetchedAt: (cached?.lastFetchedAt ?? new Date()).toISOString(),
        fromCache: Boolean(cached),
      }
    }
    if (cached) {
      const setId = cached.setId ?? null
      const setName = cached.setName ?? null
      const cardNum = cached.cardNumber ?? null
      const setCode = resolveImageSetCode(setId, setName)
      const imageUrl = resolveCardImageUrl(setId, setName, cardNum, cached.imageUrl ?? null)
      return {
        id: cached.id,
        cardName: cached.cardName,
        setName,
        setId: setCode ?? setId,
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
