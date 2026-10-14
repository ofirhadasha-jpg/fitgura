/*
# Update update_profile_metrics_via_token RPC for join-family flow

## Purpose
The family invite onboarding screen now lets recipients upload a photo,
enter a date of birth, and scan their body — all of which need to be saved
to the family_profiles row via the token-authenticated RPC.

## Changes
1. Replaces update_profile_metrics_via_token with a version that also handles:
   - date_of_birth (date, optional)
   - avatar_url (text, optional — storage path)
   - scan_preview (text, optional — base64 preview)
2. Also returns owner_user_id so the edge function can send a notification
   without an extra query.
3. Grants EXECUTE to anon + authenticated (invite links are public).

## Security
- The function remains SECURITY DEFINER, token-gated, single-use.
- Only metric + profile columns are updated — ownership is never changed.
*/

DROP POLICY IF EXISTS "temp_noop" ON family_profiles;

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
  SELECT * INTO v_invite FROM profile_invites
  WHERE token = p_token AND is_active = true AND used = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or already used invite token');
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
    top_size      = COALESCE((p_metrics->>'top_size')::text, top_size),
    bottom_size   = COALESCE((p_metrics->>'bottom_size')::text, bottom_size),
    shoe_size     = COALESCE((p_metrics->>'shoe_size')::text, shoe_size),
    fit           = COALESCE((p_metrics->>'fit')::text, fit),
    height_cm     = COALESCE((p_metrics->>'height_cm')::numeric, height_cm),
    weight_kg     = COALESCE((p_metrics->>'weight_kg')::numeric, weight_kg),
    chest_cm      = COALESCE((p_metrics->>'chest_cm')::numeric, chest_cm),
    waist_cm      = COALESCE((p_metrics->>'waist_cm')::numeric, waist_cm),
    hips_cm       = COALESCE((p_metrics->>'hips_cm')::numeric, hips_cm),
    shoulder_cm   = COALESCE((p_metrics->>'shoulder_cm')::numeric, shoulder_cm),
    accuracy      = COALESCE((p_metrics->>'accuracy')::integer, accuracy),
    gender        = COALESCE((p_metrics->>'gender')::text, gender),
    age_group     = COALESCE((p_metrics->>'age_group')::text, age_group),
    date_of_birth = COALESCE((p_metrics->>'date_of_birth')::date, date_of_birth),
    avatar_url    = COALESCE((p_metrics->>'avatar_url')::text, avatar_url),
    scan_preview  = COALESCE((p_metrics->>'scan_preview')::text, scan_preview),
    updated_at    = now()
  WHERE id = v_profile.id;

  UPDATE profile_invites SET used = true, used_at = now() WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_id', v_profile.id,
    'member_name', v_profile.member_name,
    'owner_user_id', v_profile.owner_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_profile_metrics_via_token TO anon, authenticated;
