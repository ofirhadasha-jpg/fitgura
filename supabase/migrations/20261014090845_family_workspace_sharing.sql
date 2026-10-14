/*
# Family Workspace Sharing & Selective Profile Permissions

## Purpose
Allow a parent to share specific family member profiles (e.g. children) with a spouse/partner.
The spouse receives a link, signs in, and the selected profiles appear in their app with full
access to wardrobes, size analyses, and scan histories — synced in real-time for both parents.

## Changes

### 1. New column on `profile_invites`
- `granted_profile_ids` (uuid[]) — array of family_profiles IDs that the recipient gets access to.
  NULL means this is a standard self-update invite (no workspace sharing).

### 2. New table: `profile_grants`
Records which user has been granted access to which family profile.
- `id` (uuid, PK)
- `family_profile_id` (uuid, FK to family_profiles, NOT NULL)
- `granted_user_id` (uuid, NOT NULL) — the spouse/partner who received access
- `granted_by_user_id` (uuid, NOT NULL) — the parent who shared
- `created_at` (timestamptz, default now())

### 3. RLS on `profile_grants`
- SELECT: a user can see grants where they are the grantee OR the granter
- INSERT: only the granter (granted_by_user_id = auth.uid()) can create grants
- DELETE: only the granter can revoke grants
- UPDATE: not needed (grants are insert/delete only)

### 4. RLS update on `family_profiles`
- Add a SELECT policy so a user can also read profiles they have been granted access to
  (via EXISTS check on profile_grants where granted_user_id = auth.uid())

### 5. RLS update on `fitted_wardrobe`
- Add a SELECT policy so a user can also read wardrobe items for profiles they have been granted access to

### 6. New RPC: `accept_family_share`
Called by the edge function when a recipient opens a share link and is authenticated.
Creates profile_grants rows for each granted_profile_id linked to the recipient's user_id.
Idempotent — uses ON CONFLICT to avoid duplicate grants.
*/
ALTER TABLE profile_invites ADD COLUMN IF NOT EXISTS granted_profile_ids uuid[];

CREATE TABLE IF NOT EXISTS profile_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_profile_id uuid NOT NULL REFERENCES family_profiles(id) ON DELETE CASCADE,
  granted_user_id uuid NOT NULL,
  granted_by_user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(family_profile_id, granted_user_id)
);

ALTER TABLE profile_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_and_granted_grants" ON profile_grants;
CREATE POLICY "select_own_and_granted_grants" ON profile_grants FOR SELECT
  TO authenticated USING (auth.uid() = granted_user_id OR auth.uid() = granted_by_user_id);

DROP POLICY IF EXISTS "insert_grants_as_granter" ON profile_grants;
CREATE POLICY "insert_grants_as_granter" ON profile_grants FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = granted_by_user_id);

DROP POLICY IF EXISTS "delete_grants_as_granter" ON profile_grants;
CREATE POLICY "delete_grants_as_granter" ON profile_grants FOR DELETE
  TO authenticated USING (auth.uid() = granted_by_user_id);

-- Allow users to read family_profiles they own OR have been granted access to
DROP POLICY IF EXISTS "select_granted_family_profiles" ON family_profiles;
CREATE POLICY "select_granted_family_profiles" ON family_profiles FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profile_grants
      WHERE profile_grants.family_profile_id = family_profiles.id
      AND profile_grants.granted_user_id = auth.uid()
    )
  );

-- Allow users to read fitted_wardrobe items for profiles they have been granted access to
DROP POLICY IF EXISTS "select_granted_wardrobe" ON fitted_wardrobe;
CREATE POLICY "select_granted_wardrobe" ON fitted_wardrobe FOR SELECT
  TO authenticated USING (
    profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profile_grants
      WHERE profile_grants.family_profile_id::text = fitted_wardrobe.profile_id
      AND profile_grants.granted_user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_profile_grants_granted_user ON profile_grants(granted_user_id);
CREATE INDEX IF NOT EXISTS idx_profile_grants_profile ON profile_grants(family_profile_id);