const { data: { session } } = await supabase.auth.getSession();
const response = await supabase.functions.invoke('fetch-aliexpress', {
  body: params,
  headers: {
    Authorization: `Bearer ${session?.access_token}`
  }
});