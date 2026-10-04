import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Temu affiliate edge function.
// When TEMU_AFFILIATE_KEY is configured as a secret, this function will call
// the Temu affiliate product search API. Until then, it returns an empty
// product list so the client falls back to mock data.

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { keywords, pageNo, pageSize, affiliateKey } = await req.json();

    if (!affiliateKey && !Deno.env.get("TEMU_AFFILIATE_KEY")) {
      return new Response(
        JSON.stringify({ products: [], error: "Temu affiliate key not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // When credentials are available, the real Temu API call goes here.
    // For now, return empty so the client uses mock data.
    return new Response(
      JSON.stringify({ products: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
