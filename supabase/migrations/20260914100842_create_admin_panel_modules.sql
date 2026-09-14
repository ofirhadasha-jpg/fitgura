/*
# Admin Panel Modules — Full System

## New Tables

1. `user_sessions` — tracks each app open with duration
   - id (uuid pk)
   - user_id (uuid, nullable for guests)
   - session_start (timestamptz)
   - session_end (timestamptz, nullable)
   - duration_seconds (int, nullable)
   - device_info (text, user agent)
   - created_at (timestamptz default now())

2. `search_history` — tracks device/product searches per user
   - id (uuid pk)
   - user_id (uuid, nullable for guests)
   - search_type (text: 'device' | 'product' | 'body_scan')
   - search_query (text)
   - results_count (int default 0)
   - created_at (timestamptz default now())

3. `user_events` — events created by users (birthdays, anniversaries)
   - id (uuid pk)
   - user_id (uuid not null default auth.uid())
   - event_name (text)
   - event_date (date)
   - event_type (text: 'birthday' | 'anniversary' | 'holiday' | 'custom')
   - emoji (text default '🎉')
   - reminder_days (int default 7)
   - created_at (timestamptz default now())

4. `notifications` — admin broadcast + user-targeted notifications
   - id (uuid pk)
   - user_id (uuid, nullable = broadcast to all)
   - title (text)
   - body (text)
   - type (text: 'info' | 'promo' | 'update' | 'alert')
   - is_read (boolean default false)
   - created_at (timestamptz default now())

## Modified Tables

- `profiles`: add `last_seen_at` (timestamptz), `is_active` (boolean default true),
  `final_top_size` (text), `final_bottom_size` (text), `final_shoe_size` (text)

## Security

- All new tables have RLS enabled
- user_sessions: anon+authenticated insert, authenticated select own, authenticated update own
- search_history: anon+authenticated insert, authenticated select own
- user_events: authenticated CRUD own
- notifications: authenticated select own + broadcast, authenticated update own (mark read)
- profiles: add UPDATE policy for last_seen_at (already has update_own_profile)
*/

-- 1. user_sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_start timestamptz NOT NULL DEFAULT now(),
  session_end timestamptz,
  duration_seconds int,
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_sessions" ON public.user_sessions;
CREATE POLICY "anon_insert_sessions" ON public.user_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "select_own_sessions" ON public.user_sessions;
CREATE POLICY "select_own_sessions" ON public.user_sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sessions" ON public.user_sessions;
CREATE POLICY "update_own_sessions" ON public.user_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. search_history
CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  search_type text NOT NULL DEFAULT 'product',
  search_query text NOT NULL,
  results_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_search" ON public.search_history;
CREATE POLICY "anon_insert_search" ON public.search_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "select_own_search" ON public.search_history;
CREATE POLICY "select_own_search" ON public.search_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- 3. user_events
CREATE TABLE IF NOT EXISTS public.user_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_date date NOT NULL,
  event_type text NOT NULL DEFAULT 'custom',
  emoji text NOT NULL DEFAULT '🎉',
  reminder_days int NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_events" ON public.user_events;
CREATE POLICY "select_own_events" ON public.user_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_events" ON public.user_events;
CREATE POLICY "insert_own_events" ON public.user_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_events" ON public.user_events;
CREATE POLICY "update_own_events" ON public.user_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_events" ON public.user_events;
CREATE POLICY "delete_own_events" ON public.user_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 4. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON public.notifications;
CREATE POLICY "select_own_notifications" ON public.notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "update_own_notifications" ON public.notifications;
CREATE POLICY "update_own_notifications" ON public.notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR user_id IS NULL) WITH CHECK (true);

-- 5. Add columns to profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_seen_at') THEN
    ALTER TABLE public.profiles ADD COLUMN last_seen_at timestamptz DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_active') THEN
    ALTER TABLE public.profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'final_top_size') THEN
    ALTER TABLE public.profiles ADD COLUMN final_top_size text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'final_bottom_size') THEN
    ALTER TABLE public.profiles ADD COLUMN final_bottom_size text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'final_shoe_size') THEN
    ALTER TABLE public.profiles ADD COLUMN final_shoe_size text;
  END IF;
END $$;

-- 6. Admin RPC functions
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
    p.user_id,
    p.email,
    p.gender,
    p.top_size,
    p.bottom_size,
    p.shoe_size,
    p.fit,
    p.preferred_region,
    p.final_top_size,
    p.final_bottom_size,
    p.final_shoe_size,
    p.is_active,
    p.created_at,
    p.updated_at,
    p.last_seen_at,
    (SELECT count(*) FROM user_sessions s WHERE s.user_id = p.user_id) AS session_count,
    (SELECT count(*) FROM affiliate_clicks c WHERE c.user_id = p.user_id) AS total_clicks,
    (SELECT count(*) FROM favorites f WHERE f.user_id = p.user_id) AS total_favorites,
    (SELECT count(*) FROM search_history sh WHERE sh.user_id = p.user_id) AS total_searches,
    (SELECT count(*) FROM user_events ue WHERE ue.user_id = p.user_id) AS total_events
  FROM profiles p
  WHERE p.user_id = target_user_id;
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
  WHERE user_id = target_user_id
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
  WHERE user_id = target_user_id
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
  WHERE user_id = target_user_id
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
  UNION ALL
  SELECT 'session'::text, s.id, s.user_id, p.email,
    COALESCE('Session ' || s.duration_seconds || 's', 'Session started'), s.session_start
  FROM user_sessions s LEFT JOIN profiles p ON p.user_id = s.user_id
  WHERE s.session_start IS NOT NULL
  UNION ALL
  SELECT 'search'::text, sh.id, sh.user_id, p.email,
    sh.search_type || ': ' || sh.search_query, sh.created_at
  FROM search_history sh LEFT JOIN profiles p ON p.user_id = sh.user_id
  UNION ALL
  SELECT 'signup'::text, p.user_id, p.user_id, p.email,
    'New user registered', p.created_at
  FROM profiles p
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
  VALUES (NULL, p_title, p_body, COALESCE(p_type, 'info'));
$$;

CREATE OR REPLACE FUNCTION public.admin_send_to_user(p_user_id uuid, p_title text, p_body text, p_type text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO notifications (user_id, title, body, type)
  VALUES (p_user_id, p_title, p_body, COALESCE(p_type, 'info'));
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_status(p_user_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles SET is_active = p_is_active WHERE user_id = p_user_id;
$$;

-- Grant execute on all admin functions
GRANT EXECUTE ON FUNCTION public.get_admin_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_sessions(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_searches(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_all_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_recent_activity(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_broadcast(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_to_user(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_status(uuid, boolean) TO authenticated;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON public.search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_user ON public.user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at);