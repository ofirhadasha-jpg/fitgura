/*
# Add clothing size and fit fields

1. Modified Tables
- `profiles`: add `top_size`, `bottom_size`, and `fit` text fields.
2. Security
- Existing owner-scoped RLS policies remain in effect.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS top_size text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bottom_size text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fit text;