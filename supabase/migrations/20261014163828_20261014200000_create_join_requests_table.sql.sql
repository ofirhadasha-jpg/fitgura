/*
# Create join_requests table for family join approval workflow

1. New Tables
- `join_requests`
  - `id` (uuid, primary key)
  - `parent_user_id` (uuid, not null) — the user who generated the invite token; only they can approve/reject
  - `profile_id` (uuid, not null) — the family profile the invite was for
  - `token` (text, not null) — the invite token that links this request to the original invite
  - `guest_name` (text, not null) — name entered by the guest
  - `guest_email` (text) — email entered by the guest (optional)
  - `status` (text, not null, default 'pending') — one of 'pending', 'approved', 'rejected'
  - `created_at` (timestamptz, default now())
  - `responded_at` (timestamptz, nullable) — when the inviter approved/rejected

2. Security
- Enable RLS on `join_requests`.
- INSERT: anyone (anon + authenticated) can create a join request if they have a valid token.
  The edge function (service role) handles the actual insert, so anon access is not needed
  from the client — but we allow it for fallback direct-insert paths.
- SELECT: only the parent_user_id (the inviter) can view requests for their invites.
- UPDATE: only the parent_user_id can approve/reject requests.
- DELETE: only the parent_user_id can delete requests.
- Index on `parent_user_id` and `token` for fast lookups.
*/

CREATE TABLE IF NOT EXISTS join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  token text NOT NULL,
  guest_name text NOT NULL,
  guest_email text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_join_requests_parent_user_id ON join_requests(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_token ON join_requests(token);
CREATE INDEX IF NOT EXISTS idx_join_requests_status ON join_requests(status);

DROP POLICY IF EXISTS "join_requests_select_own" ON join_requests;
CREATE POLICY "join_requests_select_own"
ON join_requests FOR SELECT
TO authenticated
USING (auth.uid() = parent_user_id);

DROP POLICY IF EXISTS "join_requests_update_own" ON join_requests;
CREATE POLICY "join_requests_update_own"
ON join_requests FOR UPDATE
TO authenticated
USING (auth.uid() = parent_user_id)
WITH CHECK (auth.uid() = parent_user_id);

DROP POLICY IF EXISTS "join_requests_delete_own" ON join_requests;
CREATE POLICY "join_requests_delete_own"
ON join_requests FOR DELETE
TO authenticated
USING (auth.uid() = parent_user_id);

-- INSERT is done via the edge function using the service role key (bypasses RLS).
-- No client-side INSERT policy needed.
