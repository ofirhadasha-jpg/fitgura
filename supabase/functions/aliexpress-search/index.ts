import { createHash } from "node:crypto";

// Fitgura AliExpress Affiliate API proxy — Beijing timezone, ILS currency, detailed error surfacing

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALIEXPRESS_GATEWAY = "https://api-sg.aliexpress.com/sync";

interface RequestParams {
  [key: string]: unknown;
}

/**
 * AliExpress API gateway validates timestamps against Beijing server time (UTC+8).
 * Format: "YYYY-MM-DD HH:mm:ss"
 */
function getAliExpressTimestamp(): string {
  const now = new Date();
  const utc8 = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${utc8.getFullYear()}-${pad(utc8.getMonth() + 1)}-${pad(utc8.getDate())} ${pad(utc8.getHours())}:${pad(utc8.getMinutes())}:${pad(utc8.getSeconds())}`;
}

/**
 * MD5 signature per AliExpress spec:
 * 1. Collect all params excluding "sign"
 * 2. Sort keys alphabetically
 * 3. Concatenate: APP_SECRET + key1 + val1 + key2 + val2 + ... + APP_SECRET
 * 4. MD5 hash, uppercase hex
 * Uses RAW unencoded values for signing. URL encoding is applied separately when building the form body.
 */
function generateSignature(params: RequestParams, appSecret: string): string {
  const sortedKeys = Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== undefined && params[key] !== null && params[key] !== "")
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

function callAliExpressApi(method: string, systemParams: RequestParams = {}): Promise<Record<string, unknown>> {
  const appKey = getEnvVar("ALIEXPRESS_APP_KEY");
  const appSecret = getEnvVar("ALIEXPRESS_APP_SECRET");
  const trackingId = getEnvVar("ALIEXPRESS_TRACKING_ID") || "fitgura";

  if (!appKey || !appSecret) {
    throw new Error(`AliExpress credentials not configured. Missing: ${[!appKey && "ALIEXPRESS_APP_KEY", !appSecret && "ALIEXPRESS_APP_SECRET"].filter(Boolean).join(", ")}`);
  }

  const timeStamp = getAliExpressTimestamp();

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

  // Build URL-encoded body — encode values AFTER signing
  const formBody = new URLSearchParams();
  for (const [key, value] of Object.entries(fullParams)) {
    const strValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    formBody.append(key, strValue);
  }

  console.log("[ALIEXPRESS] Request:", { method, timestamp: timeStamp, params: { ...systemParams, page_no: systemParams.page_no, page_size: systemParams.page_size } });

  return fetch(ALIEXPRESS_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: formBody,
  }).then(async (response) => {
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`AliExpress API Network Error: ${response.status} - ${responseText.slice(0, 500)}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      throw new Error(`AliExpress returned non-JSON response: ${responseText.slice(0, 500)}`);
    }

    // Check for AliExpress API-level errors
    const errorKey = Object.keys(parsed).find((k) => k.includes("error_response"));
    if (errorKey) {
      const errorResp = parsed[errorKey] as Record<string, unknown>;
      const msg = errorResp?.msg ?? "Unknown AliExpress error";
      const subMsg = errorResp?.sub_msg ?? "";
      const code = errorResp?.code ?? "";
      const fullError = subMsg ? `${msg} (${code}): ${subMsg}` : `${msg} (${code})`;
      console.error("[ALIEXPRESS] API Error:", fullError, JSON.stringify(errorResp).slice(0, 500));
      throw new Error(`AliExpress API: ${fullError}`);
    }

    console.log("[ALIEXPRESS] Success for method:", method);
    return parsed;
  });
}

interface AliExpressProduct {
  product_id: string;
  product_title: string;
  app_sale_price: string;
  target_sale_price?: string;
  target_original_price?: string;
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
      const keywords = body.keywords as string | undefined;
      const categoryIds = body.categoryIds as string | undefined;

