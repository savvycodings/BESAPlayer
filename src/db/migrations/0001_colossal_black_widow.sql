CREATE TABLE "auctions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"status" varchar(50) DEFAULT 'starting',
	"current_bid" numeric(10, 2),
	"bid_count" integer DEFAULT 0,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iso_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"card_name" varchar(255) NOT NULL,
	"card_number" varchar(50),
	"set" varchar(255),
	"image" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"item_image" text,
	"price" numeric(10, 2) NOT NULL,
	"quantity" integer DEFAULT 1,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"status" varchar(50) DEFAULT 'processing',
	"order_number" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "store_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"card_name" varchar(255) NOT NULL,
	"card_image" text,
	"price" numeric(10, 2) NOT NULL,
	"vaulting_status" varchar(50) DEFAULT 'seller-has',
	"purchase_type" varchar(50) DEFAULT 'both',
	"current_bid" numeric(10, 2),
	"bid_count" integer DEFAULT 0,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iso_items" ADD CONSTRAINT "iso_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_listings" ADD CONSTRAINT "store_listings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;