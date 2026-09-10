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

export async function logAffiliateClick(product: {
  product_id?: string;
  id?: string;
  productId?: string;
  title?: string;
  name?: string;
  promotion_link?: string;
  url?: string;
  affiliateUrl?: string;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      product_id: String(product?.product_id || product?.id || product?.productId || 'unknown-product'),
      product_title: String(product?.title || product?.name || 'AliExpress Item'),
      promotion_link: String(product?.promotion_link || product?.url || product?.affiliateUrl || 'https://aliexpress.com'),
      tracking_id: 'fitgura',
      user_id: user?.id || null,
    }

    console.log('[analytics] Sending click payload to BOLT DATA BASE:', payload)

    const { error } = await supabase
      .from('affiliate_clicks')
      .insert([payload])

    if (error) {
      console.error('[analytics] Supabase insert error:', error.message, error.details)
    } else {
      console.log('[analytics] Click successfully logged')
    }
  } catch (err) {
    console.error('[analytics] Unexpected click logging error:', err)
  }
}
