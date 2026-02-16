-- Cache Pokedata search results so repeated searches (by any user) don't hit the API
CREATE TABLE IF NOT EXISTS "pokedata_search_cache" (
  "cache_key" text PRIMARY KEY NOT NULL,
  "results" jsonb NOT NULL,
  "fetched_at" timestamp DEFAULT now() NOT NULL
);
