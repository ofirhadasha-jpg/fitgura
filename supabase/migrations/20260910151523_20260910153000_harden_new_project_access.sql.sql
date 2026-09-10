/*
# Harden copied project access controls

1. Security fixes
- `ai_config`: remove browser-role access because it stores backend API credentials.
- Analytics views: run with the querying user's permissions and restrict reads to signed-in users.
- Summary RPC: remove anonymous execution and retain authenticated execution.
- `handle_new_user`: pin its search path to prevent object shadowing through caller-controlled settings.

2. Compatibility
- Edge functions continue reading `ai_config` with the service role.
- Signed-in admin screens retain access to the analytics views and summary function.
- No tables, columns, or user data are removed.
*/

REVOKE ALL PRIVILEGES ON TABLE public.ai_config FROM anon, authenticated;

ALTER VIEW public.daily_affiliate_analytics SET (security_invoker = true);
ALTER VIEW public.top_clicked_products SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.daily_affiliate_analytics FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.top_clicked_products FROM anon, authenticated;
GRANT SELECT ON public.daily_affiliate_analytics TO authenticated;
GRANT SELECT ON public.top_clicked_products TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_affiliate_summary_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_affiliate_summary_stats() TO authenticated;

ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;