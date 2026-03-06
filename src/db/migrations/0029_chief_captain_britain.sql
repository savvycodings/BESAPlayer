CREATE TABLE "verification_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"verification_order_id" integer NOT NULL,
	"vaulted_request_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"payment_id" varchar(100) NOT NULL,
	"amount" numeric(10, 2) DEFAULT '100.00',
	"user_email" varchar(255),
	"user_name" varchar(255),
	"pudo_locker_code" varchar(100),
	"pudo_address" text,
	"dropoff_code" varchar(50),
	"tracking_status" varchar(50) DEFAULT 'pending_dropoff',
	"expires_at" timestamp,
	"paid_at" timestamp,
	"user_seen_dropoff_code_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verification_orders_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
ALTER TABLE "card_price_history" ADD COLUMN "recorded_date" varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expo_push_token" text;--> statement-breakpoint
ALTER TABLE "verification_order_items" ADD CONSTRAINT "verification_order_items_verification_order_id_verification_orders_id_fk" FOREIGN KEY ("verification_order_id") REFERENCES "public"."verification_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_order_items" ADD CONSTRAINT "verification_order_items_vaulted_request_id_vaulted_requests_id_fk" FOREIGN KEY ("vaulted_request_id") REFERENCES "public"."vaulted_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_orders" ADD CONSTRAINT "verification_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_price_history_card_date_unique" ON "card_price_history" USING btree ("card_id","recorded_date");