      if (!keywords && !categoryIds) {
        return new Response(
          JSON.stringify({ error: "Missing keywords or categoryIds" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const pageNo = body.pageNo ?? 1;
      const pageSize = body.pageSize ?? 50;
      const targetLanguage = "HE";

      const gender = body.gender as string | undefined;
      const genderPrefix = gender === "male" ? "men " : gender === "female" ? "women " : "";
      const isFemaleSearch = gender === "female";
      const isMaleSearch = gender === "male";
      const isClothingSearch = categoryIds === "200000783,200000782";
      const clothingKeywords = "dress shirt pants top skirt blouse t-shirt hoodie sweater coat jacket jeans";
      const searchKeywords = keywords
        ? `${genderPrefix}${isClothingSearch ? clothingKeywords : keywords}`
        : "";

      const apiParams: RequestParams = {
        page_no: pageNo,
        page_size: pageSize,
        target_currency: "ILS",
        target_language: targetLanguage,
      };

      if (searchKeywords) {
        apiParams.keywords = searchKeywords;
      }
      if (categoryIds) {
        apiParams.category_ids = categoryIds;
      }

      // Hard exclusion: when searching accessories, exclude apparel category IDs
      const isAccessoriesSearch = categoryIds === "5090301,509" || categoryIds === "509";
      if (isAccessoriesSearch) {
        // These are the apparel category IDs we want to keep out of accessories results
        // We can't pass exclude params directly to the API, but we'll filter client-side below
        console.log("[ALIEXPRESS] Accessories search — apparel will be filtered out");
      }

      console.log("[ALIEXPRESS] Search params:", { keywords: searchKeywords, categoryIds, pageNo, pageSize, targetLanguage });

      let result = await callAliExpressApi("aliexpress.affiliate.product.query", apiParams);

      let products: AliExpressProduct[] =
        (result as Record<string, unknown>)?.aliexpress_affiliate_product_query_response
          ?.resp_result?.result?.products?.product ?? [];

      // Fallback: if category_ids returned no results, retry with keywords only
      if (products.length === 0 && categoryIds && searchKeywords) {
        console.log("[ALIEXPRESS] No results with category_ids, retrying with keywords only:", searchKeywords);
        const fallbackParams: RequestParams = {
          page_no: pageNo,
          page_size: pageSize,
          target_currency: "ILS",
          target_language: targetLanguage,
          keywords: searchKeywords,
        };
        result = await callAliExpressApi("aliexpress.affiliate.product.query", fallbackParams);
        products =
          (result as Record<string, unknown>)?.aliexpress_affiliate_product_query_response
            ?.resp_result?.result?.products?.product ?? [];
      }

      // Fallback: if still no results and keywords were used, try a simpler keyword
      if (products.length === 0 && searchKeywords) {
        const isAccessories = isAccessoriesSearch;
        const simpleKeyword = isAccessories ? "phone case cover" : "fashion clothing";
        console.log("[ALIEXPRESS] Still no results, retrying with simple keyword:", simpleKeyword);
        const fallbackParams: RequestParams = {
          page_no: pageNo,
          page_size: pageSize,
          target_currency: "ILS",
          target_language: targetLanguage,
          keywords: genderPrefix + simpleKeyword,
        };
        result = await callAliExpressApi("aliexpress.affiliate.product.query", fallbackParams);
        products =
          (result as Record<string, unknown>)?.aliexpress_affiliate_product_query_response
            ?.resp_result?.result?.products?.product ?? [];
      }

      const mapped = products.map((p) => {
        // With target_currency=ILS, target_sale_price is already in shekels
        const salePrice = parseFloat(p.target_sale_price || p.app_sale_price || "0");
        const originalPrice = parseFloat(p.target_original_price || "0");
        // Infer category from categoryIds if available
        let category = "clothing";
        if (categoryIds) {
          if (/200000832|200000831|200000835/.test(categoryIds)) category = "shoes";
          else if (/200000788|200000785|200001661|5090301|509/.test(categoryIds)) category = "accessories";
          else category = "clothing";
        }
        return {
          name: p.product_title ?? "Unknown Product",
          brand: "AliExpress",
          price: Math.round(salePrice),
          originalPrice: originalPrice > 0 ? Math.round(originalPrice) : null,
          currency: "₪",
          img: p.product_main_image_url ?? "",
          category,
          aliexpressUrl: p.product_detail_url ?? "",
          aliexpressSku: p.product_id ?? "",
          matchScore: Math.round((parseFloat(p.evaluate_rate || "0.9")) * 100),
        };
      });

      // Server-side apparel + footwear filtering for accessories searches
      const APPAREL_KEYWORDS = /\b(shirt|pants|dress|hoodie|jacket|sweater|jeans|shorts|skirt|blouse|coat|t-shirt|tank\s*top|underwear|shoes|socks|sneakers|boots|sandals|חולצה|מכנסיים|שמלה|נעליים|גרביים|מעיל|בגד|גופייה)\b/i;
      // Men's keywords — discard when gender is female
      const MENS_KEYWORDS = /\b(men|man|male|גברים|גבר|mens)\b/i;
      // Women's keywords — discard when gender is male
      const WOMENS_KEYWORDS = /\b(women|woman|female|lady|נשים|אישה)\b/i;
      // Footwear keywords — discard under clothing category
      const FOOTWEAR_KEYWORDS = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|flat|flats|loafer|loafers|pump|pumps|trainer|trainers|slipper|slippers|oxford|running|cleat|cleats|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i;

      const filteredProducts = mapped.filter((p) => {
        // Strict gender isolation
        if (isFemaleSearch && MENS_KEYWORDS.test(p.name)) return false;
        if (isMaleSearch && WOMENS_KEYWORDS.test(p.name)) return false;
        // Clothing tab: exclude footwear
        if (isClothingSearch && FOOTWEAR_KEYWORDS.test(p.name)) return false;
        // Accessories tab: exclude apparel/footwear
        if (isAccessoriesSearch && APPAREL_KEYWORDS.test(p.name)) return false;
        return true;
      });

      return new Response(
        JSON.stringify({ products: filteredProducts, count: filteredProducts.length, page: pageNo }),
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
        target_currency: "ILS",
        target_language: "HE",
      });

      const details = (result as Record<string, unknown>)?.aliexpress_affiliate_productdetail_get_response
        ?.resp_result?.result ?? null;

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

      const links = (result as Record<string, unknown>)?.aliexpress_affiliate_link_generate_response
        ?.resp_result?.result?.promotion_links ?? null;

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
          target_currency: "ILS",
          target_language: "HE",
        });

        const products: AliExpressProduct[] =
          (result as Record<string, unknown>)?.aliexpress_affiliate_product_query_response
            ?.resp_result?.result?.products?.product ?? [];

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
              target_sale_price: p.target_sale_price,
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
    console.error("[ALIEXPRESS] Handler error:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
