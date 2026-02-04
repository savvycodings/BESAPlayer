import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { pokedataClient } from "./client"
import { rateLimit, getClientIP, RateLimitResult } from "./rateLimiter"

type AssetType = "CARD" | "SEALED"
type Language = "en" | "es" | "fr" | "de" | "it" | "pt" | "ja" | "ko" | "zh"

export const searchCards = asyncHandler(async (req: Request, res: Response) => {
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

    const query = req.query.query as string
    const assetType = (req.query.asset_type as AssetType) || "CARD"
    const language = req.query.language as Language | undefined

    if (!query) {
      res.status(400).json({ error: "Query parameter is required" })
      return
    }

    const results = await pokedataClient.searchCards(query, assetType, language)

    res.json({
      results,
      rateLimit: {
        limit: 60,
        remaining: rateLimitResult.remaining,
        resetTime: new Date(rateLimitResult.resetTime).toISOString(),
      },
    })
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to search cards",
    })
  }
})

