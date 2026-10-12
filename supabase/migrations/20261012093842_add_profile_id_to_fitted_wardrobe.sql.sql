/*
# Add profile_id column to fitted_wardrobe table

1. Changes
- Added `profile_id` (text, nullable) column to `fitted_wardrobe`.
- This column stores the family member ID when a product is saved to a
  specific family member's wardrobe. NULL means the item belongs to the
  primary user ("self" / "אני").
- No RLS policy changes needed — the table already has CRUD policies
  scoped to `anon, authenticated` (single-tenant pattern with optional
  user_id for logged-in users).

2. Notes
- The column is nullable so existing rows are unaffected.
- The frontend sends `profile_id: null` when saving to "self" and the
  family member's UUID when saving to a specific profile.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitted_wardrobe'
    AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE fitted_wardrobe ADD COLUMN profile_id text;
  END IF;
END $$;
