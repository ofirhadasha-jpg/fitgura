/*
# Add device and shoe size fields

1. Modified Tables
- `profiles`: add `registered_device` and `shoe_size` text fields.
2. Security
- Existing owner-scoped RLS policies remain in effect.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registered_device text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shoe_size text;