/*
# Create ai_config table for storing AI API keys

1. New Tables
- `ai_config`
  - `key` (text, primary key) — the config key name (e.g. 'DEEPSEEK_API_KEY')
  - `value` (text, not null) — the secret value
  - `created_at` (timestamp)

2. Security
- Enable RLS on `ai_config`.
- Allow anon + authenticated CRUD (single-tenant app, no sign-in).
*/

CREATE TABLE IF NOT EXISTS ai_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ai_config" ON ai_config;
CREATE POLICY "anon_select_ai_config" ON ai_config
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ai_config" ON ai_config;
CREATE POLICY "anon_insert_ai_config" ON ai_config
FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ai_config" ON ai_config;
CREATE POLICY "anon_update_ai_config" ON ai_config
FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ai_config" ON ai_config;
CREATE POLICY "anon_delete_ai_config" ON ai_config
FOR DELETE TO anon, authenticated USING (true);
