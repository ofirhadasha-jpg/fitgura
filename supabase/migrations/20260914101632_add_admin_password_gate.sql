-- Admin password gate: stores a hashed password and provides a verify function

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id int PRIMARY KEY DEFAULT 1,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_single_row CHECK (id = 1)
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Default password: "fitgura2026"
INSERT INTO public.admin_settings (id, password_hash)
VALUES (1, extensions.crypt('fitgura2026', extensions.gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;

-- Verify function: returns true if password matches
CREATE OR REPLACE FUNCTION public.verify_admin_password(p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT (password_hash = crypt(p_password, password_hash))
  FROM admin_settings
  WHERE id = 1;
$$;

-- Set/update password function
CREATE OR REPLACE FUNCTION public.admin_set_password(p_new_password text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE admin_settings
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_admin_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_password(text) TO authenticated;