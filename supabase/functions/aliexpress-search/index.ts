import { createHash } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALIEXPRESS_GATEWAY = "https://api-sg.aliexpress.com/sync";

interface RequestParams {
  [key: string]: unknown;
}

function generateSignature(params: RequestParams, appSecret: string): string {
  const sortedKeys = Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== undefined && params[key] !== null)
    .sort();

  let stringToSign = appSecret;
  for (const key of sortedKeys) {
    const value = typeof params[key] === "object" ? JSON.stringify(params[key]) : String(params[key]);
    stringToSign += `${key}${value}`;
  }
  stringToSign += appSecret;

  return createHash("md5").update(stringToSign, "utf8").digest("hex").toUpperCase();
}

async function callAliExpressApi(method: string, systemParams: RequestParams = {}): Promise<Record<string, unknown>> {
  const appKey = Deno.env.get("ALIEXPRESS_APP_KEY");
  const appSecret = Deno.env.get("ALIEXPRESS_APP_SECRET");
  const trackingId = Deno.env.get("ALIEXPRESS_TRACKING_ID") || "fitgura";

  if (!appKey || !appSecret) {
    throw new Error("AliExpress App Key or App Secret is missing.");
  }

  const timeStamp = new Date().toISOString().replace("T", " ").substring(0, 19);

  const fullParams: RequestParams = {
    app_key: appKey,
    method,
    timestamp: timeStamp,
    format: "json",
    v: "2.0",
    sign_method: "md5",
    tracking_id: trackingId,
    ...systemParams,
  };

  fullParams.sign = generateSignature(fullParams, appSecret);

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(fullParams)) {
    searchParams.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }

  const response = await fetch(ALIEXPRESS_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: searchParams.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AliExpress API Network Error: ${response.status} - ${errText.slice(0, 300)}`);
  }

  return await response.json() as Record<string, unknown>;
}

interface AliExpressProduct {
  product_id: string;
  product_title: string;
  app_sale_price: string;
  product_main_image_url: string;
  product_detail_url: string;
  evaluate_rate?: string;
  lastest_volume?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action ?? "search";

    if (action === "search") {
      const keywords = body.keywords as string;
      if (!keywords) {
        return new Response(
          JSON.stringify({ error: "Missing keywords" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const pageNo = body.pageNo ?? 1;
      const pageSize = body.pageSize ?? 20;

      const result = await callAliExpressApi("aliexpress.affiliate.product.query", {
        param_ae_op_ha_promo_commerce_item_query_req: {
          keywords,
          page_no: pageNo,
          page_size: pageSize,
          target_currency: "USD",
          target_language: "EN",
        },
      });

      const products: AliExpressProduct[] =
        (result as any)?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product ?? [];

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
    }

    if (action === "details") {
      const productIds = body.productIds as string[];
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing productIds" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const result = await callAliExpressApi("aliexpress.affiliate.productdetail.get", {
        product_ids: productIds.join(","),
        target_currency: "USD",
        target_language: "EN",
      });

      const details = (result as any)?.aliexpress_affiliate_productdetail_get_response?.resp_result?.result ?? null;

      return new Response(
        JSON.stringify({ details }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "affiliate-link") {
      const sourceUrl = body.sourceUrl as string;
      if (!sourceUrl) {
        return new Response(
          JSON.stringify({ error: "Missing sourceUrl" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const result = await callAliExpressApi("aliexpress.affiliate.link.generate", {
        promotion_link_type: "0",
        source_values: sourceUrl,
      });

      const links = (result as any)?.aliexpress_affiliate_link_generate_response?.resp_result?.result?.promotion_links ?? null;

      return new Response(
        JSON.stringify({ links }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
