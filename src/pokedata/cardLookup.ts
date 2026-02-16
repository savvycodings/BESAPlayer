import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { getCardLookupOrFetch } from "./lookup"
import { getClientIP, rateLimit, RateLimitResult } from "./rateLimiter"

type AssetType = "CARD" | "SEALED"

export const getCardLookup = asyncHandler(async (req: Request, res: Response) => {
  const clientIP = getClientIP(req)
  const rateLimitResult: RateLimitResult = rateLimit(clientIP, 60, 15 * 60 * 1000)

  if (!rateLimitResult.success) {
    res.status(429).json({
      error: "Too many requests. Please try again later.",
      rateLimit: {
        limit: 60,
        remaining: rateLimitResult.remaining,
        resetTime: new Date(rateLimitResult.resetTime).toISOString(),
      },
    })
    return
  }

  const id = (req.params.id ?? req.query.id) as string
  const assetType = ((req.query.asset_type as AssetType) || "CARD") as "CARD" | "SEALED"

  if (!id?.trim()) {
    res.status(400).json({ error: "Card id is required (path /pokedata/card/:id or query ?id=)" })
    return
  }

  const result = await getCardLookupOrFetch(id.trim(), assetType)

  if (!result) {
    res.status(404).json({
      error: "Card not found or pricing unavailable",
      id,
    })
    return
  }

  res.json({
    ...result,
    rateLimit: {
      limit: 60,
      remaining: rateLimitResult.remaining,
      resetTime: new Date(rateLimitResult.resetTime).toISOString(),
    },
  })
})
