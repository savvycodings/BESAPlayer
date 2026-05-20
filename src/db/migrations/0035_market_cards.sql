ALTER TABLE "market_sets" ADD COLUMN IF NOT EXISTS "cards_synced_at" timestamp;

CREATE TABLE IF NOT EXISTS "market_cards" (
  "pokedata_card_id" integer PRIMARY KEY NOT NULL,
  "pokedata_set_id" integer NOT NULL REFERENCES "market_sets"("pokedata_set_id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "num" varchar(32) NOT NULL,
  "language" varchar(20) DEFAULT 'ENGLISH' NOT NULL,
  "set_code" varchar(32),
  "set_name" varchar(255),
  "secret" boolean DEFAULT false NOT NULL,
  "release_date" timestamp,
  "last_synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "market_cards_set_id_idx" ON "market_cards" ("pokedata_set_id");
CREATE INDEX IF NOT EXISTS "market_cards_set_num_idx" ON "market_cards" ("pokedata_set_id", "num");
CREATE INDEX IF NOT EXISTS "market_cards_name_idx" ON "market_cards" ("name");
