-- Orders: PUDO locker-to-locker shipping details
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "buyer_pudo_locker_code" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "buyer_shipping_address" text;
