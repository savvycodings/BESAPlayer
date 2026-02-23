-- Add pudo address (single field), remove old address columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pudo_address" text;
ALTER TABLE "users" DROP COLUMN IF EXISTS "address_line_1";
ALTER TABLE "users" DROP COLUMN IF EXISTS "address_line_2";
ALTER TABLE "users" DROP COLUMN IF EXISTS "city";
ALTER TABLE "users" DROP COLUMN IF EXISTS "state_province";
ALTER TABLE "users" DROP COLUMN IF EXISTS "postal_code";
ALTER TABLE "users" DROP COLUMN IF EXISTS "country";
