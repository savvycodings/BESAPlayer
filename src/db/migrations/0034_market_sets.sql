CREATE TABLE IF NOT EXISTS "market_sets" (
  "pokedata_set_id" integer PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "code" varchar(32),
  "language" varchar(20) DEFAULT 'ENGLISH' NOT NULL,
  "release_date" timestamp,
  "tcg" varchar(50),
  "card_count" integer DEFAULT 0 NOT NULL,
  "tcg_set_id" varchar(32),
  "last_synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "market_sets_language_idx" ON "market_sets" ("language");
CREATE INDEX IF NOT EXISTS "market_sets_release_date_idx" ON "market_sets" ("release_date" DESC);
