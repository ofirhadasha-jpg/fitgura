/*
# Create temu_products catalog table

## Purpose
Temu has no affiliate API accessible from the client, and like SHEIN it
blocks server-side scraping. To surface Temu products as primary feed
items (not just secondary visual matches), this curated catalog stores
product data with Pexels images and Temu search URLs derived from titles.

## Table
- temu_products
  - goods_id (text, primary key) — internal catalog ID
  - title (text) — product name
  - brand (text) — always "Temu"
  - price (numeric) — price in USD
  - original_price (numeric, nullable) — was-price for strikethrough
  - currency (text, default 'USD')
  - image_url (text) — Pexels stock photo URL
  - product_url (text) — Temu search URL built from the title
  - category (text) — clothing / shoes / accessories
  - gender (text) — women / men / unisex
  - sizes (text[]) — available sizes
  - search_keywords (text[]) — keyword tags for relevance sorting

## Security
- RLS enabled, anon+authenticated CRUD (single-tenant, no auth gate).
*/

CREATE TABLE IF NOT EXISTS temu_products (
  goods_id text PRIMARY KEY,
  title text NOT NULL,
  brand text NOT NULL DEFAULT 'Temu',
  price numeric NOT NULL DEFAULT 0,
  original_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  image_url text NOT NULL,
  product_url text NOT NULL,
  category text NOT NULL,
  gender text NOT NULL DEFAULT 'unisex',
  sizes text[] NOT NULL DEFAULT '{}',
  search_keywords text[] NOT NULL DEFAULT '{}'
);

ALTER TABLE temu_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_temu_products" ON temu_products;
CREATE POLICY "anon_select_temu_products" ON temu_products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_temu_products" ON temu_products;
CREATE POLICY "anon_insert_temu_products" ON temu_products FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_temu_products" ON temu_products;
CREATE POLICY "anon_update_temu_products" ON temu_products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_temu_products" ON temu_products;
CREATE POLICY "anon_delete_temu_products" ON temu_products FOR DELETE
  TO anon, authenticated USING (true);