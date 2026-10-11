/*
# Add sizing accuracy progress fields

## Purpose
Store the user's current measurement accuracy and the combined scan gallery
so the guided sizing upgrade remains available after reloads and across devices.

## Modified table
- `profiles.sizing_accuracy` (integer, nullable) — current accuracy percentage from 0 to 100.
- `profiles.gallery_scans` (jsonb, nullable) — scan gallery entries used for combined sizing.

## Security
- The existing owner-scoped profiles policies remain responsible for access.
- No new table or policy is created.

## Notes
1. Existing profile rows are preserved and receive null values until the user
   completes or updates the guided sizing flow.
2. The application writes only the authenticated user's own profile row.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sizing_accuracy integer;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gallery_scans jsonb;