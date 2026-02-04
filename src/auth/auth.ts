import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { expo } from "@better-auth/expo"
import { db, schema } from "../db/drizzle"

// Get Better Auth URL - supports ngrok for mobile development
const getBetterAuthUrl = () => {
  // If BETTER_AUTH_URL is set (can be ngrok URL), use it
  if (process.env.BETTER_AUTH_URL) {
    const url = process.env.BETTER_AUTH_URL
    console.log('🔐 Better Auth baseURL:', url)
    return url
  }
  
  // Default to localhost for development
  const defaultUrl = "http://localhost:3050"
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
  trustedOrigins: (request) => {
    const origins = ["saplayer://"] // Your app scheme from app.json
    
    // In development, allow all exp:// origins
    if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
      origins.push(
        "exp://",                      // Trust all Expo URLs (prefix matching)
        "exp://**",                    // Trust all Expo URLs (wildcard matching)
        "exp://192.168.*.*:*/**",      // Trust 192.168.x.x IP range
        "exp://192.168.1.3:8081",      // Specific Expo Go URL
        "exp://192.168.1.3:*",         // Any port on this IP
        "exp://*:*"                    // Any exp:// URL (development only)
      )
      
      // If we have a request, also allow its origin
      if (request?.headers?.origin) {
        const origin = request.headers.origin as string
        if (origin.startsWith('exp://')) {
          origins.push(origin)
        }
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
