CREATE TABLE "vaulted_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"collection_id" integer,
	"card_name" varchar(255) NOT NULL,
	"card_image" text,
	"set" varchar(255),
	"status" varchar(50) DEFAULT 'pending',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vaulted_requests" ADD CONSTRAINT "vaulted_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaulted_requests" ADD CONSTRAINT "vaulted_requests_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;