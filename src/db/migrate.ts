import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './drizzle'
import { baselineDrizzleMigrationsIfNeeded } from './baselineMigrations'
import 'dotenv/config'

async function runMigrations() {
  console.log('🔄 Running database migrations...')

  try {
    const { baselined, skipped } = await baselineDrizzleMigrationsIfNeeded()
    if (baselined > 0) {
      console.log(`📌 Baselined ${baselined} existing migration(s) (DB had tables but empty __drizzle_migrations)`)
    } else if (!skipped) {
      console.log('📌 Fresh database — applying all migrations')
    }

    await migrate(db, { migrationsFolder: './src/db/migrations' })
    console.log('✅ Migrations completed successfully!')
    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    console.error('')
    console.error('If Neon already has your tables, run: pnpm run db:baseline')
    console.error('For market catalog only: pnpm run db:ensure-market')
    await pool.end().catch(() => {})
    process.exit(1)
  }
}

runMigrations()
