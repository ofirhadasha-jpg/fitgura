/*
# Fix get_family_profile_by_token to allow read-only verification of used tokens

## Purpose
When a family invite link is opened via WhatsApp/messaging apps, the link preview
or GET request should NOT invalidate the token. Previously, the RPC returned an
error for tokens that were already `used = true`, which meant:
1. WhatsApp link previews could trigger the share accept flow, consuming the token
2. Re-opening a used link showed "Invalid or already used invite token" even for
   users who already had access

## Changes
1. Replaces `get_family_profile_by_token` with a version that returns profile
   data regardless of `used` status — as long as the token exists and is active.
   The `used` flag is now included in the response so the frontend can decide
   what UI to show (e.g., "already accepted" vs "confirm join").
2. Grant EXECUTE to anon + authenticated (invite links are public).
*/

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
  -- Look up the invite by token — allow used tokens so read-only verification works
  SELECT * INTO v_invite FROM profile_invites
  WHERE token = p_token AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or already used invite token');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
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
    'age_group', v_profile.age_group,
    'avatar_url', v_profile.avatar_url,
    'date_of_birth', v_profile.date_of_birth,
    'top_size', v_profile.top_size,
    'bottom_size', v_profile.bottom_size,
    'shoe_size', v_profile.shoe_size,
    'fit', v_profile.fit,
    'height_cm', v_profile.height_cm,
    'weight_kg', v_profile.weight_kg,
    'chest_cm', v_profile.chest_cm,
    'waist_cm', v_profile.waist_cm,
    'hips_cm', v_profile.hips_cm,
    'shoulder_cm', v_profile.shoulder_cm,
    'accuracy', v_profile.accuracy,
    'scan_preview', v_profile.scan_preview,
    'token_used', v_invite.used
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_family_profile_by_token TO anon, authenticated;
