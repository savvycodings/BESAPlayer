CREATE TABLE "card_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"card_name" varchar(255),
	"set_name" varchar(255),
	"market_price" numeric(10, 2),
	"ebay_last_sold" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'USD',
	"last_fetched_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_listings" ADD COLUMN "card_id" varchar(100);