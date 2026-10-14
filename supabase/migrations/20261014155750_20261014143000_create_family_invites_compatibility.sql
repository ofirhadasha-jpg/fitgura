/*
# Create family_invites compatibility table

1. New Tables
- `family_invites`
- `id` (uuid, primary key, generated automatically)
- `parent_user_id` (uuid, authenticated owner who created the invite)
- `profile_id` (uuid, family profile associated with the invite)
- `token` (text, unique invite token)
- `status` (text, invite lifecycle status, defaults to `pending`)
- `created_at` (timestamptz, creation time)

2. Security
- Row Level Security is enabled.
- Authenticated users can only view, create, update, or delete invites they own.
- The browser does not need direct access for invite acceptance; the existing server-side invite flow remains responsible for token verification.

3. Important Notes
- This table is additive and does not remove or rename any existing invite data.
- The existing `profile_invites` table remains the source used by the established join and remote-update flow.
- The compatibility row records the same owner, profile, and token so invite creation can be diagnosed and extended safely.
*/

CREATE TABLE IF NOT EXISTS public.family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.family_profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS family_invites_parent_user_id_idx
  ON public.family_invites(parent_user_id);

CREATE INDEX IF NOT EXISTS family_invites_profile_id_idx
  ON public.family_invites(profile_id);

DROP POLICY IF EXISTS "family_invites_select_own" ON public.family_invites;
CREATE POLICY "family_invites_select_own" ON public.family_invites
  FOR SELECT TO authenticated
  USING (auth.uid() = parent_user_id);

DROP POLICY IF EXISTS "family_invites_insert_own" ON public.family_invites;
CREATE POLICY "family_invites_insert_own" ON public.family_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = parent_user_id
    AND EXISTS (
      SELECT 1 FROM public.family_profiles
      WHERE family_profiles.id = family_invites.profile_id
        AND family_profiles.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "family_invites_update_own" ON public.family_invites;
CREATE POLICY "family_invites_update_own" ON public.family_invites
  FOR UPDATE TO authenticated
  USING (auth.uid() = parent_user_id)
  WITH CHECK (auth.uid() = parent_user_id);

DROP POLICY IF EXISTS "family_invites_delete_own" ON public.family_invites;
CREATE POLICY "family_invites_delete_own" ON public.family_invites
  FOR DELETE TO authenticated
  USING (auth.uid() = parent_user_id);
