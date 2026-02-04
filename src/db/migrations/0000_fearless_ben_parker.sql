CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"image" text,
	"card_id" varchar(100),
	"condition" varchar(50),
	"grade" integer,
	"estimated_value" numeric(10, 2),
	"purchase_price" numeric(10, 2),
	"purchase_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(500) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"store_name" varchar(255),
	"description" text,
	"banner_url" text,
	"profile_image" text,
	"verification_level" varchar(50) DEFAULT 'unverified',
	"total_sales" integer DEFAULT 0,
	"rating" numeric(3, 2) DEFAULT '0',
	"total_reviews" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stores_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"name" varchar(255),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"username" varchar(100),
	"phone" varchar(20),
	"avatar" text,
	"bio" text,
	"location" varchar(255),
	"date_of_birth" timestamp,
	"is_premium" boolean DEFAULT false,
	"is_verified" boolean DEFAULT false,
	"level" integer DEFAULT 1,
	"current_xp" integer DEFAULT 0,
	"xp_to_next_level" integer DEFAULT 100,
	"portfolio_value" numeric(10, 2) DEFAULT '0',
	"website" varchar(255),
	"twitter" varchar(100),
	"instagram" varchar(100),
	"preferences" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	"email_verified_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;