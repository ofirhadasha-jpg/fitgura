import { createHash } from "node:crypto";

// Fitgura AliExpress Affiliate API proxy — /rest gateway, flat params, tracking_id excluded from sign

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALIEXPRESS_GATEWAY = "https://api-sg.aliexpress.com/rest";

interface RequestParams {
  [key: string]: unknown;
}

function generateSignature(params: RequestParams, appSecret: string): string {
  const sortedKeys = Object.keys(params)
    .filter((key) => key !== "sign" && key !== "tracking_id" && params[key] !== undefined && params[key] !== null)
    .sort();

  let stringToSign = appSecret;
  for (const key of sortedKeys) {
    const value = typeof params[key] === "object" ? JSON.stringify(params[key]) : String(params[key]);
    stringToSign += `${key}${value}`;
  }
  stringToSign += appSecret;

  return createHash("md5").update(stringToSign, "utf8").digest("hex").toUpperCase();
}

function getEnvVar(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`[ENV AUDIT] Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

async function callAliExpressApi(method: string, systemParams: RequestParams = {}): Promise<Record<string, unknown>> {
  const appKey = getEnvVar("ALIEXPRESS_APP_KEY");
  const appSecret = getEnvVar("ALIEXPRESS_APP_SECRET");
  const trackingId = getEnvVar("ALIEXPRESS_TRACKING_ID") || "fitgura";

  if (!appKey || !appSecret) {
    throw new Error(`AliExpress credentials not configured. Missing: ${[!appKey && "ALIEXPRESS_APP_KEY", !appSecret && "ALIEXPRESS_APP_SECRET"].filter(Boolean).join(", ")}`);
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

  const bodyParts: string[] = [];
  for (const [key, value] of Object.entries(fullParams)) {
    const strValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    bodyParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(strValue)}`);
  }

  const response = await fetch(ALIEXPRESS_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: bodyParts.join("&"),
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
        keywords,
        page_no: pageNo,
        page_size: pageSize,
        target_currency: "USD",
        target_language: "EN",
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

    if (action === "test") {
      const appKey = getEnvVar("ALIEXPRESS_APP_KEY");
      const appSecret = getEnvVar("ALIEXPRESS_APP_SECRET");
      const trackingId = getEnvVar("ALIEXPRESS_TRACKING_ID");
      const deepseekKey = getEnvVar("DEEPSEEK_API_KEY");

      const envAudit = {
        ALIEXPRESS_APP_KEY: !!appKey,
        ALIEXPRESS_APP_SECRET: !!appSecret,
        ALIEXPRESS_TRACKING_ID: !!trackingId,
        DEEPSEEK_API_KEY: !!deepseekKey,
      };

      const missing = Object.entries(envAudit).filter(([, v]) => !v).map(([k]) => k);

      try {
        const testKeywords = body.keywords ?? "men jacket";
        const result = await callAliExpressApi("aliexpress.affiliate.product.query", {
          keywords: testKeywords,
          page_no: 1,
          page_size: 5,
          target_currency: "USD",
          target_language: "EN",
        });

        const products: AliExpressProduct[] =
          (result as any)?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product ?? [];

        return new Response(
          JSON.stringify({
            envAudit,
            missingVars: missing,
            connectivity: "ok",
            productCount: products.length,
            rawResponseKeys: Object.keys(result),
            rawResponsePreview: JSON.stringify(result).slice(0, 1000),
            sampleProducts: products.slice(0, 3).map((p) => ({
              product_id: p.product_id,
              product_title: p.product_title,
              app_sale_price: p.app_sale_price,
            })),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (testErr) {
        return new Response(
          JSON.stringify({
            envAudit,
            missingVars: missing,
            connectivity: "failed",
            error: testErr instanceof Error ? testErr.message : "Unknown error",
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
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
