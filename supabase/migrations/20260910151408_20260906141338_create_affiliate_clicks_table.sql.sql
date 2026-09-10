/*
# Create affiliate click tracking

1. New Tables
- `affiliate_clicks`: records product ID, tracking ID, promotion link, optional user, and timestamp.
2. Security
- RLS enabled.
- Anonymous and authenticated visitors may insert click logs.
- Authenticated users may view only their own click history.
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