import { createHash } from "node:crypto";

// Fitgura AliExpress Affiliate API proxy — Beijing timezone, ILS currency, detailed error surfacing
// IMPORTANT: This function NEVER returns a non-2xx status code.
// All errors are returned as HTTP 200 with { error: "...", products: [] } in the JSON body.
// Returning 4xx/5xx causes the Supabase client SDK to throw FunctionsHttpError.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function okResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, extra: Record<string, unknown> = {}): Response {
  return okResponse({ error: message, products: [], ...extra });
}

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
  promotion_link?: string;
}

async function generateAffiliateLinks(sourceValues: string[]): Promise<Map<string, string>> {
  const linkMap = new Map<string, string>();
  if (sourceValues.length === 0) return linkMap;

  // Batch in groups of 40 to stay within API limits
  const BATCH_SIZE = 40;
  const batches: string[][] = [];
  for (let i = 0; i < sourceValues.length; i += BATCH_SIZE) {
    batches.push(sourceValues.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    try {
      const result = await callAliExpressApi("aliexpress.affiliate.link.generate", {
        promotion_link_type: 0,
        source_values: batch.join(","),
      });

      const links = (result as Record<string, unknown>)?.aliexpress_affiliate_link_generate_response
        ?.resp_result?.result?.promotion_links as { promotion_link?: string; source_values?: string }[] | undefined;

      if (Array.isArray(links)) {
        for (const link of links) {
          if (link.promotion_link && link.source_values) {
            linkMap.set(link.source_values, link.promotion_link);
          }
        }
      }
    } catch (err) {
      console.error("[ALIEXPRESS] Affiliate link generation failed for batch:", err instanceof Error ? err.message : err);
    }
  }

  return linkMap;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action ?? "search";

    if (action === "search") {
      const keywords = body.keywords as string | undefined;
      const categoryIds = body.categoryIds as string | undefined;

      if (!keywords && !categoryIds) {
        return errorResponse("Missing keywords or categoryIds");
      }

      const pageNo = body.pageNo ?? 1;
      const pageSize = body.pageSize ?? 50;
      const targetLanguage = "HE";
      const sort = body.sort as string | undefined;

      const gender = body.gender as string | undefined;
      const genderPrefix = gender === "male" ? "men " : gender === "female" ? "women " : "";
      const isFemaleSearch = gender === "female";
      const isMaleSearch = gender === "male";
      const isClothingSearch = categoryIds === "200000783,200000782";
      const searchKeywords = keywords ?? "";
      const shoesTerms = ["shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "heel", "heels", "sandal", "sandals", "slipper", "slippers", "loafer", "loafers", "wedge", "wedges", "pump", "pumps", "footwear"];
      const isShoesSearch = shoesTerms.some((t) => searchKeywords.toLowerCase().includes(t));

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
      if (sort) {
        apiParams.sort = sort;
      } else {
        apiParams.sort = "VOLUME_DOWN";
      }

      const isAccessoriesSearch = categoryIds === "5090301,509" || categoryIds === "509";
      if (isAccessoriesSearch) {
        console.log("[ALIEXPRESS] Accessories search — apparel will be filtered out");
      }

      console.log("[ALIEXPRESS] Search params:", { keywords: searchKeywords, categoryIds, pageNo, pageSize, targetLanguage });

      let result = await callAliExpressApi("aliexpress.affiliate.product.query", apiParams);

      let products: AliExpressProduct[] =
        (result as Record<string, unknown>)?.aliexpress_affiliate_product_query_response
          ?.resp_result?.result?.products?.product ?? [];

      // Fallback: if HE-language search returned no results, retry without target_language
      if (products.length === 0) {
        console.log("[ALIEXPRESS] No results with target_language=HE, retrying without language filter");
        const noLangParams: RequestParams = {
          page_no: pageNo,
          page_size: pageSize,
          target_currency: "ILS",
        };
        if (searchKeywords) noLangParams.keywords = searchKeywords;
        if (categoryIds) noLangParams.category_ids = categoryIds;
        noLangParams.sort = sort || "VOLUME_DOWN";
        result = await callAliExpressApi("aliexpress.affiliate.product.query", noLangParams);
        products =
          (result as Record<string, unknown>)?.aliexpress_affiliate_product_query_response
            ?.resp_result?.result?.products?.product ?? [];
      }

      // Fallback: if category_ids returned no results, retry with keywords only
      if (products.length === 0 && categoryIds && searchKeywords) {
        console.log("[ALIEXPRESS] No results with category_ids, retrying with keywords only:", searchKeywords);
        const fallbackParams: RequestParams = {
          page_no: pageNo,
          page_size: pageSize,
          target_currency: "ILS",
          keywords: searchKeywords,
          sort: sort || "VOLUME_DOWN",
        };
        result = await callAliExpressApi("aliexpress.affiliate.product.query", fallbackParams);
        products =
          (result as Record<string, unknown>)?.aliexpress_affiliate_product_query_response
            ?.resp_result?.result?.products?.product ?? [];
      }

      // Fallback: if still no results and keywords were used, try a simpler keyword
      if (products.length === 0 && searchKeywords) {
        const simpleKeyword = isAccessoriesSearch ? "phone case cover" : isShoesSearch ? "shoe" : "fashion clothing";
        console.log("[ALIEXPRESS] Still no results, retrying with simple keyword:", simpleKeyword);
        const fallbackParams: RequestParams = {
          page_no: pageNo,
          page_size: pageSize,
          target_currency: "ILS",
          keywords: genderPrefix + simpleKeyword,
          sort: sort || "VOLUME_DOWN",
        };
        result = await callAliExpressApi("aliexpress.affiliate.product.query", fallbackParams);
        products =
          (result as Record<string, unknown>)?.aliexpress_affiliate_product_query_response
            ?.resp_result?.result?.products?.product ?? [];
      }

      const mapped = products.map((p) => {
        const salePrice = parseFloat(p.target_sale_price || p.app_sale_price || "0");
        const originalPrice = parseFloat(p.target_original_price || "0");
        let category = "clothing";
        if (categoryIds) {
          if (/200000832|200000831|200000835/.test(categoryIds)) category = "shoes";
          else if (/200000788|200000785|200001661|5090301|509/.test(categoryIds)) category = "accessories";
          else category = "clothing";
        } else if (isShoesSearch) {
          category = "shoes";
        } else if (isAccessoriesSearch) {
          category = "accessories";
        }
        const evaluateRate = parseFloat(p.evaluate_rate || "0");
        const volume = p.lastest_volume ?? 0;
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
          promotionLink: p.promotion_link ?? null,
          matchScore: Math.round((evaluateRate || 0.9) * 100),
          ordersCount: volume,
          volume: volume,
          evaluateRate: evaluateRate,
        };
      });

      // Generate affiliate links for ALL products via the official AliExpress Affiliate API
      const allProductUrls = mapped
        .filter((p) => p.aliexpressUrl)
        .map((p) => p.aliexpressUrl);

      if (allProductUrls.length > 0) {
        console.log("[ALIEXPRESS] Generating affiliate links for", allProductUrls.length, "products");
        const linkMap = await generateAffiliateLinks(allProductUrls);
        for (const p of mapped) {
          if (p.aliexpressUrl && linkMap.has(p.aliexpressUrl)) {
            p.promotionLink = linkMap.get(p.aliexpressUrl) ?? null;
          }
        }
      }

      // Server-side filtering with strict gender + category isolation
      const APPAREL_KEYWORDS = /\b(dress|skirt|suit|bra|lingerie|panties|shirt|blouse|jacket|coat|pants|trouser|hoodie|sweater|jeans|shorts|top|t-shirt|שמלה|חצאית|חליפה|חולצה|מעיל|מכנסיים|בגד)\b/i;
      const MENS_KEYWORDS = /\b(men|mens|male|boy|man|גברים|גבר)\b/i;
      const WOMENS_KEYWORDS = /\b(women|womens|female|girl|lady|ladies|נשים|אישה)\b/i;
      const FOOTWEAR_KEYWORDS = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|slipper|slippers|footwear|pump|pumps|loafer|loafers|wedge|wedges|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i;

      const BOTH_GENDERS_REGEX = /\b(men|mens|male|boy|man).*(women|womens|female|girl|lady|ladies)\b|\b(women|womens|female|girl|lady|ladies).*(men|mens|male|boy|man)\b/i;

      const filteredProducts = mapped.filter((p) => {
        if (isFemaleSearch && MENS_KEYWORDS.test(p.name)) return false;
        if (isMaleSearch && WOMENS_KEYWORDS.test(p.name)) return false;
        if ((isFemaleSearch || isMaleSearch) && BOTH_GENDERS_REGEX.test(p.name)) return false;
        if (isClothingSearch && FOOTWEAR_KEYWORDS.test(p.name)) return false;
        if (isShoesSearch) {
          if (APPAREL_KEYWORDS.test(p.name) && !FOOTWEAR_KEYWORDS.test(p.name)) return false;
        }
        if (isAccessoriesSearch && (APPAREL_KEYWORDS.test(p.name) || FOOTWEAR_KEYWORDS.test(p.name))) return false;
        if ((p.ordersCount ?? 0) === 0 && (p.evaluateRate ?? 0) < 0.9) return false;
        return true;
      });

      filteredProducts.sort((a, b) => {
        const salesA = a.ordersCount ?? a.volume ?? 0;
        const salesB = b.ordersCount ?? b.volume ?? 0;
        const ratingA = a.evaluateRate ?? 0;
        const ratingB = b.evaluateRate ?? 0;
        return (salesB - salesA) || (ratingB - ratingA);
      });

      return okResponse({ products: filteredProducts, count: filteredProducts.length, page: pageNo });
    }

    if (action === "details") {
      const productIds = body.productIds as string[];
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return errorResponse("Missing productIds", { details: null });
      }

      const result = await callAliExpressApi("aliexpress.affiliate.productdetail.get", {
        product_ids: productIds.join(","),
        target_currency: "ILS",
        target_language: "HE",
      });

      const details = (result as Record<string, unknown>)?.aliexpress_affiliate_productdetail_get_response
        ?.resp_result?.result ?? null;

      return okResponse({ details });
    }

    if (action === "affiliate-link") {
      const sourceUrl = body.sourceUrl as string;
      if (!sourceUrl) {
        return errorResponse("Missing sourceUrl", { links: null });
      }

      const result = await callAliExpressApi("aliexpress.affiliate.link.generate", {
        promotion_link_type: 0,
        source_values: sourceUrl,
      });

      const links = (result as Record<string, unknown>)?.aliexpress_affiliate_link_generate_response
        ?.resp_result?.result?.promotion_links ?? null;

      return okResponse({ links });
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

        return okResponse({
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
        });
      } catch (testErr) {
        return okResponse({
          envAudit,
          missingVars: missing,
          connectivity: "failed",
          error: testErr instanceof Error ? testErr.message : "Unknown error",
        });
      }
    }

    return errorResponse(`Unknown action: ${action}`);
  } catch (err) {
    console.error("[ALIEXPRESS] Handler error:", err instanceof Error ? err.message : err);
    return errorResponse(err instanceof Error ? err.message : "Internal server error");
  }
});
