/*
# Add registered_devices array column to profiles

## Summary
Upgrades the profiles table from a single `registered_device` text column
to a multi-device model using a `registered_devices` text array column.

## Changes
1. New column: `registered_devices` (text[], default NULL) on `profiles`.
2. Data migration: any existing row with a non-null `registered_device`
   string gets `registered_devices = ARRAY[registered_device]` so old data
   is preserved as a single-element array.
3. The old `registered_device` column is kept (not dropped) for backwards
   compatibility — the app reads `registered_devices` first and falls back
   to wrapping `registered_device` when the array is empty/NULL.

## Security
- No RLS policy changes. Existing owner-scoped policies on `profiles`
  already allow each authenticated user to read/write their own row,
  which includes the new array column automatically.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS registered_devices text[] DEFAULT NULL;

-- Backfill: wrap legacy single-device string into a single-element array
UPDATE profiles
  SET registered_devices = ARRAY[registered_device]
  WHERE registered_device IS NOT NULL
    AND registered_devices IS NULL;
