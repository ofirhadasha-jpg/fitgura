/*
# Create analytics views and RPC for Admin Dashboard

1. New Views
- `daily_affiliate_analytics` — one row per day with click count, ordered by date descending.
- `top_clicked_products` — one row per product_id with total_clicks and last_clicked_at, ordered by clicks descending.

2. New RPC Function
- `get_affiliate_summary_stats()` — returns a single row with:
  - total_clicks (all-time)
  - clicks_today
  - clicks_this_month
  - unique_active_clickers (distinct user_id count where user_id is not null)

3. Security
- Views are accessible to authenticated users only (admin dashboard requires login).
- RPC function is accessible to authenticated users only.
- No RLS needed on views (they are read-only aggregations of affiliate_clicks which already has RLS).
- The RPC uses SECURITY DEFINER to bypass RLS on affiliate_clicks for aggregate counting only.

4. Notes
- Views are created with `OR REPLACE` for idempotency.
- The RPC function returns a JSON-like record with 4 numeric fields.
- All date calculations use the timezone-aware `now()` and date truncation.
*/

-- Daily click analytics view
CREATE OR REPLACE VIEW daily_affiliate_analytics AS
SELECT
  DATE(created_at) AS click_date,
  COUNT(*) AS click_count
FROM affiliate_clicks
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;

-- Top clicked products view
CREATE OR REPLACE VIEW top_clicked_products AS
SELECT
  product_id,
  MAX(product_title) AS product_title,
  COUNT(*) AS total_clicks,
  MAX(created_at) AS last_clicked_at
FROM affiliate_clicks
WHERE product_id IS NOT NULL
GROUP BY product_id
ORDER BY total_clicks DESC;

-- Summary stats RPC function
CREATE OR REPLACE FUNCTION get_affiliate_summary_stats()
RETURNS TABLE (
  total_clicks BIGINT,
  clicks_today BIGINT,
  clicks_this_month BIGINT,
  unique_active_clickers BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_clicks,
    COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::BIGINT AS clicks_today,
    COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE))::BIGINT AS clicks_this_month,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::BIGINT AS unique_active_clickers
  FROM affiliate_clicks;
END;
$$;

-- Grant access to authenticated users
GRANT SELECT ON daily_affiliate_analytics TO authenticated;
GRANT SELECT ON top_clicked_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_affiliate_summary_stats() TO authenticated;