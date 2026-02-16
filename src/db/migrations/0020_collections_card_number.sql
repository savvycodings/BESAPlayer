-- Add card_number to collections so we can build TCG image URL from set + number when no card_prices row
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "card_number" varchar(50);
