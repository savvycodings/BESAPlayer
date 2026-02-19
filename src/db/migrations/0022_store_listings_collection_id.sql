ALTER TABLE "store_listings" ADD COLUMN "collection_id" integer REFERENCES "collections"("id") ON DELETE SET NULL;
