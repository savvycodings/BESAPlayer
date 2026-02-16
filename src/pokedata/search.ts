import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { eq, and, gt } from "drizzle-orm"
import { db, pokedataSearchCache } from "../db"
import { pokedataClient } from "./client"
import { rateLimit, getClientIP, RateLimitResult } from "./rateLimiter"

type AssetType = "CARD" | "SEALED"
type Language = "en" | "es" | "fr" | "de" | "it" | "pt" | "ja" | "ko" | "zh"

const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours: same query by any user = no API call

function searchCacheKey(query: string, assetType: string, language?: string): string {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ")
  return `${q}|${assetType}|${language || ""}`
}

export const searchCards = asyncHandler(async (req: Request, res: Response) => {
  try {
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

    const cacheKey = searchCacheKey(query, assetType, language)
    const cutoff = new Date(Date.now() - SEARCH_CACHE_TTL_MS)

    const [cached] = await db
      .select()
      .from(pokedataSearchCache)
      .where(and(eq(pokedataSearchCache.cacheKey, cacheKey), gt(pokedataSearchCache.fetchedAt, cutoff)))
      .limit(1)

    if (cached) {
      console.log("[Pokedata search] Cache HIT — key:", cacheKey, "| results:", (cached.results as any[])?.length ?? 0)
      return res.json({
        results: cached.results as any[],
        fromCache: true,
        rateLimit: {
          limit: 60,
          remaining: rateLimitResult.remaining,
          resetTime: new Date(rateLimitResult.resetTime).toISOString(),
        },
      })
    }

    console.log("[Pokedata search] Cache MISS — calling API for:", cacheKey)
    const results = await pokedataClient.searchCards(query, assetType, language)
    const resultsForCache = results.map((r: any) => ({
      id: r.id,
      name: r.name,
      set: r.set,
      number: r.number ?? r.num,
    }))

    await db
      .insert(pokedataSearchCache)
      .values({
        cacheKey,
        results: resultsForCache,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pokedataSearchCache.cacheKey,
        set: {
          results: resultsForCache,
          fetchedAt: new Date(),
        },
      })

    res.json({
      results,
      fromCache: false,
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

