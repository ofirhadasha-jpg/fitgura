/*
# Create profile-photos storage bucket

1. Purpose
   - A private Supabase Storage bucket for user body-scan / profile photos uploaded during onboarding and managed from the Profile screen.
   - Each user stores their photo at path `user_id/avatar.jpg`.
   - The `avatar_url` column on the `profiles` table stores the public URL of the uploaded photo.

2. Storage Bucket
   - `profile-photos` — private bucket (not public). Access is controlled by Storage RLS policies so only the owning user can read/write their own file.

3. Security (Storage RLS)
   - SELECT: users can read their own files (path starts with their user_id).
   - INSERT: users can upload files only under their own user_id prefix.
   - UPDATE: users can update only their own files.
   - DELETE: users can delete only their own files.
   - All policies scoped to `authenticated` role using `auth.uid()`.

4. Notes
   - The bucket is created with `public = false` so URLs are not world-accessible.
   - File paths follow the convention `<user_id>/avatar.jpg` so ownership checks are simple string-prefix comparisons.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', false)
ON CONFLICT (id) DO NOTHING;

-- SELECT: users can read their own profile photo
DROP POLICY IF EXISTS "read_own_profile_photo" ON storage.objects;
CREATE POLICY "read_own_profile_photo"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- INSERT: users can upload their own profile photo
DROP POLICY IF EXISTS "insert_own_profile_photo" ON storage.objects;
CREATE POLICY "insert_own_profile_photo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- UPDATE: users can replace their own profile photo
DROP POLICY IF EXISTS "update_own_profile_photo" ON storage.objects;
CREATE POLICY "update_own_profile_photo"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- DELETE: users can delete their own profile photo
DROP POLICY IF EXISTS "delete_own_profile_photo" ON storage.objects;
CREATE POLICY "delete_own_profile_photo"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
