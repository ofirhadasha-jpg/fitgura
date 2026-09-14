import { supabase } from '../lib/supabase'

export interface SummaryStats {
  total_clicks: number
  clicks_today: number
  clicks_this_month: number
  unique_active_clickers: number
}

export interface EnhancedSummaryStats {
  total_clicks: number
  clicks_today: number
  clicks_this_month: number
  unique_active_clickers: number
  total_users: number
  new_users_today: number
  total_favorites: number
  total_sessions: number
  total_searches: number
  total_events: number
  active_users_today: number
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

export interface AdminUserRow {
  user_id: string
  email: string | null
  gender: string | null
  top_size: string | null
  bottom_size: string | null
  shoe_size: string | null
  fit: string | null
  preferred_region: string | null
  final_top_size: string | null
  final_bottom_size: string | null
  final_shoe_size: string | null
  is_active: boolean | null
  created_at: string
  updated_at: string
  last_seen_at: string | null
}

export interface AdminClickRow {
  id: string
  user_id: string | null
  user_email: string | null
  product_id: string
  product_title: string | null
  promotion_link: string
  created_at: string
}

export interface AdminUserDetails {
  user_id: string
  email: string | null
  gender: string | null
  top_size: string | null
  bottom_size: string | null
  shoe_size: string | null
  fit: string | null
  preferred_region: string | null
  final_top_size: string | null
  final_bottom_size: string | null
  final_shoe_size: string | null
  is_active: boolean | null
  created_at: string
  updated_at: string
  last_seen_at: string | null
  session_count: number
  total_clicks: number
  total_favorites: number
  total_searches: number
  total_events: number
}

export interface AdminUserSession {
  id: string
  session_start: string
  session_end: string | null
  duration_seconds: number | null
  device_info: string | null
}

export interface AdminUserSearch {
  id: string
  search_type: string
  search_query: string
  results_count: number
  created_at: string
}

export interface AdminUserEvent {
  id: string
  event_name: string
  event_date: string
  event_type: string
  emoji: string
  reminder_days: number
  created_at: string
}

export interface AdminAllEvent {
  id: string
  user_id: string
  user_email: string | null
  event_name: string
  event_date: string
  event_type: string
  emoji: string
}

export interface AdminActivityRow {
  activity_type: string
  activity_id: string
  user_id: string | null
  user_email: string | null
  description: string
  created_at: string
}

export async function getSummaryStats(): Promise<SummaryStats | null> {
  const { data, error } = await supabase.rpc('get_affiliate_summary_stats').maybeSingle()
  if (error) {
    console.error('[analytics] getSummaryStats failed:', error.message)
    return null
  }
  return data as SummaryStats | null
}

export async function getEnhancedSummary(): Promise<EnhancedSummaryStats | null> {
  const { data, error } = await supabase.rpc('get_admin_enhanced_summary').maybeSingle()
  if (error) {
    console.error('[analytics] getEnhancedSummary failed:', error.message)
    return null
  }
  return data as EnhancedSummaryStats | null
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

export async function getAdminUserList(): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('get_admin_user_list')
  if (error) {
    console.error('[analytics] getAdminUserList failed:', error.message)
    return []
  }
  return (data ?? []) as AdminUserRow[]
}

export async function getAdminRecentClicks(limit = 50): Promise<AdminClickRow[]> {
  const { data, error } = await supabase.rpc('get_admin_recent_clicks', { limit_count: limit })
  if (error) {
    console.error('[analytics] getAdminRecentClicks failed:', error.message)
    return []
  }
  return (data ?? []) as AdminClickRow[]
}

export async function getAdminUserDetails(userId: string): Promise<AdminUserDetails | null> {
  const { data, error } = await supabase.rpc('get_admin_user_details', { target_user_id: userId }).maybeSingle()
  if (error) {
    console.error('[analytics] getAdminUserDetails failed:', error.message)
    return null
  }
  return data as AdminUserDetails | null
}

export async function getAdminUserSessions(userId: string, limit = 20): Promise<AdminUserSession[]> {
  const { data, error } = await supabase.rpc('get_admin_user_sessions', { target_user_id: userId, limit_count: limit })
  if (error) {
    console.error('[analytics] getAdminUserSessions failed:', error.message)
    return []
  }
  return (data ?? []) as AdminUserSession[]
}

export async function getAdminUserSearches(userId: string, limit = 20): Promise<AdminUserSearch[]> {
  const { data, error } = await supabase.rpc('get_admin_user_searches', { target_user_id: userId, limit_count: limit })
  if (error) {
    console.error('[analytics] getAdminUserSearches failed:', error.message)
    return []
  }
  return (data ?? []) as AdminUserSearch[]
}

export async function getAdminUserEvents(userId: string): Promise<AdminUserEvent[]> {
  const { data, error } = await supabase.rpc('get_admin_user_events', { target_user_id: userId })
  if (error) {
    console.error('[analytics] getAdminUserEvents failed:', error.message)
    return []
  }
  return (data ?? []) as AdminUserEvent[]
}

export async function getAdminAllEvents(): Promise<AdminAllEvent[]> {
  const { data, error } = await supabase.rpc('get_admin_all_events')
  if (error) {
    console.error('[analytics] getAdminAllEvents failed:', error.message)
    return []
  }
  return (data ?? []) as AdminAllEvent[]
}

export async function getAdminRecentActivity(limit = 30): Promise<AdminActivityRow[]> {
  const { data, error } = await supabase.rpc('get_admin_recent_activity', { limit_count: limit })
  if (error) {
    console.error('[analytics] getAdminRecentActivity failed:', error.message)
    return []
  }
  return (data ?? []) as AdminActivityRow[]
}

export async function adminUpdateUserStatus(userId: string, isActive: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('admin_update_user_status', {
    p_user_id: userId,
    p_is_active: isActive,
  })
  if (error) {
    console.error('[analytics] adminUpdateUserStatus failed:', error.message)
    return false
  }
  return true
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

    const { error } = await supabase
      .from('affiliate_clicks')
      .insert([payload])

    if (error) {
      console.error('[analytics] Supabase insert error:', error.message, error.details)
    }
  } catch (err) {
    console.error('[analytics] Unexpected click logging error:', err)
  }
}
