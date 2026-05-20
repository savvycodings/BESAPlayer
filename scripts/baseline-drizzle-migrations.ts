/**
 * One-time repair: mark existing journal migrations as applied when tables already exist
 * but drizzle.__drizzle_migrations is empty (common on Neon after db:push).
 *
 * Usage: pnpm run db:baseline
 */
import 'dotenv/config'
import { baselineDrizzleMigrationsIfNeeded } from '../src/db/baselineMigrations'
import { pool } from '../src/db/drizzle'

async function main() {
  console.log('Checking if Drizzle migration baseline is needed…')
  const { baselined, skipped } = await baselineDrizzleMigrationsIfNeeded()

  if (skipped && baselined === 0) {
    const res = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
    )
    const count = Number(res.rows[0]?.count ?? 0)
    if (count > 0) {
      console.log(`Migration table already has ${count} entries — no baseline needed.`)
    } else {
      console.log('Fresh database (no collections table) — run pnpm run db:migrate normally.')
    }
  } else {
    console.log(`Baselined ${baselined} migration(s). You can now run: pnpm run db:migrate`)
  }

  await pool.end()
}

main().catch(async (err) => {
  console.error(err)
  await pool.end().catch(() => {})
  process.exit(1)
})
