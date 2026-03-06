-- One row per card per calendar day: add recorded_date and unique (card_id, recorded_date)
-- so client-driven lookups (and scripts) store at most one snapshot per day per card.
-- History is built internally; we only get today's price from Pokedata.
-- Use Africa/Johannesburg (Cape Town / SA) for "day" so it matches local usage.

ALTER TABLE "card_price_history" ADD COLUMN IF NOT EXISTS "recorded_date" varchar(10);

UPDATE "card_price_history"
SET "recorded_date" = to_char((("recorded_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Johannesburg')::date, 'YYYY-MM-DD')
WHERE "recorded_date" IS NULL;

-- Dedupe: keep one row per (card_id, recorded_date), keep the one with latest recorded_at (highest id)
DELETE FROM "card_price_history" a
USING "card_price_history" b
WHERE a.card_id = b.card_id
  AND a.recorded_date = b.recorded_date
  AND a.id < b.id;

ALTER TABLE "card_price_history" ALTER COLUMN "recorded_date" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "card_price_history_card_date_unique"
ON "card_price_history" ("card_id", "recorded_date");
