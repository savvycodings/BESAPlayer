ALTER TABLE "store_listings" ADD COLUMN IF NOT EXISTS "quantity" integer DEFAULT 1 NOT NULL;
