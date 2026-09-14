import { supabase } from '../lib/supabase'

export interface Notification {
  id: string
  user_id: string | null
  title: string
  body: string
  type: string
  is_read: boolean
  created_at: string
}

export async function getNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) {
    console.error('[notifications] getNotifications failed:', error.message)
    return []
  }
  return (data ?? []) as Notification[]
}

export async function getUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false)
  if (error) {
    console.error('[notifications] getUnreadCount failed:', error.message)
    return 0
  }
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
  if (error) console.error('[notifications] markRead failed:', error.message)
}

export async function markAllRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)
  if (error) console.error('[notifications] markAllRead failed:', error.message)
}

export async function sendBroadcast(title: string, body: string, type: string = 'info'): Promise<boolean> {
  const { error } = await supabase.rpc('admin_send_broadcast', {
    p_title: title,
    p_body: body,
    p_type: type,
  })
  if (error) {
    console.error('[notifications] sendBroadcast failed:', error.message)
    return false
  }
  return true
}

export async function sendToUser(userId: string, title: string, body: string, type: string = 'info'): Promise<boolean> {
  const { error } = await supabase.rpc('admin_send_to_user', {
    p_user_id: userId,
    p_title: title,
    p_body: body,
    p_type: type,
  })
  if (error) {
    console.error('[notifications] sendToUser failed:', error.message)
    return false
  }
  return true
}
