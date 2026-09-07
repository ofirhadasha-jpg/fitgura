/*
# Add profile fields, affiliate product_title, and auth triggers

1. Overview
   Adapts the requested "complete Fitgura schema" to the existing database
   without losing data. The existing `profiles` table uses `user_id` (not `id`)
   as its primary key and `registered_devices` as a text array (not JSONB), so
   those are preserved. New columns are added to fill the gaps.

2. Columns added to `profiles`
   - `email` (text) — populated automatically on signup
   - `avatar_url` (text) — populated automatically from auth metadata on signup
   - `preferred_currency` (text, default 'ILS')
   - `user_sizes` (jsonb) — consolidated size object with shirt, pants, shoes, and body measurements
   - `created_at` (timestamptz, default now())

3. Columns added to `affiliate_clicks`
   - `product_title` (text) — optional product name for click logging

4. Triggers
   - `on_auth_user_created` — fires AFTER INSERT on auth.users, calls handle_new_user()
     to auto-create a profiles row with email, avatar_url, and default user_sizes.
   - `set_profiles_updated_at` — fires BEFORE UPDATE on profiles, sets updated_at = now().

5. Functions
   - `handle_new_user()` — SECURITY DEFINER, inserts/updates a profile row keyed by
     user_id (the existing PK) on signup. Uses ON CONFLICT (user_id) so re-runs are safe.
   - `set_updated_at()` — sets NEW.updated_at = now() before any profile update.

6. Security
   - Existing RLS policies on profiles (select/insert/update/delete own) are kept.
   - Existing anon-insert policy on affiliate_clicks is kept.
   - No policies are dropped or weakened.

7. Notes
   - `registered_devices` stays as a text array (existing apps depend on it).
   - Individual size columns (chest_cm, waist_cm, etc.) are kept alongside the
     new `user_sizes` JSONB — the app continues to read/write the individual
     columns; `user_sizes` is a consolidated snapshot for future use.
   - The affiliate_clicks FK continues to reference auth.users(id), not profiles,
     to avoid breaking existing data.
*/

-- 1. Add missing columns to profiles (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email') THEN
    ALTER TABLE public.profiles ADD COLUMN email text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url') THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferred_currency') THEN
    ALTER TABLE public.profiles ADD COLUMN preferred_currency text DEFAULT 'ILS';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_sizes') THEN
    ALTER TABLE public.profiles ADD COLUMN user_sizes jsonb DEFAULT '{
      "shirt": "M",
      "pants": "40",
      "shoes": "42",
      "chest_cm": null,
      "waist_cm": null,
      "hips_cm": null,
      "foot_length_cm": null,
      "height_cm": null,
      "weight_kg": null
    }'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_at') THEN
    ALTER TABLE public.profiles ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2. Add product_title to affiliate_clicks (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'affiliate_clicks' AND column_name = 'product_title') THEN
    ALTER TABLE public.affiliate_clicks ADD COLUMN product_title text;
  END IF;
END $$;

-- 3. handle_new_user trigger function — auto-creates profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    avatar_url,
    user_sizes
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture',
      ''
    ),
    '{
      "shirt": "M",
      "pants": "40",
      "shoes": "42",
      "chest_cm": null,
      "waist_cm": null,
      "hips_cm": null,
      "foot_length_cm": null,
      "height_cm": null,
      "weight_kg": null
    }'::jsonb
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. set_updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create triggers (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
