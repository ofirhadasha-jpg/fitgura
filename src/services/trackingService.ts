import { supabase } from '../lib/supabase'

let sessionId: string | null = null

export async function startSession(userId: string | null): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .insert({
        user_id: userId,
        session_start: new Date().toISOString(),
        device_info: navigator.userAgent.slice(0, 200),
      })
      .select('id')
      .single()
    if (error) {
      console.error('[tracking] startSession failed:', error.message)
      return
    }
    sessionId = data?.id ?? null
  } catch (err) {
    console.error('[tracking] startSession error:', err)
  }
}

export async function endSession(): Promise<void> {
  if (!sessionId) return
  try {
    const { error } = await supabase
      .from('user_sessions')
      .update({
        session_end: new Date().toISOString(),
        duration_seconds: Math.floor(performance.now() / 1000),
      })
      .eq('id', sessionId)
    if (error) console.error('[tracking] endSession failed:', error.message)
    sessionId = null
  } catch (err) {
    console.error('[tracking] endSession error:', err)
  }
}

export async function logSearch(
  searchType: 'device' | 'product' | 'body_scan',
  query: string,
  resultsCount: number,
  userId: string | null = null,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('search_history')
      .insert({
        user_id: userId,
        search_type: searchType,
        search_query: query,
        results_count: resultsCount,
      })
    if (error) console.error('[tracking] logSearch failed:', error.message)
  } catch (err) {
    console.error('[tracking] logSearch error:', err)
  }
}

export async function updateLastSeen(userId: string): Promise<void> {
  if (!userId) return
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (error) console.error('[tracking] updateLastSeen failed:', error.message)
  } catch (err) {
    console.error('[tracking] updateLastSeen error:', err)
  }
}

export async function syncFinalSizes(
  userId: string,
  topSize: string | null,
  bottomSize: string | null,
  shoeSize: string | null,
): Promise<void> {
  if (!userId) return
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          final_top_size: topSize,
          final_bottom_size: bottomSize,
          final_shoe_size: shoeSize,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
    if (error) console.error('[tracking] syncFinalSizes failed:', error.message)
  } catch (err) {
    console.error('[tracking] syncFinalSizes error:', err)
  }
}

export async function saveUserEvent(
  userId: string,
  eventName: string,
  eventDate: string,
  eventType: string = 'custom',
  emoji: string = '🎉',
  reminderDays: number = 7,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_events')
      .insert({
        user_id: userId,
        event_name: eventName,
        event_date: eventDate,
        event_type: eventType,
        emoji,
        reminder_days: reminderDays,
      })
    if (error) console.error('[tracking] saveUserEvent failed:', error.message)
  } catch (err) {
    console.error('[tracking] saveUserEvent error:', err)
  }
}
