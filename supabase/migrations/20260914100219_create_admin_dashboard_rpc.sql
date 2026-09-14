/*
# Admin Dashboard RPC Functions

Creates SECURITY DEFINER functions that let the Admin Dashboard read
all profiles, all affiliate clicks, and an enhanced summary with user counts.

## New Functions

1. `get_admin_user_list()` — returns all profiles with key fields
   (user_id, email, gender, sizes, created_at, updated_at). This bypasses
   RLS so the admin can see every user, not just their own row.

2. `get_admin_recent_clicks(limit_count)` — returns the most recent
   affiliate clicks with user email joined from profiles. Default limit 50.

3. `get_admin_enhanced_summary()` — returns total_clicks, clicks_today,
   clicks_this_month, unique_active_clickers, total_users, new_users_today,
   total_favorites.

## Security

- All functions are SECURITY DEFINER with a fixed search_path.
- All functions are EXECUTE to authenticated only.
- These are read-only — no INSERT/UPDATE/DELETE capabilities.
*/

-- 1. Admin user list
CREATE OR REPLACE FUNCTION public.get_admin_user_list()
RETURNS TABLE (
  user_id uuid,
  email text,
  gender text,
  top_size text,
  bottom_size text,
  shoe_size text,
  fit text,
  preferred_region text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.email,
    p.gender,
    p.top_size,
    p.bottom_size,
    p.shoe_size,
    p.fit,
    p.preferred_region,
    p.created_at,
    p.updated_at
  FROM profiles p
  ORDER BY p.created_at DESC;
$$;

-- 2. Admin recent clicks with user email
CREATE OR REPLACE FUNCTION public.get_admin_recent_clicks(limit_count int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email text,
  product_id text,
  product_title text,
  promotion_link text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.user_id,
    p.email,
    c.product_id,
    c.product_title,
    c.promotion_link,
    c.created_at
  FROM affiliate_clicks c
  LEFT JOIN profiles p ON p.user_id = c.user_id
  ORDER BY c.created_at DESC
  LIMIT COALESCE(limit_count, 50);
$$;

-- 3. Admin enhanced summary
CREATE OR REPLACE FUNCTION public.get_admin_enhanced_summary()
RETURNS TABLE (
  total_clicks bigint,
  clicks_today bigint,
  clicks_this_month bigint,
  unique_active_clickers bigint,
  total_users bigint,
  new_users_today bigint,
  total_favorites bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM affiliate_clicks) AS total_clicks,
    (SELECT count(*) FROM affiliate_clicks WHERE created_at >= date_trunc('day', now())) AS clicks_today,
    (SELECT count(*) FROM affiliate_clicks WHERE created_at >= date_trunc('month', now())) AS clicks_this_month,
    (SELECT count(DISTINCT user_id) FROM affiliate_clicks WHERE user_id IS NOT NULL) AS unique_active_clickers,
    (SELECT count(*) FROM profiles) AS total_users,
    (SELECT count(*) FROM profiles WHERE created_at >= date_trunc('day', now())) AS new_users_today,
    (SELECT count(*) FROM favorites) AS total_favorites;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_admin_user_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_recent_clicks(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_enhanced_summary() TO authenticated;