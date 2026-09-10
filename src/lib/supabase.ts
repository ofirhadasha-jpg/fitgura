import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

export const isSupabaseConfigured = true

console.log('[supabase] Initializing with URL:', SUPABASE_URL)

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

console.log('[supabase] Client created. URL is:', SUPABASE_URL ? 'defined' : 'UNDEFINED', '| Key is:', SUPABASE_ANON_KEY ? 'defined' : 'UNDEFINED')
