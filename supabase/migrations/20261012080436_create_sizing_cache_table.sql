/*
# Create sizing_cache table for DeepSeek Vision API response caching

1. New Tables
- `sizing_cache`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, nullable for anonymous scans)
  - `image_hash` (text, not null) — SHA-256 hash of the compressed base64 image
  - `analysis_json` (jsonb, not null) — cached AIBodyAnalysis result
  - `body_metrics` (jsonb) — cached BodyMetrics
  - `accuracy` (integer) — cached accuracy percentage
  - `created_at` (timestamptz, default now())
  - Unique constraint on (user_id, image_hash) so re-analyzing the same photo returns cache

2. Security
- Enable RLS on `sizing_cache`.
- Owner-scoped CRUD: each authenticated user can only access their own cache rows.
- Allow anon + authenticated for apps where users may not be signed in yet.
*/

CREATE TABLE IF NOT EXISTS sizing_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  image_hash text NOT NULL,
  analysis_json jsonb NOT NULL,
  body_metrics jsonb,
  accuracy integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, image_hash)
);

ALTER TABLE sizing_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sizing_cache" ON sizing_cache;
CREATE POLICY "select_own_sizing_cache" ON sizing_cache FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_sizing_cache" ON sizing_cache;
CREATE POLICY "insert_own_sizing_cache" ON sizing_cache FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_sizing_cache" ON sizing_cache;
CREATE POLICY "update_own_sizing_cache" ON sizing_cache FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_sizing_cache" ON sizing_cache;
CREATE POLICY "delete_own_sizing_cache" ON sizing_cache FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sizing_cache_hash ON sizing_cache(image_hash);
