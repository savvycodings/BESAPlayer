import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { db, cardPriceHistory } from "../db"
import { eq, and, gte } from "drizzle-orm"

/**
 * GET /pokedata/card/:id/price-history
 * Returns historical price points for a card (from card_price_history) for the product chart.
 * Query: days=30 (default 30, max 365)
 */
export const getCardPriceHistory = asyncHandler(async (req: Request, res: Response) => {
  const id = (req.params.id as string)?.trim()
  if (!id) {
    res.status(400).json({ error: "Card id is required (path: /pokedata/card/:id/price-history)" })
    return
  }

  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || "30"), 10) || 30))
  const since = new Date()
  since.setDate(since.getDate() - days)

  const rows = await db
    .select({
      recordedAt: cardPriceHistory.recordedAt,
      marketPrice: cardPriceHistory.marketPrice,
      ebayLastSold: cardPriceHistory.ebayLastSold,
    })
    .from(cardPriceHistory)
    .where(and(eq(cardPriceHistory.cardId, id), gte(cardPriceHistory.recordedAt, since)))
    .orderBy(cardPriceHistory.recordedAt)

  const history = rows.map((r) => ({
    date: r.recordedAt instanceof Date ? r.recordedAt.toISOString() : r.recordedAt,
    marketPrice: r.marketPrice != null ? parseFloat(String(r.marketPrice)) : null,
    ebayLastSold: r.ebayLastSold != null ? parseFloat(String(r.ebayLastSold)) : null,
  }))

  res.json({
    cardId: id,
    days,
    history,
  })
})
