/*
# Harden fitted_wardrobe RLS for strict profile isolation

## Problem
The existing policies on `fitted_wardrobe` use `USING (true)` / `WITH CHECK (true)`,
which allows ANY authenticated user (or anon) to read, insert, update, or delete
ANY row — including wardrobe items belonging to other users. This causes data
leakage when switching profiles or browsing as a guest.

## Changes
1. SELECT: a user can see a row if:
   - They own it (`user_id = auth.uid()`), OR
   - The row has a `profile_id` that was explicitly shared with them via `profile_grants`
2. INSERT: the inserting user must be the owner (`user_id = auth.uid()`)
3. UPDATE: same ownership check as SELECT, with WITH CHECK enforcing ownership
4. DELETE: same ownership check as SELECT

## Tables affected
- `fitted_wardrobe` — policies replaced (no schema changes)

## Security impact
- Guests/anon users can no longer read other users' wardrobe items via the API.
- Only the owner or explicitly-granted family members can access shared profile items.
- The anon role is removed from these policies since the app has authentication.
*/

-- Drop existing permissive policies
DROP POLICY IF EXISTS "select_own_wardrobe" ON fitted_wardrobe;
DROP POLICY IF EXISTS "insert_own_wardrobe" ON fitted_wardrobe;
DROP POLICY IF EXISTS "update_own_wardrobe" ON fitted_wardrobe;
DROP POLICY IF EXISTS "delete_own_wardrobe" ON fitted_wardrobe;
DROP POLICY IF EXISTS "select_granted_wardrobe" ON fitted_wardrobe;

-- SELECT: owner OR explicitly granted family profile
CREATE POLICY "select_own_wardrobe"
ON fitted_wardrobe FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profile_grants
      WHERE profile_grants.family_profile_id::text = fitted_wardrobe.profile_id
      AND profile_grants.granted_user_id = auth.uid()
    )
  )
);

-- INSERT: only the owner can create their own rows
CREATE POLICY "insert_own_wardrobe"
ON fitted_wardrobe FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- UPDATE: only the owner can modify their own rows
CREATE POLICY "update_own_wardrobe"
ON fitted_wardrobe FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE: only the owner can delete their own rows
CREATE POLICY "delete_own_wardrobe"
ON fitted_wardrobe FOR DELETE
TO authenticated
USING (user_id = auth.uid());
