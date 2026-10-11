/*
# Create SHEIN products catalog table

1. New Tables
- `shein_products` — stores curated SHEIN product data organized by category.
  The edge function reads from this table when live scraping fails (SHEIN
  blocks all server-side access with aggressive bot protection).
  - `id` (uuid, primary key)
  - `goods_id` (text, unique) — SHEIN's product ID
  - `title` (text) — product name
  - `brand` (text) — brand name
  - `price` (numeric) — current price in USD
  - `original_price` (numeric, nullable) — was-price if on sale
  - `currency` (text, default 'USD')
  - `image_url` (text) — product image URL
  - `product_url` (text) — full SHEIN PDP URL (slug-p-id.html)
  - `category` (text) — feed category: 'all', 'clothing', 'shoes', 'accessories'
  - `gender` (text) — 'women', 'men', 'unisex'
  - `sizes` (text[]) — available sizes array
  - `search_keywords` (text[]) — keywords this product matches
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `shein_products`.
- Allow anon + authenticated to read (public catalog).
- No writes from the client — only the edge function / admin can write.
*/

CREATE TABLE IF NOT EXISTS shein_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_id text UNIQUE NOT NULL,
  title text NOT NULL,
  brand text NOT NULL DEFAULT 'SHEIN',
  price numeric NOT NULL DEFAULT 0,
  original_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  image_url text NOT NULL DEFAULT '',
  product_url text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'all',
  gender text NOT NULL DEFAULT 'unisex',
  sizes text[] NOT NULL DEFAULT '{}',
  search_keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shein_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_shein_products" ON shein_products;
CREATE POLICY "anon_read_shein_products"
ON shein_products FOR SELECT
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_shein_products_category ON shein_products(category);
CREATE INDEX IF NOT EXISTS idx_shein_products_gender ON shein_products(gender);
CREATE INDEX IF NOT EXISTS idx_shein_products_keywords ON shein_products USING GIN(search_keywords);
