interface RateLimitEntry {
  count: number
  resetTime: number
}

// Simple in-memory rate limiter
// In production, consider using Redis or a more robust solution
const rateLimitStore = new Map<string, RateLimitEntry>()

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetTime: number
}

/**
 * Simple rate limiter
 * @param identifier Unique identifier (e.g., IP address)
 * @param maxRequests Maximum number of requests allowed
 * @param windowMs Time window in milliseconds
 * @returns Rate limit result
 */
export function rateLimit(
  identifier: string,
  maxRequests: number = 60,
  windowMs: number = 15 * 60 * 1000 // 15 minutes default
): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)

  // Clean up expired entries periodically (simple cleanup)
  if (rateLimitStore.size > 1000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key)
      }
    }
  }

  if (!entry || entry.resetTime < now) {
    // Create new entry or reset expired entry
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + windowMs,
    }
    rateLimitStore.set(identifier, newEntry)
    return {
      success: true,
      remaining: maxRequests - 1,
      resetTime: newEntry.resetTime,
    }
  }

  if (entry.count >= maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  // Increment count
  entry.count++
  rateLimitStore.set(identifier, entry)

  return {
    success: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime,
  }
}

/**
 * Get client IP from Express request
 */
export function getClientIP(req: any): string {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "unknown"
  )
}

