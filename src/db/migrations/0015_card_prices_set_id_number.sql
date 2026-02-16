-- Add setId and cardNumber to card_prices for building images.pokemontcg.io URLs
ALTER TABLE "card_prices" ADD COLUMN IF NOT EXISTS "set_id" varchar(100);
ALTER TABLE "card_prices" ADD COLUMN IF NOT EXISTS "card_number" varchar(50);
