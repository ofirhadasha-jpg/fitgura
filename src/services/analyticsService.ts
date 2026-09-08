import { supabase } from '../lib/supabase'

export interface SummaryStats {
  total_clicks: number
  clicks_today: number
  clicks_this_month: number
  unique_active_clickers: number
}

export interface DailyAnalytics {
  click_date: string
  click_count: number
}

export interface TopProduct {
  product_id: string
  product_title: string | null
  total_clicks: number
  last_clicked_at: string
}

export async function getSummaryStats(): Promise<SummaryStats | null> {
  const { data, error } = await supabase.rpc('get_affiliate_summary_stats').maybeSingle()
  if (error) {
    console.error('[analytics] getSummaryStats failed:', error.message)
    return null
  }
  return data as SummaryStats | null
}

export async function getDailyAnalytics(): Promise<DailyAnalytics[]> {
  const { data, error } = await supabase
    .from('daily_affiliate_analytics')
    .select('*')
    .order('click_date', { ascending: false })
    .limit(30)
  if (error) {
    console.error('[analytics] getDailyAnalytics failed:', error.message)
    return []
  }
  return (data ?? []) as DailyAnalytics[]
}

export async function getTopProducts(): Promise<TopProduct[]> {
  const { data, error } = await supabase
    .from('top_clicked_products')
    .select('*')
    .limit(20)
  if (error) {
    console.error('[analytics] getTopProducts failed:', error.message)
    return []
  }
  return (data ?? []) as TopProduct[]
}

export const logAffiliateClick = async (product: {
  product_id: string;
  title?: string;
  promotion_link: string;
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    const { error } = await supabase.from('affiliate_clicks').insert([
      {
        user_id: userId,
        product_id: String(product.product_id),
        product_title: product.title || 'AliExpress Product',
        tracking_id: 'fitgura',
        promotion_link: product.promotion_link,
      },
    ]);
    if (error) {
      console.error('Error logging affiliate click to Supabase:', error);
    } else {
      console.log('Affiliate click logged successfully!');
    }
  } catch (err) {
    console.error('Failed to log click:', err);
  }
};
