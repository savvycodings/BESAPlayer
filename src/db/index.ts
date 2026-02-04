import { Pool, PoolClient } from 'pg'
import 'dotenv/config'

// Create a connection pool
// Neon provides a connection string in the format:
// postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') 
    ? { rejectUnauthorized: false } 
    : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
})

// Re-export Drizzle db instance and schema for convenience
export { db, schema } from './drizzle'

// Export commonly used tables directly for easier imports
import { schema as dbSchema } from './drizzle'
export const users = dbSchema.users
export const collections = dbSchema.collections
export const stores = dbSchema.stores
export const sessions = dbSchema.sessions
export const storeListings = dbSchema.storeListings
export const orders = dbSchema.orders
export const auctions = dbSchema.auctions
export const isoItems = dbSchema.isoItems
export const followers = dbSchema.followers
export const vaultedRequests = dbSchema.vaultedRequests

// Test the database connection
export async function testConnection(): Promise<boolean> {
  console.log('\n🔍 ========== TESTING DATABASE CONNECTION ==========')
  console.log('🌐 DATABASE_URL exists:', !!process.env.DATABASE_URL)
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL
    const masked = url.replace(/:[^:@]+@/, ':****@') // Mask password
    console.log('🌐 DATABASE_URL:', masked.substring(0, 80) + '...')
  }
  
  try {
    console.log('🔌 Attempting to connect to database...')
    const client = await pool.connect()
    console.log('✅ Connection pool client acquired')
    
    console.log('🔍 Testing query execution...')
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version')
    client.release()
    console.log('✅ Database connected successfully')
    console.log('   Database time:', result.rows[0].current_time)
    console.log('   PostgreSQL version:', result.rows[0].pg_version?.substring(0, 50) + '...')
    
    // Check if tables exist
    console.log('🔍 Checking if database tables exist...')
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'collections', 'stores', 'sessions')
      ORDER BY table_name;
    `)
    const existingTables = tablesCheck.rows.map((r: any) => r.table_name)
    console.log('   Required tables found:', existingTables.length, 'of 4')
    console.log('   Tables:', existingTables.join(', ') || 'NONE')
    
    if (existingTables.length < 4) {
      const missing = ['users', 'collections', 'stores', 'sessions'].filter(t => !existingTables.includes(t))
      console.log('⚠️  Missing tables:', missing.join(', '))
      console.log('⚠️  Run "npm run db:push" to create missing tables')
    }
    
    console.log('✅ ========== DATABASE CONNECTION TEST COMPLETE ==========\n')
    return true
  } catch (error: any) {
    console.error('❌ ========== DATABASE CONNECTION FAILED ==========')
    console.error('❌ Error message:', error.message)
    console.error('❌ Error code:', error.code)
    console.error('❌ Error details:', error)
    console.error('❌ ========== DATABASE CONNECTION FAILED END ==========\n')
    return false
  }
}

// Get a client from the pool
export async function getClient(): Promise<PoolClient> {
  return await pool.connect()
}

// Execute a query
export async function query(text: string, params?: any[]) {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log('Executed query', { text, duration, rows: res.rowCount })
    return res
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

// Export the pool for advanced usage
export { pool }

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.end()
  console.log('Database pool closed')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await pool.end()
  console.log('Database pool closed')
  process.exit(0)
})
