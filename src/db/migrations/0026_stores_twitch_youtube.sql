-- Add Twitch and YouTube URL columns to stores for social links
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "twitch_url" text;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "youtube_url" text;
