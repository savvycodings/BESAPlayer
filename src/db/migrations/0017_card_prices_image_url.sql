-- Store resolved card image URL in card_prices so profile and others reuse it (no repeated build)
ALTER TABLE "card_prices" ADD COLUMN IF NOT EXISTS "image_url" text;
