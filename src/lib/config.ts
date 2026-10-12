// Database, auth, and edge functions all live on the same Supabase project
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Edge functions are on the same project
export const EDGE_FUNCTION_URL = SUPABASE_URL
export const EDGE_FUNCTION_ANON_KEY = SUPABASE_ANON_KEY

export const SKIMLINKS_PUBLISHER_ID = import.meta.env.VITE_SKIMLINKS_PUBLISHER_ID ?? ''

// Per-session random seed for feed rotation. Generated once per app open
// so the same user sees a different product order each visit, while
// pagination within a single session stays consistent.
export function getFeedSeed(): number {
  const KEY = 'fitgura_feed_seed'
  try {
    const stored = sessionStorage.getItem(KEY)
    if (stored) return parseInt(stored, 10)
  } catch { /* ignore */ }
  const seed = Math.floor(Math.random() * 100000)
  try { sessionStorage.setItem(KEY, String(seed)) } catch { /* ignore */ }
  return seed
}
