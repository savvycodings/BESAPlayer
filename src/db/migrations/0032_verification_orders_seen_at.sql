-- When the user saw the dropoff code in the app (for "new" indicator, no push needed)
ALTER TABLE "verification_orders" ADD COLUMN IF NOT EXISTS "user_seen_dropoff_code_at" timestamp;
