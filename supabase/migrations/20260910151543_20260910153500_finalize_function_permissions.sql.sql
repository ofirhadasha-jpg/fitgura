/*
# Finalize function permissions

1. Security
- Remove implicit PUBLIC execution from the analytics summary and signup trigger functions.
- Allow only signed-in users to call the analytics summary function.
- Keep the signup trigger callable by the database trigger, not by API callers.
- Pin the profile timestamp trigger search path.
2. Data safety
- No tables, columns, or rows are changed.
*/

REVOKE EXECUTE ON FUNCTION public.get_affiliate_summary_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_affiliate_summary_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;

ALTER FUNCTION public.set_updated_at() SET search_path = public;