CREATE TABLE "card_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"market_price" numeric(10, 2),
	"ebay_last_sold" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'USD'
);
--> statement-breakpoint
ALTER TABLE "store_listings" ADD COLUMN "collection_id" integer;--> statement-breakpoint
ALTER TABLE "store_listings" ADD CONSTRAINT "store_listings_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;