-- Add back and up-close listing photos for store_listings (Pudo / buyer trust)
ALTER TABLE "store_listings" ADD COLUMN IF NOT EXISTS "card_image_back" text;
ALTER TABLE "store_listings" ADD COLUMN IF NOT EXISTS "card_image_close" text;
