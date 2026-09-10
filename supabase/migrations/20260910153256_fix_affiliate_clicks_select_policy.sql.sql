-- Allow authenticated users to read all affiliate_clicks rows for analytics.
-- The existing policy only allowed reading rows where user_id = auth.uid(),
-- but most clicks have user_id = null (users not logged in), so the
-- analytics views (security_invoker = true) returned zero rows.
DROP POLICY IF EXISTS "select_own_affiliate_clicks" ON public.affiliate_clicks;

CREATE POLICY "select_all_affiliate_clicks" ON public.affiliate_clicks
  FOR SELECT TO authenticated USING (true);
