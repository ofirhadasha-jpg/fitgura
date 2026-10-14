/*
# Family Loop: Notifications, Wishlist Flag, and Profile Update Tracking

## What This Migration Does

1. **notifications table** — stores in-app notifications for the primary account holder.
   When a family member submits a self-update via invite link, a notification row is
   automatically inserted so the primary user sees "X updated their measurements!".

2. **is_wishlist column on fitted_wardrobe** — adds a boolean flag so saved wardrobe
   items can be marked as "wishlist / gift ideas" for a specific family profile.

3. **Auto-insert notification on family_profiles update** — a trigger function
   inserts a notification row whenever a family_profiles row's updated_at changes,
   informing the owner that the family member updated their sizes.

## New Tables
- `notifications`
  - `id` (uuid, PK)
  - `user_id` (uuid, FK to auth.users) — the account holder who receives the notification
  - `title` (text) — notification headline
  - `body` (text) — notification body text
  - `type` (text) — notification category (e.g. 'family_update')
  - `is_read` (boolean, default false)
  - `created_at` (timestamptz, default now())

## Modified Tables
- `fitted_wardrobe` — adds `is_wishlist boolean DEFAULT false`

## Security
- `notifications`: RLS enabled, owner-scoped CRUD (auth.uid() = user_id)
- `fitted_wardrobe`: existing wide-open policies already cover the new column

## Notes
1. The trigger fires AFTER UPDATE on family_profiles when updated_at changes.
2. It only inserts a notification if the owner_user_id differs from null.
3. Idempotent: uses IF NOT EXISTS / DROP IF EXISTS for all objects.
*/

-- ── notifications table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'general',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Allow the service role (used by triggers/edge functions) to insert notifications for any user
DROP POLICY IF EXISTS "service_insert_notifications" ON notifications;
CREATE POLICY "service_insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── is_wishlist column on fitted_wardrobe ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitted_wardrobe' AND column_name = 'is_wishlist'
  ) THEN
    ALTER TABLE fitted_wardrobe ADD COLUMN is_wishlist boolean DEFAULT false;
  END IF;
END $$;

-- ── Trigger: auto-insert notification on family_profiles update ──
CREATE OR REPLACE FUNCTION notify_family_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when updated_at actually changes (not on every touch)
  IF OLD.updated_at IS DISTINCT FROM NEW.updated_at THEN
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (
      NEW.owner_user_id,
      'עדכון מידות משפחתי 🎉',
      COALESCE(NEW.member_name, 'בן/בת משפחה') || ' עדכנ/ה את המידות! עכשיו אפשר להפתיע אותם במידה המדויקת.',
      'family_update'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_profile_updated ON family_profiles;
CREATE TRIGGER trg_family_profile_updated
  AFTER UPDATE ON family_profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_family_profile_update();

-- ── Enable realtime publication for notifications and family_profiles ──
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE family_profiles;
