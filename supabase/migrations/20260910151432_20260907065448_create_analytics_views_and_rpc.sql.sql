/*
# Create analytics views and summary function

1. New views
- `daily_affiliate_analytics`: daily click totals.
- `top_clicked_products`: product totals and latest click time.
2. New function
- `get_affiliate_summary_stats()`: all-time, today, month, and unique clicker totals.
3. Security
- Views and function are accessible to authenticated users only.
- The function uses SECURITY DEFINER with a fixed public search path.
*/

CREATE OR REPLACE VIEW daily_affiliate_analytics AS
SELECT DATE(created_at) AS click_date, COUNT(*) AS click_count
FROM affiliate_clicks
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;

CREATE OR REPLACE VIEW top_clicked_products AS
SELECT product_id, MAX(product_title) AS product_title, COUNT(*) AS total_clicks, MAX(created_at) AS last_clicked_at
FROM affiliate_clicks
WHERE product_id IS NOT NULL
GROUP BY product_id
ORDER BY total_clicks DESC;

CREATE OR REPLACE FUNCTION get_affiliate_summary_stats()
RETURNS TABLE (total_clicks BIGINT, clicks_today BIGINT, clicks_this_month BIGINT, unique_active_clickers BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::BIGINT,
    COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE))::BIGINT,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::BIGINT
  FROM affiliate_clicks;
END;
$$;

GRANT SELECT ON daily_affiliate_analytics TO authenticated;
GRANT SELECT ON top_clicked_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_affiliate_summary_stats() TO authenticated;