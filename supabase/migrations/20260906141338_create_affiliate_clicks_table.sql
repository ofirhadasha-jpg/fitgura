/*
# Create affiliate_clicks tracking table

1. New Tables
- `affiliate_clicks`
  - `id` (uuid, primary key, auto-generated)
  - `user_id` (uuid, references auth.users, nullable - set when user is signed in)
  - `product_id` (text, not null - the AliExpress product SKU)
  - `tracking_id` (text, not null, defaults to 'fitgura')
  - `promotion_link` (text, not null - the full s.click.aliexpress.com affiliate URL)
  - `created_at` (timestamptz, defaults to now)

2. Security
- Enable RLS on `affiliate_clicks`.
- Allow anon + authenticated to INSERT click logs (any visitor can click a product link).
- Allow authenticated users to SELECT their own click history.
- No UPDATE or DELETE policies needed (click logs are immutable).

3. Purpose
- Tracks every time a user clicks a product buy button, recording the affiliate link used.
- Enables revenue analytics and per-user click history.
*/

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL,
  tracking_id TEXT NOT NULL DEFAULT 'fitgura',
  promotion_link TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_affiliate_clicks" ON affiliate_clicks;
CREATE POLICY "anon_insert_affiliate_clicks"
ON affiliate_clicks FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "select_own_affiliate_clicks" ON affiliate_clicks;
CREATE POLICY "select_own_affiliate_clicks"
ON affiliate_clicks FOR SELECT
TO authenticated
USING (auth.uid() = user_id);