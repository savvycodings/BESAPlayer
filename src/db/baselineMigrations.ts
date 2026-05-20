import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { pool } from './drizzle'

type JournalEntry = {
  idx: number
  tag: string
}

type Journal = {
  entries: JournalEntry[]
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, 'meta', '_journal.json')

function hashMigrationSql(sql: string): string {
  return createHash('sha256').update(sql).digest('hex')
}

async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`])
  return res.rows[0]?.reg != null
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)
}

async function getAppliedHashes(): Promise<Set<string>> {
  await ensureMigrationsTable()
  const res = await pool.query<{ hash: string }>(`SELECT hash FROM drizzle.__drizzle_migrations`)
  return new Set(res.rows.map((r) => r.hash))
}

/**
 * Neon (and other envs) often have tables from db:push or manual setup while
 * drizzle.__drizzle_migrations is empty. That makes db:migrate retry 0000 and fail.
 * Record journal migrations as already applied without re-running their SQL.
 */
export async function baselineDrizzleMigrationsIfNeeded(): Promise<{ baselined: number; skipped: boolean }> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required')
  }

  const hasCollections = await tableExists('collections')
  if (!hasCollections) {
    return { baselined: 0, skipped: true }
  }

  const applied = await getAppliedHashes()

  if (!fs.existsSync(JOURNAL_PATH)) {
    throw new Error(`Missing migration journal: ${JOURNAL_PATH}`)
  }

  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8')) as Journal
  const firstTag = journal.entries[0]?.tag
  if (firstTag) {
    const firstPath = path.join(MIGRATIONS_DIR, `${firstTag}.sql`)
    if (fs.existsSync(firstPath)) {
      const firstHash = hashMigrationSql(fs.readFileSync(firstPath, 'utf8'))
      if (applied.has(firstHash)) {
        return { baselined: 0, skipped: true }
      }
    }
  }

  let baselined = 0
  const now = Date.now()

  for (const entry of journal.entries) {
    const filePath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`)
    if (!fs.existsSync(filePath)) {
      console.warn(`  [baseline] skip missing file: ${entry.tag}.sql`)
      continue
    }
    const sql = fs.readFileSync(filePath, 'utf8')
    const hash = hashMigrationSql(sql)
    if (applied.has(hash)) continue

    await pool.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [
      hash,
      now,
    ])
    applied.add(hash)
    baselined++
  }

  return { baselined, skipped: false }
}
