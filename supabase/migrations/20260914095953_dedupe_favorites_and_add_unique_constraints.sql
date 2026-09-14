-- Remove duplicate favorites rows, keeping the most recent one per (user_id, product_id)
DELETE FROM public.favorites
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, product_id) id
  FROM public.favorites
  ORDER BY user_id, product_id, id DESC
);

-- Add unique constraint on profiles.user_id so upsert with onConflict works
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

-- Add unique constraint on favorites(user_id, product_id) so upsert with onConflict works
ALTER TABLE public.favorites ADD CONSTRAINT favorites_user_id_product_id_unique UNIQUE (user_id, product_id);