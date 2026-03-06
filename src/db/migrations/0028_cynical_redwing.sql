CREATE TABLE "listing_bids" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"bidder_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pudo_locker_code" varchar(100);--> statement-breakpoint
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_listing_id_store_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."store_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_bidder_id_users_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;