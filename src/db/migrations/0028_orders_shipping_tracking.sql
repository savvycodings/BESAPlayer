-- Orders: R100 shipping and tracking for Pudo locker-to-locker
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_fee_zar" decimal(10, 2) DEFAULT '100.00';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_status" varchar(50) DEFAULT 'order_placed';
