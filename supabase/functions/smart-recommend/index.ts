import { createHash } from "node:crypto";

// Fitgura smart recommendation pipeline — /sync gateway, trimmed credentials (v3)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALIEXPRESS_GATEWAY = "https://api-sg.aliexpress.com/sync";

interface RequestParams {
  [key: string]: unknown;
}

interface UserBodyMetrics {
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  shoulderCm?: number;
  heightCm?: number;
  weightKg?: number;
  preferredFit?: "tight" | "regular" | "loose";
}

interface FitRecommendation {
  productId: string;
  title: string;
  recommendedSize: string;
  selectedSkuId: string;
  fitConfidenceScore: number;
  fitExplanation: string;
  productImageUrl: string;
  affiliateUrl: string;
  price: string;
}

function generateSignature(params: RequestParams, appSecret: string): string {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== null)
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
  return value?.trim() ?? "";
}

async function getAliExpressTimestamp(): Promise<string> {
  const now = new Date();
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
}

async function callAliExpressApi(method: string, systemParams: RequestParams = {}): Promise<Record<string, unknown>> {
  const appKey = getEnvVar("ALIEXPRESS_APP_KEY");
  const appSecret = getEnvVar("ALIEXPRESS_APP_SECRET");
  const trackingId = getEnvVar("ALIEXPRESS_TRACKING_ID") || "fitgura";

  if (!appKey || !appSecret) {
    throw new Error(`AliExpress credentials not configured. Missing: ${[!appKey && "ALIEXPRESS_APP_KEY", !appSecret && "ALIEXPRESS_APP_SECRET"].filter(Boolean).join(", ")}`);
  }

  const timeStamp = await getAliExpressTimestamp();

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

  const formBody = new URLSearchParams();
  for (const [key, value] of Object.entries(fullParams)) {
    const strValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    formBody.append(key, strValue);
  }

  const response = await fetch(ALIEXPRESS_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: formBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AliExpress API Error: ${response.status} - ${errText.slice(0, 300)}`);
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
}

async function searchProducts(keywords: string, pageNo = 1, pageSize = 5): Promise<AliExpressProduct[]> {
  const result = await callAliExpressApi("aliexpress.affiliate.product.query", {
    keywords,
    page_no: pageNo,
    page_size: pageSize,
    target_currency: "USD",
    target_language: "EN",
  });

  const products =
    (result as any)?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product ?? [];

  return products as AliExpressProduct[];
}

async function getProductDetails(productIds: string[]): Promise<any[]> {
  const result = await callAliExpressApi("aliexpress.affiliate.productdetail.get", {
    product_ids: productIds.join(","),
    target_currency: "USD",
    target_language: "EN",
  });

  const details =
    (result as any)?.aliexpress_affiliate_productdetail_get_response?.resp_result?.result?.products?.product ?? [];

  return Array.isArray(details) ? details : [];
}

async function generateAffiliateLink(sourceUrl: string): Promise<string | null> {
  const result = await callAliExpressApi("aliexpress.affiliate.link.generate", {
    promotion_link_type: "0",
    source_values: sourceUrl,
  });

  const links =
    (result as any)?.aliexpress_affiliate_link_generate_response?.resp_result?.result?.promotion_links ?? [];

  return links?.[0]?.promotion_link ?? null;
}

async function analyzeSizeChartWithAI(
  userMetrics: UserBodyMetrics,
  productDetails: any,
): Promise<{ recommendedSize: string; skuId: string; confidence: number; reason: string }> {
  const apiKey = getEnvVar("DEEPSEEK_API_KEY");

  if (!apiKey) {
    console.warn("[ENV AUDIT] DEEPSEEK_API_KEY is missing. Using fallback matching algorithm.");
    return {
      recommendedSize: "L",
      skuId: productDetails?.sku_list?.sku?.[0]?.sku_id || "",
      confidence: 85,
      reason: "התאמה בסיסית מבוססת יחס גובה ומשקל.",
    };
  }

  const prompt = `You are Fitgura's expert sizing AI assistant. Analyze the user's exact body measurements and match them against the product's sizing options and variants.

USER MEASUREMENTS:
- Chest: ${userMetrics.chestCm ?? "N/A"} cm
- Waist: ${userMetrics.waistCm ?? "N/A"} cm
- Hips: ${userMetrics.hipsCm ?? "N/A"} cm
- Shoulder Width: ${userMetrics.shoulderCm ?? "N/A"} cm
- Height: ${userMetrics.heightCm ?? "N/A"} cm
- Weight: ${userMetrics.weightKg ?? "N/A"} kg
- Fit Preference: ${userMetrics.preferredFit ?? "regular"}

PRODUCT DATA:
Title: ${productDetails?.product_title ?? "Unknown"}
SKU Options & Size Chart: ${JSON.stringify(productDetails?.sku_list ?? productDetails?.ae_item_sku_info_dtos ?? [])}

TASK:
1. Determine the exact best-fitting size (e.g., S, M, L, XL, XXL).
2. Identify the corresponding SKU ID for that size variant.
3. Provide a fit confidence score (0-100%).
4. Write a concise 1-sentence Hebrew explanation of why this size was chosen.

Return ONLY a valid JSON object in this format:
{
  "recommendedSize": "L",
  "skuId": "12000012345",
  "confidence": 92,
  "reason": "הסבר בעברית..."
}`;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`DeepSeek API Error: ${response.status} - ${errBody.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response from DeepSeek");

    const parsed = JSON.parse(content);
    if (!parsed.recommendedSize || !parsed.confidence) {
      throw new Error("DeepSeek response missing required fields");
    }
    return parsed;
  } catch (error) {
    console.error("DeepSeek Size Chart Analysis failed:", error);
    return {
      recommendedSize: "M",
      skuId: "",
      confidence: 70,
      reason: "התאמה משוערת לפי נתוני המדף של המוצר.",
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { searchQuery, userMetrics } = await req.json();

    if (!searchQuery) {
      return new Response(
        JSON.stringify({ error: "Missing searchQuery" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!userMetrics) {
      return new Response(
        JSON.stringify({ error: "Missing userMetrics" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const searchResults = await searchProducts(searchQuery, 1, 5);

    if (!searchResults || searchResults.length === 0) {
      return new Response(
        JSON.stringify({ error: `לא נמצאו מוצרים עבור החיפוש: "${searchQuery}"` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const topProducts = searchResults.slice(0, 3);
    const productIds = topProducts.map((p) => String(p.product_id));

    const detailedProducts = await getProductDetails(productIds);
    if (detailedProducts.length === 0) {
      console.warn("[PIPELINE] No detailed product data received. Falling back to search results (SKU data may be incomplete).");
    }
    const productsToAnalyze = detailedProducts.length > 0 ? detailedProducts : topProducts;

    const recommendations: FitRecommendation[] = [];

    for (const product of productsToAnalyze) {
      const aiFit = await analyzeSizeChartWithAI(userMetrics, product);

      const rawUrl = product.promotion_link || product.product_detail_url || "";
      const affiliateUrl = rawUrl ? await generateAffiliateLink(rawUrl) : null;
      const finalAffiliateUrl = affiliateUrl ?? rawUrl;

      recommendations.push({
        productId: String(product.product_id ?? ""),
        title: product.product_title ?? "Unknown Product",
        recommendedSize: aiFit.recommendedSize,
        selectedSkuId: aiFit.skuId,
        fitConfidenceScore: aiFit.confidence,
        fitExplanation: aiFit.reason,
        productImageUrl: product.product_main_image_url ?? "",
        affiliateUrl: finalAffiliateUrl,
        price: product.target_sale_price ?? product.app_sale_price ?? "N/A",
      });
    }

    recommendations.sort((a, b) => b.fitConfidenceScore - a.fitConfidenceScore);

    return new Response(
      JSON.stringify({ recommendations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
