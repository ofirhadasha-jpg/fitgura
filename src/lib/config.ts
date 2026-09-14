// Database (tables, RLS, auth) lives on this project
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Edge functions are deployed on Bolt's internal project
export const EDGE_FUNCTION_URL = 'https://alvpdkxuvnavoodsltyc.supabase.co'
export const EDGE_FUNCTION_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsdnBka3h1dm5hdm9vZHNsdHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MjQyMzAsImV4cCI6MjEwMzQwMDIzMH0.LY2Cq7CaPaF3bHmQZrOGWt3gc3zYkOTgDEWzxHkV990'
