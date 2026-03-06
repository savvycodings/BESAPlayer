-- Store Expo push token per user for notifications (e.g. dropoff code ready)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "expo_push_token" text;
