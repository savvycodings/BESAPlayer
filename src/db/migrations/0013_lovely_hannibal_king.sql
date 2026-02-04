ALTER TABLE "verification_tokens" DROP CONSTRAINT "verification_tokens_token_unique";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "account_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "provider_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "password" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "token" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "ip_address" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_tokens" ALTER COLUMN "identifier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "id_token" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "access_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "refresh_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD COLUMN "value" text NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "verification_tokens" DROP COLUMN "token";--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_value_unique" UNIQUE("value");