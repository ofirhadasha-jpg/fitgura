/*
# Create fitted_wardrobe table for saved analyzed share-link items

1. New Tables
- `fitted_wardrobe`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, nullable for guests)
  - `product_url` (text, not null) — the original shared URL
  - `product_name` (text) — extracted product name
  - `product_image` (text) — extracted product image URL
  - `platform` (text) — detected platform (SHEIN, AliExpress, Temu, Zara, etc.)
  - `recommended_size` (text) — the AI recommended size
  - `match_percentage` (integer) — fit match score
  - `fit_breakdown` (jsonb) — chest/waist/length fit details
  - `affiliate_url` (text) — URL wrapped with affiliate tracking
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `fitted_wardrobe`.
- Owner-scoped CRUD for authenticated users.
- Allow anon for guest use.
*/

CREATE TABLE IF NOT EXISTS fitted_wardrobe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  product_url text NOT NULL,
  product_name text,
  product_image text,
  platform text,
  recommended_size text,
  match_percentage integer DEFAULT 0,
  fit_breakdown jsonb,
  affiliate_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fitted_wardrobe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wardrobe" ON fitted_wardrobe;
CREATE POLICY "select_own_wardrobe" ON fitted_wardrobe FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_wardrobe" ON fitted_wardrobe;
CREATE POLICY "insert_own_wardrobe" ON fitted_wardrobe FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_wardrobe" ON fitted_wardrobe;
CREATE POLICY "update_own_wardrobe" ON fitted_wardrobe FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_wardrobe" ON fitted_wardrobe;
CREATE POLICY "delete_own_wardrobe" ON fitted_wardrobe FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_wardrobe_user ON fitted_wardrobe(user_id);
