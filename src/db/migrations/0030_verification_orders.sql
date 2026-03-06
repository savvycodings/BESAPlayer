-- Verification orders: one per R100 verification payment; links to vaulted_requests for courier/ops
CREATE TABLE IF NOT EXISTS "verification_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "payment_id" varchar(100) NOT NULL UNIQUE,
  "amount" decimal(10, 2) DEFAULT '100.00',
  "user_email" varchar(255),
  "user_name" varchar(255),
  "pudo_locker_code" varchar(100),
  "pudo_address" text,
  "dropoff_code" varchar(50),
  "tracking_status" varchar(50) DEFAULT 'pending_dropoff',
  "expires_at" timestamp,
  "paid_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Which vaulted_requests are included in a verification order
CREATE TABLE IF NOT EXISTS "verification_order_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "verification_order_id" integer NOT NULL REFERENCES "verification_orders"("id") ON DELETE CASCADE,
  "vaulted_request_id" integer NOT NULL REFERENCES "vaulted_requests"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);
