/*
# Add preferred_region column to profiles

1. Modified Tables
- `profiles`
  - Add `preferred_region` text column with default 'EU' to store the user's preferred sizing standard.
  - Values: 'EU' (EU/Israel), 'US', or 'UK'.
2. Security
- No changes to existing RLS policies. The column is user-editable and covered by existing owner-scoped policies.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'preferred_region'
  ) THEN
    ALTER TABLE profiles ADD COLUMN preferred_region text DEFAULT 'EU';
  END IF;
END $$;
