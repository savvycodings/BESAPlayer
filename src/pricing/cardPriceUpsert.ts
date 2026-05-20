import { db, cardPrices, cardPriceHistory, marketCards } from '../db'
import { eq } from 'drizzle-orm'
import { setToSetCode, SET_CODES_NOT_ON_CDN } from '../pokedata/setCodeMap'
import type { PokedataCardPricing } from '../pokedata/client'

const POKEMON_TCG_IMAGE_BASE = 'https://images.pokemontcg.io'

export const PRICE_HISTORY_TIMEZONE = 'Africa/Johannesburg'

export function todayRecordedDate(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: PRICE_HISTORY_TIMEZONE })
}

export type ParsedCardPricing = {
  cardName: string | null
  setName: string | null
  setId: string | null
  cardNumber: string | null
  imageUrl: string | null
  marketPrice: number | null
  ebayLastSold: number | null
  currency: string
}

export function parsePricingFromApi(
  pricing: PokedataCardPricing,
  marketMeta?: {
    cardName?: string | null
    setName?: string | null
    cardNumber?: string | null
    setId?: string | null
    imageUrl?: string | null
  } | null,
): ParsedCardPricing {
  const markets = pricing.pricing || {}
  const tcg = markets['TCGPlayer']
  const pokedataRaw = markets['Pokedata Raw']
  const ebay = markets['eBay Raw']
  const marketSource = tcg ?? pokedataRaw
  const marketPrice = marketSource?.value != null ? marketSource.value : null
  const ebayLastSold = ebay?.value != null ? ebay.value : null
  const raw = pricing as unknown as Record<string, unknown>
  const cardNumber =
    (raw.num as string | undefined) ??
    (raw.number as string | undefined) ??
    marketMeta?.cardNumber ??
    null
  const setName =
    (raw.set_name as string | undefined) ??
    (raw.setName as string | undefined) ??
    marketMeta?.setName ??
    null
  const resolvedSetCode = setToSetCode(setName)
  const setIdStr = resolvedSetCode != null ? String(resolvedSetCode).trim() || null : marketMeta?.setId ?? null
  const cardNumStr = cardNumber != null ? String(cardNumber).trim() || null : null
  const builtUrl =
    setIdStr && cardNumStr
      ? `${POKEMON_TCG_IMAGE_BASE}/${encodeURIComponent(setIdStr)}/${encodeURIComponent(cardNumStr)}_hires.png`
      : null
  const apiImageUrl =
    raw.image_url != null && String(raw.image_url).trim()
      ? String(raw.image_url).trim() || null
      : raw.imageUrl != null && String(raw.imageUrl).trim()
        ? String(raw.imageUrl).trim() || null
        : null
  const imageUrl =
    apiImageUrl ?? (setIdStr && SET_CODES_NOT_ON_CDN.has(setIdStr) ? null : builtUrl) ?? marketMeta?.imageUrl ?? null

  return {
    cardName: pricing.name ?? marketMeta?.cardName ?? null,
    setName: setName ?? null,
    setId: setIdStr,
    cardNumber: cardNumStr,
    imageUrl,
    marketPrice,
    ebayLastSold,
    currency: 'USD',
  }
}

export type UpsertCardPriceOptions = {
  recordedAt?: Date
  recordedDate?: string
  skipHistory?: boolean
  updateMarketCardTimestamp?: boolean
}

/** Upsert card_prices + today's card_price_history row from parsed pricing. */
export async function upsertCardPriceFromPricing(
  cardId: string,
  parsed: ParsedCardPricing,
  options: UpsertCardPriceOptions = {},
): Promise<void> {
  const now = options.recordedAt ?? new Date()
  const recordedDateStr = options.recordedDate ?? todayRecordedDate(now)
  const { marketPrice, ebayLastSold, currency } = parsed

  await db
    .insert(cardPrices)
    .values({
      id: cardId,
      cardName: parsed.cardName,
      setName: parsed.setName,
      setId: parsed.setId,
      cardNumber: parsed.cardNumber,
      imageUrl: parsed.imageUrl,
      marketPrice: marketPrice != null ? String(marketPrice) : null,
      ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : null,
      currency,
      lastFetchedAt: now,
    })
    .onConflictDoUpdate({
      target: cardPrices.id,
      set: {
        cardName: parsed.cardName ?? undefined,
        setName: parsed.setName ?? undefined,
        setId: parsed.setId ?? undefined,
        cardNumber: parsed.cardNumber ?? undefined,
        imageUrl: parsed.imageUrl ?? undefined,
        marketPrice: marketPrice != null ? String(marketPrice) : undefined,
        ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : undefined,
        currency,
        lastFetchedAt: now,
        updatedAt: now,
      },
    })

  if (!options.skipHistory) {
    try {
      await db
        .insert(cardPriceHistory)
        .values({
          cardId,
          recordedAt: now,
          recordedDate: recordedDateStr,
          marketPrice: marketPrice != null ? String(marketPrice) : null,
          ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : null,
          currency,
        })
        .onConflictDoUpdate({
          target: [cardPriceHistory.cardId, cardPriceHistory.recordedDate],
          set: {
            marketPrice: marketPrice != null ? String(marketPrice) : undefined,
            ebayLastSold: ebayLastSold != null ? String(ebayLastSold) : undefined,
            recordedAt: now,
          },
        })
    } catch (e) {
      console.warn('[pricing] card_price_history upsert skipped:', (e as Error)?.message)
    }
  }

  if (options.updateMarketCardTimestamp !== false) {
    const numericId = parseInt(cardId, 10)
    if (!Number.isNaN(numericId)) {
      await db
        .update(marketCards)
        .set({ lastPriceSyncedAt: now })
        .where(eq(marketCards.pokedataCardId, numericId))
    }
  }
}
