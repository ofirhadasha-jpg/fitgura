import { createHash } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AliExpressProduct {
  product_id: string;
  product_title: string;
  app_sale_price: string;
  product_main_image_url: string;
  product_detail_url: string;
  evaluate_rate?: string;
  lastest_volume?: number;
}

function generateSignature(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let baseString = secret;
  for (const key of sortedKeys) {
    baseString += `${key}${params[key]}`;
  }
  baseString += secret;
  return createHash("md5").update(baseString, "utf8").digest("hex").toUpperCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { keywords, categoryIds } = await req.json();

    if (!keywords) {
      return new Response(
        JSON.stringify({ error: "Missing keywords" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const appKey = Deno.env.get("ALIEXPRESS_APP_KEY");
    const appSecret = Deno.env.get("ALIEXPRESS_APP_SECRET");
    const trackingId = Deno.env.get("ALIEXPRESS_TRACKING_ID");

    if (!appKey || !appSecret || !trackingId) {
      return new Response(
        JSON.stringify({ error: "AliExpress API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const timestamp = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");

    const sysParams: Record<string, string> = {
      method: "aliexpress.affiliate.product.query",
      app_key: appKey,
      sign_method: "md5",
      timestamp,
      format: "json",
      v: "2.0",
      keywords,
      tracking_id: trackingId,
      target_currency: "USD",
      target_language: "EN",
    };

    if (categoryIds) {
      sysParams["category_ids"] = categoryIds;
    }

    sysParams["sign"] = generateSignature(sysParams, appSecret);

    const response = await fetch("https://api-sg.aliexpress.com/sync", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(sysParams).toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: `AliExpress API Error: ${response.status} - ${errText.slice(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const products: AliExpressProduct[] = data?.resp_result?.result?.products?.product ?? [];

    const mapped = products.map((p) => ({
      name: p.product_title ?? "Unknown Product",
      brand: "AliExpress",
      price: Math.round(parseFloat(p.app_sale_price || "0") * 3.7),
      img: p.product_main_image_url ?? "",
      category: "clothing",
      aliexpressUrl: p.product_detail_url ?? "",
      aliexpressSku: p.product_id ?? "",
      matchScore: Math.round((parseFloat(p.evaluate_rate || "0.9")) * 100),
    }));

    return new Response(
      JSON.stringify({ products: mapped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
