// Database, auth, and edge functions all live on the same Supabase project
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Edge functions are on the same project
export const EDGE_FUNCTION_URL = SUPABASE_URL
export const EDGE_FUNCTION_ANON_KEY = SUPABASE_ANON_KEY
