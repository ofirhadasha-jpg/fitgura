/*
# Add complete family profile details

1. New columns on `family_profiles`
- `date_of_birth` stores an optional birthday for future birthday events and reminders.
- `avatar_url` stores the private storage path for the member's profile photo.
- `scan_preview` stores the captured scan preview used to identify the member's measurements.
- `gallery_scans` stores the member's scan history as JSON data.

2. Existing data
- Existing family profiles are preserved.
- New columns are nullable or have safe empty defaults, so current profiles continue to work.

3. Security
- Existing owner and granted-profile row policies remain in place.
- The new fields follow the same row-level access rules as the family profile they belong to.
- No public storage access is added; photos remain in the existing private profile-photos bucket.

4. Important notes
- The browser will upload photos into the signed-in user's folder and use short-lived signed URLs for display.
- Measurements remain in the existing family profile measurement columns.
*/

ALTER TABLE public.family_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS scan_preview text,
  ADD COLUMN IF NOT EXISTS gallery_scans jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS family_profiles_owner_dob_idx
  ON public.family_profiles (owner_user_id, date_of_birth);