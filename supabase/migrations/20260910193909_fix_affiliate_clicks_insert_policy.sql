-- Drop and recreate the insert policy to ensure it's clean and properly applied
ALTER TABLE public.affiliate_clicks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_affiliate_clicks" ON public.affiliate_clicks;

CREATE POLICY "anon_insert_affiliate_clicks"
  ON public.affiliate_clicks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
