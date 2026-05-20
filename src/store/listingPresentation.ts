import { db, cardPrices } from '../db'
import { inArray } from 'drizzle-orm'

export type ListingEnrichmentRow = {
  id: number
  cardName: string
  cardImage: string | null
  price: unknown
  quantity?: number | null
  cardId?: string | null
  vaultingStatus?: string | null
  purchaseType?: string | null
  currentBid?: unknown
  bidCount?: number | null
  description?: string | null
  collectionSet?: string | null
  collectionCardNumber?: string | null
  collectionCondition?: string | null
  collectionType?: string | null
  collectionGrade?: unknown
  storeId?: number
  storeName?: string
  sellerId?: string
  sellerName?: string
}

type CardPriceMeta = {
  marketPrice: number | null
  ebayLastSold: number | null
  setName: string | null
  cardNumber: string | null
}

export async function fetchCardPriceMap(
  cardIds: string[]
): Promise<Map<string, CardPriceMeta>> {
  const priceMap = new Map<string, CardPriceMeta>()
  if (cardIds.length === 0) return priceMap

  try {
    const priceRows = await db
      .select({
        id: cardPrices.id,
        marketPrice: cardPrices.marketPrice,
        ebayLastSold: cardPrices.ebayLastSold,
        setName: cardPrices.setName,
        cardNumber: cardPrices.cardNumber,
      })
      .from(cardPrices)
      .where(inArray(cardPrices.id, cardIds))

    priceRows.forEach((pr) => {
      const id = pr.id != null ? String(pr.id) : null
      if (!id) return
      const market =
        pr.marketPrice != null && pr.marketPrice !== ''
          ? parseFloat(String(pr.marketPrice))
          : null
      const ebay =
        pr.ebayLastSold != null && pr.ebayLastSold !== ''
          ? parseFloat(String(pr.ebayLastSold))
          : null
      priceMap.set(id, {
        marketPrice: market,
        ebayLastSold: ebay,
        setName: pr.setName != null ? String(pr.setName).trim() || null : null,
        cardNumber:
          pr.cardNumber != null ? String(pr.cardNumber).trim() || null : null,
      })
    })
  } catch {
    // card_prices optional
  }

  return priceMap
}

function presentationFromRow(
  row: ListingEnrichmentRow,
  prices: CardPriceMeta | undefined
) {
  const cid = row.cardId != null ? String(row.cardId) : null
  const setName =
    (row.collectionSet && String(row.collectionSet).trim()) ||
    prices?.setName ||
    undefined
  const cardNumber =
    (row.collectionCardNumber != null &&
    String(row.collectionCardNumber).trim() !== ''
      ? String(row.collectionCardNumber).trim()
      : undefined) ||
    prices?.cardNumber ||
    undefined

  const metaParts: string[] = []
  if (row.collectionType === 'slab' && row.collectionGrade != null) {
    metaParts.push(`PSA ${row.collectionGrade}`)
  } else if (row.collectionType && row.collectionType !== 'card') {
    metaParts.push(
      row.collectionType.charAt(0).toUpperCase() + row.collectionType.slice(1)
    )
  }

  const finishLabel =
    row.collectionType === 'slab'
      ? 'Slab'
      : row.collectionType === 'sealed'
        ? 'Sealed'
        : undefined

  return {
    id: row.id,
    listingId: row.id,
    cardName: row.cardName,
    cardImage: row.cardImage,
    cardId: cid ?? undefined,
    price: parseFloat(String(row.price ?? '0')),
    quantity: row.quantity != null ? Math.max(1, Number(row.quantity)) : 1,
    marketPrice: prices?.marketPrice ?? undefined,
    ebayLastSold: prices?.ebayLastSold ?? undefined,
    setName,
    cardNumber,
    condition: row.collectionCondition ?? undefined,
    metaLine: metaParts.length > 0 ? metaParts.join(' • ') : undefined,
    finishLabel,
    vaultingStatus: row.vaultingStatus,
    purchaseType: row.purchaseType,
    currentBid: row.currentBid ? parseFloat(String(row.currentBid)) : null,
    bidCount: row.bidCount,
    description: row.description,
    storeId: row.storeId,
    storeName: row.storeName,
    sellerId: row.sellerId,
    sellerName: row.sellerName,
  }
}

export async function enrichListingsForPresentation(rows: ListingEnrichmentRow[]) {
  const cardIds = [
    ...new Set(rows.map((r) => r.cardId).filter(Boolean)),
  ] as string[]
  const priceMap = await fetchCardPriceMap(cardIds)
  return rows.map((row) => {
    const cid = row.cardId != null ? String(row.cardId) : null
    const prices = cid ? priceMap.get(cid) : undefined
    return presentationFromRow(row, prices)
  })
}
