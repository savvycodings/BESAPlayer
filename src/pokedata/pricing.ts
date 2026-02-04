import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { pokedataClient } from "./client"
import { rateLimit, getClientIP, RateLimitResult } from "./rateLimiter"

type AssetType = "CARD" | "SEALED"

export const getCardPricing = asyncHandler(async (req: Request, res: Response) => {
  try {
    // Rate limit: 60 requests per 15 minutes per IP
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

    const id = req.query.id as string
    const assetType = (req.query.asset_type as AssetType) || "CARD"

    if (!id) {
      res.status(400).json({ error: "ID parameter is required" })
      return
    }

    const pricing = await pokedataClient.getCardPricing(id, assetType)

    res.json({
      pricing,
      rateLimit: {
        limit: 60,
        remaining: rateLimitResult.remaining,
        resetTime: new Date(rateLimitResult.resetTime).toISOString(),
      },
    })
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to fetch pricing",
    })
  }
})

