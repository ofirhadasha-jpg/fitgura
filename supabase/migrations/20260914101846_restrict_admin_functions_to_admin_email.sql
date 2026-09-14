-- Restrict all admin RPC functions to only work when called by ofirhadasha@gmail.com

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email = 'ofirhadasha@gmail.com'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

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
    COALESCE(SUM(CASE WHEN c.created_at IS NOT NULL THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.created_at >= CURRENT_DATE THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.created_at >= date_trunc('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0),
    COUNT(DISTINCT c.user_id),
    (SELECT count(*) FROM profiles),
    (SELECT count(*) FROM profiles WHERE created_at >= CURRENT_DATE),
    (SELECT count(*) FROM favorites)
  FROM affiliate_clicks c
  WHERE public.is_admin_user();
$$;

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
  final_top_size text,
  final_bottom_size text,
  final_shoe_size text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id, p.email, p.gender, p.top_size, p.bottom_size, p.shoe_size, p.fit,
    p.preferred_region, p.final_top_size, p.final_bottom_size, p.final_shoe_size,
    p.is_active, p.created_at, p.updated_at, p.last_seen_at
  FROM profiles p
  WHERE public.is_admin_user()
  ORDER BY p.created_at DESC;
$$;

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
  SELECT c.id, c.user_id, p.email, c.product_id, c.product_title, c.promotion_link, c.created_at
  FROM affiliate_clicks c
  LEFT JOIN profiles p ON p.user_id = c.user_id
  WHERE public.is_admin_user()
  ORDER BY c.created_at DESC
  LIMIT COALESCE(limit_count, 50);
$$;

CREATE OR REPLACE FUNCTION public.get_admin_user_details(target_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  gender text,
  top_size text,
  bottom_size text,
  shoe_size text,
  fit text,
  preferred_region text,
  final_top_size text,
  final_bottom_size text,
  final_shoe_size text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz,
  session_count bigint,
  total_clicks bigint,
  total_favorites bigint,
  total_searches bigint,
  total_events bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id, p.email, p.gender, p.top_size, p.bottom_size, p.shoe_size, p.fit,
    p.preferred_region, p.final_top_size, p.final_bottom_size, p.final_shoe_size,
    p.is_active, p.created_at, p.updated_at, p.last_seen_at,
    (SELECT count(*) FROM user_sessions s WHERE s.user_id = p.user_id),
    (SELECT count(*) FROM affiliate_clicks c WHERE c.user_id = p.user_id),
    (SELECT count(*) FROM favorites f WHERE f.user_id = p.user_id),
    (SELECT count(*) FROM search_history sh WHERE sh.user_id = p.user_id),
    (SELECT count(*) FROM user_events ue WHERE ue.user_id = p.user_id)
  FROM profiles p
  WHERE p.user_id = target_user_id AND public.is_admin_user();
$$;

CREATE OR REPLACE FUNCTION public.get_admin_user_sessions(target_user_id uuid, limit_count int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  session_start timestamptz,
  session_end timestamptz,
  duration_seconds int,
  device_info text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, session_start, session_end, duration_seconds, device_info
  FROM user_sessions
  WHERE user_id = target_user_id AND public.is_admin_user()
  ORDER BY session_start DESC
  LIMIT COALESCE(limit_count, 20);
$$;

CREATE OR REPLACE FUNCTION public.get_admin_user_searches(target_user_id uuid, limit_count int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  search_type text,
  search_query text,
  results_count int,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, search_type, search_query, results_count, created_at
  FROM search_history
  WHERE user_id = target_user_id AND public.is_admin_user()
  ORDER BY created_at DESC
  LIMIT COALESCE(limit_count, 20);
$$;

CREATE OR REPLACE FUNCTION public.get_admin_user_events(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  event_name text,
  event_date date,
  event_type text,
  emoji text,
  reminder_days int,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, event_name, event_date, event_type, emoji, reminder_days, created_at
  FROM user_events
  WHERE user_id = target_user_id AND public.is_admin_user()
  ORDER BY event_date ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_all_events()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email text,
  event_name text,
  event_date date,
  event_type text,
  emoji text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ue.id, ue.user_id, p.email, ue.event_name, ue.event_date, ue.event_type, ue.emoji
  FROM user_events ue
  LEFT JOIN profiles p ON p.user_id = ue.user_id
  WHERE public.is_admin_user()
  ORDER BY ue.event_date DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_recent_activity(limit_count int DEFAULT 30)
RETURNS TABLE (
  activity_type text,
  activity_id uuid,
  user_id uuid,
  user_email text,
  description text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'click'::text, c.id, c.user_id, p.email,
    COALESCE(c.product_title, c.product_id), c.created_at
  FROM affiliate_clicks c LEFT JOIN profiles p ON p.user_id = c.user_id
  WHERE public.is_admin_user()
  UNION ALL
  SELECT 'session'::text, s.id, s.user_id, p.email,
    COALESCE('Session ' || s.duration_seconds || 's', 'Session started'), s.session_start
  FROM user_sessions s LEFT JOIN profiles p ON p.user_id = s.user_id
  WHERE s.session_start IS NOT NULL AND public.is_admin_user()
  UNION ALL
  SELECT 'search'::text, sh.id, sh.user_id, p.email,
    sh.search_type || ': ' || sh.search_query, sh.created_at
  FROM search_history sh LEFT JOIN profiles p ON p.user_id = sh.user_id
  WHERE public.is_admin_user()
  UNION ALL
  SELECT 'signup'::text, p.user_id, p.user_id, p.email,
    'New user registered', p.created_at
  FROM profiles p
  WHERE public.is_admin_user()
  ORDER BY created_at DESC
  LIMIT COALESCE(limit_count, 30);
$$;

CREATE OR REPLACE FUNCTION public.admin_send_broadcast(p_title text, p_body text, p_type text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO notifications (user_id, title, body, type)
  SELECT NULL, p_title, p_body, COALESCE(p_type, 'info')
  WHERE public.is_admin_user();
$$;

CREATE OR REPLACE FUNCTION public.admin_send_to_user(p_user_id uuid, p_title text, p_body text, p_type text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO notifications (user_id, title, body, type)
  SELECT p_user_id, p_title, p_body, COALESCE(p_type, 'info')
  WHERE public.is_admin_user();
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_status(p_user_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles SET is_active = p_is_active
  WHERE user_id = p_user_id AND public.is_admin_user();
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_password(p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND email = 'ofirhadasha@gmail.com'
    )
    AND password_hash = crypt(p_password, password_hash)
  )
  FROM admin_settings
  WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_password(p_new_password text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE admin_settings
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = 1
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND email = 'ofirhadasha@gmail.com'
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_enhanced_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_recent_clicks(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_sessions(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_searches(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_all_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_recent_activity(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_broadcast(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_to_user(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_password(text) TO authenticated;