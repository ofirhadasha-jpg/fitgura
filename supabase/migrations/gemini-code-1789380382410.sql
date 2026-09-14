-- 1. הרחבת טבלת הפרופילים לנתוני סריקה, מידות סופיות ותחומי עניין
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS scan_photo_url TEXT,
ADD COLUMN IF NOT EXISTS final_sizes JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS primary_interests TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS total_dwell_time_seconds BIGINT DEFAULT 0;

-- 2. טבלת מעקב אחר זמן שהייה וסשנים
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_start TIMESTAMPTZ DEFAULT NOW(),
  session_end TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. טבלת היסטוריית חיפושים ומוצרים לפי מכשירים (Add Device)
CREATE TABLE IF NOT EXISTS device_search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL, -- שם המכשיר (לדוגמה: "הטלפון של אלה")
  search_query TEXT,
  category TEXT,
  product_id TEXT,
  product_title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. טבלת אירועים ותזכורות שקבע המשתמש
CREATE TABLE IF NOT EXISTS user_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  reminder_time TIMESTAMPTZ,
  related_product_id TEXT,
  is_notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. טבלת התראות (Push & In-App Notifications)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL פירושו התראה לכל המשתמשים
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deep_link_url TEXT, -- קישור פנימי למוצר באפליקציה (e.g., /product/123)
  product_id TEXT,
  type TEXT CHECK (type IN ('event_reminder', 'promo', 'system')) DEFAULT 'promo',
  is_read BOOLEAN DEFAULT FALSE,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- הרשאות RLS לכל הטבלאות החדשות
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to user_sessions" ON user_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to device_search_history" ON device_search_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to user_events" ON user_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to notifications" ON notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';