/*
# Add preferred region

1. Modified Tables
- `profiles`: add `preferred_region` text with default `EU` for the user's sizing standard.
2. Security
- Existing owner-scoped RLS policies remain in effect.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferred_region'
  ) THEN
    ALTER TABLE profiles ADD COLUMN preferred_region text DEFAULT 'EU';
  END IF;
END $$;