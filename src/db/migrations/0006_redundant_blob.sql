ALTER TABLE "collections" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "followers" ALTER COLUMN "follower_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "followers" ALTER COLUMN "following_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "buyer_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "vaulted_requests" ALTER COLUMN "user_id" SET DATA TYPE text;