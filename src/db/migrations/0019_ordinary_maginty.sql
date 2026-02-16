CREATE TABLE "pokedata_search_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"results" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_prices" ADD COLUMN "image_url" text;