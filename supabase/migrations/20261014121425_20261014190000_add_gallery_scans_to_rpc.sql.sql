/*
# Add gallery_scans support to update_profile_metrics_via_token

## Purpose
The join-family onboarding screen now lets recipients select multiple photos
from their gallery for continuous sizing updates. The scan history (gallery_scans)
needs to be saved to the family_profiles row alongside the metrics.

## Changes
1. Replaces update_profile_metrics_via_token to also accept and persist
   `gallery_scans` (jsonb array of ScanEntry objects) from the metrics payload.
2. All other behavior unchanged — token-gated, single-use, SECURITY DEFINER.

## Security
- The function remains SECURITY DEFINER, token-gated, single-use.
- Only metric + profile columns (including gallery_scans) are updated.
*/

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
    gallery_scans = COALESCE((p_metrics->'gallery_scans')::jsonb, gallery_scans),
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
