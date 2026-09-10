/*
# Add registered devices array

1. Modified Tables
- `profiles`: add `registered_devices` text array.
- Existing `registered_device` values are preserved by backfilling the new array.
2. Security
- Existing owner-scoped RLS policies remain in effect.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registered_devices text[] DEFAULT NULL;

UPDATE profiles
SET registered_devices = ARRAY[registered_device]
WHERE registered_device IS NOT NULL
  AND registered_devices IS NULL;