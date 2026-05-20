import { sql } from 'drizzle-orm'
import { db } from '../db'

/**
 * Idempotent DDL for market catalog tables (Neon-safe when db:migrate is out of sync).
 * Used by sync scripts and first API request — no drizzle migrate required.
 */
export async function ensureMarketSchema(database: typeof db = db) {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS market_sets (
      pokedata_set_id integer PRIMARY KEY NOT NULL,
      name varchar(255) NOT NULL,
      code varchar(32),
      language varchar(20) DEFAULT 'ENGLISH' NOT NULL,
      release_date timestamp,
      tcg varchar(50),
      card_count integer DEFAULT 0 NOT NULL,
      tcg_set_id varchar(32),
      last_synced_at timestamp DEFAULT now() NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `)
  await database.execute(sql`ALTER TABLE market_sets ADD COLUMN IF NOT EXISTS cards_synced_at timestamp`)
  await database.execute(sql`CREATE INDEX IF NOT EXISTS market_sets_language_idx ON market_sets (language)`)
  await database.execute(sql`CREATE INDEX IF NOT EXISTS market_sets_release_date_idx ON market_sets (release_date DESC)`)

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS market_cards (
      pokedata_card_id integer PRIMARY KEY NOT NULL,
      pokedata_set_id integer NOT NULL REFERENCES market_sets(pokedata_set_id) ON DELETE CASCADE,
      name varchar(255) NOT NULL,
      num varchar(32) NOT NULL,
      language varchar(20) DEFAULT 'ENGLISH' NOT NULL,
      set_code varchar(32),
      set_name varchar(255),
      secret boolean DEFAULT false NOT NULL,
      release_date timestamp,
      last_synced_at timestamp DEFAULT now() NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `)
  await database.execute(sql`CREATE INDEX IF NOT EXISTS market_cards_set_id_idx ON market_cards (pokedata_set_id)`)
  await database.execute(sql`CREATE INDEX IF NOT EXISTS market_cards_set_num_idx ON market_cards (pokedata_set_id, num)`)
  await database.execute(sql`CREATE INDEX IF NOT EXISTS market_cards_name_idx ON market_cards (name)`)
  await database.execute(sql`ALTER TABLE market_cards ADD COLUMN IF NOT EXISTS last_price_synced_at timestamp`)
}
