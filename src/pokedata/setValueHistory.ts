import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { pokedataClient } from "./client"
import { rateLimit, getClientIP, RateLimitResult } from "./rateLimiter"

export const getSetValueHistory = asyncHandler(async (req: Request, res: Response) => {
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

  const setName = (req.query.setName as string)?.trim()
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || "7"), 10) || 7))

  if (!setName) {
    res.status(400).json({ error: "setName query parameter is required" })
    return
  }

  const history = await pokedataClient.getSetValueHistory(setName, days)

  res.json({
    history: history || [],
    setName,
    days,
    rateLimit: {
      limit: 60,
      remaining: rateLimitResult.remaining,
      resetTime: new Date(rateLimitResult.resetTime).toISOString(),
    },
  })
})
