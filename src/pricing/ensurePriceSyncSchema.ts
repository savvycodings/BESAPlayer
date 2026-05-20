import { sql } from 'drizzle-orm'
import { db } from '../db'

/** Idempotent DDL for price sync job tables and market_cards.last_price_synced_at. */
export async function ensurePriceSyncSchema(database: typeof db = db) {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS price_sync_jobs (
      id varchar(36) PRIMARY KEY NOT NULL,
      recorded_date varchar(10) NOT NULL,
      status varchar(20) DEFAULT 'pending' NOT NULL,
      cursor_card_id integer DEFAULT 0 NOT NULL,
      total_cards integer DEFAULT 0 NOT NULL,
      processed integer DEFAULT 0 NOT NULL,
      succeeded integer DEFAULT 0 NOT NULL,
      failed integer DEFAULT 0 NOT NULL,
      error_summary text,
      started_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL,
      completed_at timestamp
    )
  `)
  await database.execute(sql`CREATE INDEX IF NOT EXISTS price_sync_jobs_recorded_date_idx ON price_sync_jobs (recorded_date)`)
  await database.execute(sql`CREATE INDEX IF NOT EXISTS price_sync_jobs_status_idx ON price_sync_jobs (status)`)

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS price_sync_failures (
      id serial PRIMARY KEY NOT NULL,
      job_id varchar(36) NOT NULL REFERENCES price_sync_jobs(id) ON DELETE CASCADE,
      pokedata_card_id integer NOT NULL,
      error text NOT NULL,
      attempts integer DEFAULT 1 NOT NULL,
      last_attempt_at timestamp DEFAULT now() NOT NULL
    )
  `)
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS price_sync_failures_job_card_unique
    ON price_sync_failures (job_id, pokedata_card_id)
  `)

  await database.execute(sql`ALTER TABLE market_cards ADD COLUMN IF NOT EXISTS last_price_synced_at timestamp`)
}
