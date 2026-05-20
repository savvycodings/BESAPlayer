import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { eq, and, gt } from "drizzle-orm"
import { db, pokedataSearchCache } from "../db"
import { pokedataClient } from "./client"
import { rateLimit, getClientIP, RateLimitResult } from "./rateLimiter"
import { ensureMarketSchema } from "../market/ensureMarketSchema"
import { countMarketCards, searchMarketCards, toSearchResults } from "../market/marketSearch"

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

    const limitParam = req.query.limit
    const limit = Math.min(Math.max(parseInt(String(limitParam), 10) || 3, 1), 20)

    // 1) Local market catalog (synced via pnpm run fetch-set-cards) — no Pokedata credits
    if (assetType === "CARD") {
      await ensureMarketSchema()
      const indexed = await countMarketCards()
      if (indexed > 0) {
        const marketLang = language === "ja" ? "JAPANESE" : "ENGLISH"
        const marketResults = await searchMarketCards(query, { language: marketLang, limit })
        if (marketResults.length > 0) {
          console.log(
            `[Pokedata search] market_db HIT — query="${query}" | ${marketResults.length} results (no API call)`,
          )
          res.json({
            results: toSearchResults(marketResults),
            fromCache: true,
            source: "market_db",
            rateLimit: {
              limit: 60,
              remaining: rateLimitResult.remaining,
              resetTime: new Date(rateLimitResult.resetTime).toISOString(),
            },
          })
          return
        }
        console.log(`[Pokedata search] market_db MISS — query="${query}" | falling back to Pokedata`)
      }
    }

    const cacheKey = searchCacheKey(query, assetType, language)
    const cutoff = new Date(Date.now() - SEARCH_CACHE_TTL_MS)

    const [cached] = await db
      .select()
      .from(pokedataSearchCache)
      .where(and(eq(pokedataSearchCache.cacheKey, cacheKey), gt(pokedataSearchCache.fetchedAt, cutoff)))
      .limit(1)

    if (cached) {
      const cachedResults = (cached.results as any[]).slice(0, limit)
      console.log(`[Pokedata search] Cache HIT — key: ${cacheKey} | returning ${cachedResults.length} (eco: no API call)`)
      res.json({
        results: cachedResults,
        fromCache: true,
        source: "search_cache",
        rateLimit: {
          limit: 60,
          remaining: rateLimitResult.remaining,
          resetTime: new Date(rateLimitResult.resetTime).toISOString(),
        },
      })
      return
    }

    console.log("[Pokedata search] Cache MISS — calling API (limit=" + limit + ")")
    const results = await pokedataClient.searchCards(query, assetType, language, limit)
    const limited = results.slice(0, limit)
    const resultsForCache = limited.map((r: any) => ({
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

    console.log(`[Pokedata search] Eco: cached ${resultsForCache.length} results for key "${cacheKey}" (next same query = cache HIT, no API call)`)

    res.json({
      results: limited,
      fromCache: false,
      source: "pokedata_api",
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

