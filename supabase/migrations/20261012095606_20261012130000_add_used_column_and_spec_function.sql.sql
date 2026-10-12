/*
# Update profile_invites: add `used` column + new update_profile_metrics_via_token function

## Purpose
Aligns the remote profile update pipeline with the spec:
1. Adds a `used` boolean column to `profile_invites` (default false).
2. Creates `update_profile_metrics_via_token(token_input text, metrics jsonb)` — a SECURITY DEFINER
   function that validates the token (exists, not expired, not used), marks it used, and updates
   ONLY biometric/metric columns on `family_profiles`. No names, ownership, or sensitive data can be touched.
3. Replaces the old `update_family_profile_remote` function (kept for backward compat but superseded).

## Changes
### profile_invites table
- Added `used boolean NOT NULL DEFAULT false`

### New function: update_profile_metrics_via_token
- Parameters: `p_token text`, `p_metrics jsonb`
- Validates token: exists, is_active=true, not expired, used=false
- Extracts ONLY these keys from JSONB: height_cm, weight_kg, chest_cm, waist_cm, hips_cm,
  shoulder_cm, top_size, bottom_size, shoe_size, fit, accuracy, gender, age_group
- Updates family_profiles with COALESCE (NULL keys keep existing values)
- Marks token as used=true
- Returns jsonb with success/error + profile name

### Security
- SECURITY DEFINER, search_path=public
- Callable by anon + authenticated (invitee is not logged in)
- CANNOT modify: member_name, owner_user_id, category, id, created_at
*/

-- Add `used` column to profile_invites
ALTER TABLE profile_invites ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false;

-- Create the spec-compliant function
CREATE OR REPLACE FUNCTION update_profile_metrics_via_token(
  p_token text,
  p_metrics jsonb
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
  -- Validate token
  SELECT * INTO v_invite FROM profile_invites
  WHERE token = p_token AND is_active = true AND used = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or already used invite token');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite link has expired');
  END IF;

  -- Fetch the family profile
  SELECT * INTO v_profile FROM family_profiles WHERE id = v_invite.family_profile_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  -- Update ONLY metric columns from the JSONB payload
  -- NULL keys are handled by COALESCE — existing values are preserved
  UPDATE family_profiles
  SET
    top_size     = COALESCE((p_metrics->>'top_size')::text, top_size),
    bottom_size  = COALESCE((p_metrics->>'bottom_size')::text, bottom_size),
    shoe_size    = COALESCE((p_metrics->>'shoe_size')::text, shoe_size),
    fit          = COALESCE((p_metrics->>'fit')::text, fit),
    height_cm    = COALESCE((p_metrics->>'height_cm')::numeric, height_cm),
    weight_kg    = COALESCE((p_metrics->>'weight_kg')::numeric, weight_kg),
    chest_cm     = COALESCE((p_metrics->>'chest_cm')::numeric, chest_cm),
    waist_cm     = COALESCE((p_metrics->>'waist_cm')::numeric, waist_cm),
    hips_cm      = COALESCE((p_metrics->>'hips_cm')::numeric, hips_cm),
    shoulder_cm  = COALESCE((p_metrics->>'shoulder_cm')::numeric, shoulder_cm),
    accuracy     = COALESCE((p_metrics->>'accuracy')::integer, accuracy),
    gender       = COALESCE((p_metrics->>'gender')::text, gender),
    age_group    = COALESCE((p_metrics->>'age_group')::text, age_group),
    updated_at   = now()
  WHERE id = v_profile.id;

  -- Mark token as used (single-use)
  UPDATE profile_invites SET used = true, used_at = now() WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_id', v_profile.id,
    'member_name', v_profile.member_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_profile_metrics_via_token TO anon, authenticated;
