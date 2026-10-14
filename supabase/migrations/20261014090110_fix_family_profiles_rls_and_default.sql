/*
# Fix Family Profiles RLS Policies and owner_user_id Default

## Problem
Family profiles created while logged in disappear after sign-out/sign-in because:
1. `owner_user_id` column has NO default — inserts that omit it fail silently
2. The INSERT policy was created with `FOR ALL` instead of `FOR INSERT`, which is incorrect
3. The frontend never inserted into Supabase at all (local state only) — this migration fixes the DB side; frontend fix is separate

## Changes
1. Add `DEFAULT auth.uid()` to `owner_user_id` column so inserts that omit it still get the authenticated user's ID
2. Drop and recreate the INSERT policy as `FOR INSERT` (not `FOR ALL`)
3. Keep SELECT, UPDATE, DELETE policies unchanged (they were correct)

## Security
- RLS stays enabled
- All policies scoped to `TO authenticated` with `auth.uid() = owner_user_id` ownership checks
*/

-- Add DEFAULT auth.uid() to owner_user_id so inserts without explicit user_id still work
ALTER TABLE family_profiles ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

-- Fix the INSERT policy: was FOR ALL, should be FOR INSERT
DROP POLICY IF EXISTS "insert_own_family_profiles" ON family_profiles;
CREATE POLICY "insert_own_family_profiles" ON family_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_user_id);