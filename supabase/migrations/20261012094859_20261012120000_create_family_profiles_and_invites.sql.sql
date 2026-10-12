/*
# Create family_profiles and profile_invites tables

## Purpose
Enables privacy-first family member profile invites: a primary user can generate
a secure invite link for a family member (spouse, child, baby). The family member
opens the link on their own device, scans their photo locally, and only their
body metrics (sizes, height, weight, accuracy) are synced back — never photos.

## New Tables

### 1. family_profiles
Stores family member body metrics owned by the primary user.
- id (uuid, PK)
- owner_user_id (uuid, FK to auth.users) — the primary account holder
- member_name (text) — display name
- category (text) — 'partner' | 'child' | 'baby'
- gender (text) — 'male' | 'female' | 'unisex'
- age_group (text) — 'baby' | 'toddler' | 'child' | 'teen' | 'adult'
- top_size, bottom_size, shoe_size, fit (text) — clothing sizes
- height_cm, weight_kg, chest_cm, waist_cm, hips_cm, shoulder_cm (numeric) — body metrics
- accuracy (int) — profile accuracy score 0-100
- created_at, updated_at (timestamptz)

### 2. profile_invites
Stores secure invite tokens for remote profile updates.
- id (uuid, PK)
- family_profile_id (uuid, FK to family_profiles)
- token (text, unique) — random secure token for the invite URL
- created_at, expires_at (timestamptz)
- used_at (timestamptz, nullable)
- is_active (boolean, default true)

## Security
- RLS enabled on both tables.
- family_profiles: owner-scoped CRUD.
- profile_invites: owner-scoped via family_profiles join.
- SECURITY DEFINER function update_family_profile_remote allows anon with valid token to UPDATE metrics only.
- SECURITY DEFINER function get_family_profile_by_token allows anon to look up profile name by token.
*/

CREATE TABLE IF NOT EXISTS family_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  category text NOT NULL DEFAULT 'partner',
  gender text DEFAULT 'unisex',
  age_group text DEFAULT 'adult',
  top_size text,
  bottom_size text,
  shoe_size text,
  fit text,
  height_cm numeric,
  weight_kg numeric,
  chest_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  shoulder_cm numeric,
  accuracy integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE family_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_family_profiles" ON family_profiles;
CREATE POLICY "select_own_family_profiles" ON family_profiles FOR SELECT
  TO authenticated USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "insert_own_family_profiles" ON family_profiles;
CREATE POLICY "insert_own_family_profiles" ON family_profiles
  TO authenticated WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "update_own_family_profiles" ON family_profiles;
CREATE POLICY "update_own_family_profiles" ON family_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "delete_own_family_profiles" ON family_profiles;
CREATE POLICY "delete_own_family_profiles" ON family_profiles FOR DELETE
  TO authenticated USING (auth.uid() = owner_user_id);

CREATE TABLE IF NOT EXISTS profile_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_profile_id uuid NOT NULL REFERENCES family_profiles(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  is_active boolean DEFAULT true
);

ALTER TABLE profile_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invites" ON profile_invites;
CREATE POLICY "select_own_invites" ON profile_invites FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_profiles WHERE family_profiles.id = profile_invites.family_profile_id AND family_profiles.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_invites" ON profile_invites;
CREATE POLICY "insert_own_invites" ON profile_invites
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM family_profiles WHERE family_profiles.id = profile_invites.family_profile_id AND family_profiles.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_invites" ON profile_invites;
CREATE POLICY "delete_own_invites" ON profile_invites FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM family_profiles WHERE family_profiles.id = profile_invites.family_profile_id AND family_profiles.owner_user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION update_family_profile_remote(
  p_token text,
  p_top_size text DEFAULT NULL,
  p_bottom_size text DEFAULT NULL,
  p_shoe_size text DEFAULT NULL,
  p_fit text DEFAULT NULL,
  p_height_cm numeric DEFAULT NULL,
  p_weight_kg numeric DEFAULT NULL,
  p_chest_cm numeric DEFAULT NULL,
  p_waist_cm numeric DEFAULT NULL,
  p_hips_cm numeric DEFAULT NULL,
  p_shoulder_cm numeric DEFAULT NULL,
  p_accuracy integer DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_age_group text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_profile family_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM profile_invites WHERE token = p_token AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invite token');
  END IF;
  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite link has expired');
  END IF;
  SELECT * INTO v_profile FROM family_profiles WHERE id = v_invite.family_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  UPDATE family_profiles
  SET
    top_size = COALESCE(p_top_size, top_size),
    bottom_size = COALESCE(p_bottom_size, bottom_size),
    shoe_size = COALESCE(p_shoe_size, shoe_size),
    fit = COALESCE(p_fit, fit),
    height_cm = COALESCE(p_height_cm, height_cm),
    weight_kg = COALESCE(p_weight_kg, weight_kg),
    chest_cm = COALESCE(p_chest_cm, chest_cm),
    waist_cm = COALESCE(p_waist_cm, waist_cm),
    hips_cm = COALESCE(p_hips_cm, hips_cm),
    shoulder_cm = COALESCE(p_shoulder_cm, shoulder_cm),
    accuracy = COALESCE(p_accuracy, accuracy),
    gender = COALESCE(p_gender, gender),
    age_group = COALESCE(p_age_group, age_group),
    updated_at = now()
  WHERE id = v_profile.id;
  UPDATE profile_invites SET used_at = now() WHERE id = v_invite.id;
  RETURN jsonb_build_object('success', true, 'profile_id', v_profile.id, 'member_name', v_profile.member_name);
END;
$$;

GRANT EXECUTE ON FUNCTION update_family_profile_remote TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_family_profile_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_profile family_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM profile_invites WHERE token = p_token AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invite token');
  END IF;
  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite link has expired');
  END IF;
  SELECT * INTO v_profile FROM family_profiles WHERE id = v_invite.family_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'profile_id', v_profile.id,
    'member_name', v_profile.member_name,
    'category', v_profile.category,
    'gender', v_profile.gender,
    'age_group', v_profile.age_group
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_family_profile_by_token TO anon, authenticated;
