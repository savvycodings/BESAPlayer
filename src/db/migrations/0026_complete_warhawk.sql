ALTER TABLE "orders" ADD COLUMN "shipping_fee_zar" numeric(10, 2) DEFAULT '100.00';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_status" varchar(50) DEFAULT 'order_placed';--> statement-breakpoint
ALTER TABLE "store_listings" ADD COLUMN "card_image_back" text;--> statement-breakpoint
ALTER TABLE "store_listings" ADD COLUMN "card_image_close" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "twitch_url" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "youtube_url" text;