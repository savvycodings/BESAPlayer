import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { expo } from "@better-auth/expo"
import { db, schema } from "../db/drizzle"

// Get Better Auth URL - use localhost when running server locally, Railway URL in production
const getBetterAuthUrl = () => {
  // Local dev: force localhost so sign-in works when app and server run on this machine
  if (process.env.USE_LOCALHOST_AUTH === '1' || process.env.USE_LOCALHOST_AUTH === 'true') {
    const url = 'http://localhost:3050'
    console.log('🔐 Better Auth baseURL (local):', url)
    return url
  }
  if (process.env.BETTER_AUTH_URL) {
    const url = process.env.BETTER_AUTH_URL.replace(/\/$/, '')
    console.log('🔐 Better Auth baseURL:', url)
    return url
  }
  const defaultUrl = 'http://localhost:3050'
  console.log('🔐 Better Auth baseURL (default):', defaultUrl)
  return defaultUrl
}

const baseURL = getBetterAuthUrl()

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,              // Map Better Auth's "user" to our "users" table
      session: schema.sessions,        // Map Better Auth's "session" to our "sessions" table
      account: schema.accounts,        // Map Better Auth's "account" to our "accounts" table
      verification: schema.verificationTokens, // Map Better Auth's "verification" to our "verification_tokens" table
    },
    // Map field names if using snake_case in database
    // Better Auth expects camelCase, but our DB uses snake_case
    // The adapter should handle this automatically, but we can be explicit
  }),
  secret: process.env.BETTER_AUTH_SECRET || "c0AaF2eamheRYbcHJHr1i5dqYFNSt7u0",
  baseURL: baseURL,
  // Use function-based trustedOrigins for dynamic origin handling
  // 'request' type comes from better-auth/node and its headers may not be a plain object,
  // so we treat it as 'any' to safely access origin across environments.
  trustedOrigins: (request: any) => {
    const origins = ["saplayer://"] // Your app scheme from app.json
    
    // In development, allow Expo and localhost web origins
    if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV || process.env.USE_LOCALHOST_AUTH === 'true' || process.env.USE_LOCALHOST_AUTH === '1') {
      origins.push(
        "exp://",
        "exp://**",
        "exp://192.168.*.*:*/**",
        "exp://192.168.1.3:8081",
        "exp://192.168.1.3:*",
        "exp://*:*",
        "http://localhost:8081",   // Expo web default
        "http://localhost:19006",   // Expo web alternate
        "http://localhost:3050",
        "http://localhost:3000",
        "http://localhost:5173"
      )
      const origin: string | undefined =
        (request?.headers as any)?.origin ??
        (typeof (request?.headers as any)?.get === 'function'
          ? (request.headers as any).get('origin')
          : undefined)
      if (origin && (origin.startsWith('exp://') || origin.startsWith('http://localhost') || origin.startsWith('https://localhost'))) {
        origins.push(origin)
      }
    }
    
    return origins
  },
  plugins: [expo()],
  emailAndPassword: { 
    enabled: true,
  },
  user: {
    // Explicitly map fields to ensure Better Auth recognizes them
    // The adapter should handle this, but being explicit helps
  },
})
