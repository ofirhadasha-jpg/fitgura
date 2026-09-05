/*
# Create profiles and favorites tables for user data migration

1. New Tables
- `profiles` — stores per-user body measurements and gender
  - `user_id` (uuid, primary key, references auth.users)
  - `gender` (text: 'male' | 'female' | 'unisex')
  - `chest_cm` (numeric, nullable)
  - `waist_cm` (numeric, nullable)
  - `hips_cm` (numeric, nullable)
  - `shoulder_cm` (numeric, nullable)
  - `height_cm` (numeric, nullable)
  - `weight_kg` (numeric, nullable)
  - `updated_at` (timestamptz, auto-updated)
- `favorites` — stores per-user favorited product IDs
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, defaults to auth.uid())
  - `product_id` (text, the AliExpress product ID or internal index)
  - `product_name` (text, nullable)
  - `created_at` (timestamptz)

2. Security
- Enable RLS on both tables.
- Owner-scoped CRUD: authenticated users can only access their own rows.
- `user_id` defaults to auth.uid() so inserts omitting it still succeed.
*/

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gender text DEFAULT 'unisex',
  chest_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  shoulder_cm numeric,
  height_cm numeric,
  weight_kg numeric,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_favorites" ON favorites;
CREATE POLICY "select_own_favorites" ON favorites FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_favorites" ON favorites;
CREATE POLICY "insert_own_favorites" ON favorites FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_favorites" ON favorites;
CREATE POLICY "update_own_favorites" ON favorites FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_favorites" ON favorites;
CREATE POLICY "delete_own_favorites" ON favorites FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
