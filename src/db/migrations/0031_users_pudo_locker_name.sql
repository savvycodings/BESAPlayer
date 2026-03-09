-- Add chosen PUDO locker name to users (for display and processing; code + address already exist)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pudo_locker_name" varchar(255);
