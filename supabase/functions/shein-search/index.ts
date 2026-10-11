// SHEIN product search edge function.
// SHEIN blocks all server-side HTTP access with aggressive bot protection
// (CAPTCHA challenges on every page — search, category, PDP, API endpoints).
// This function tries live scraping first, then falls back to a curated
// product catalog stored in the shein_products Supabase table.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CatalogProduct {
  productId: string;
  title: string;
  brand: string;
  price: number;
  currency: string;
  imageUrl: string;
  productUrl: string;
  category: string;
  sku: string;
  sizes: string[];
  rating: number | null;
  reviewsCount: number | null;
}

function okResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string): Response {
  return okResponse({ error: message, products: [] });
}

// ── Live scraping attempt ───────────────────────────────────────────────────
// Tries to fetch SHEIN pages directly. This will almost certainly fail due
// to SHEIN's bot protection, but we try anyway in case the protection is
// temporarily down or the IP is not flagged.

async function tryLiveScrape(keywords: string, page: number, pageSize: number): Promise<CatalogProduct[]> {
  const searchUrl = `https://us.shein.com/pdsearch/${encodeURIComponent(keywords)}/?page=${page}`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
  };

  try {
    const response = await fetch(searchUrl, { headers, redirect: "manual" });
    // SHEIN returns 302 to /risk/challenge — a non-redirect 200 means we got through
    if (response.status !== 200) {
      console.log(`[SHEIN] Live scrape blocked: HTTP ${response.status}`);
      return [];
    }
    const html = await response.text();
    if (html.includes("risk/challenge") || html.includes("captcha")) {
      console.log(`[SHEIN] Live scrape got challenge page`);
      return [];
    }
    // If we somehow got through, extract products from embedded JSON
    const products = extractProductsFromHtml(html, pageSize);
    if (products.length > 0) {
      console.log(`[SHEIN] Live scrape succeeded: ${products.length} products`);
    }
    return products;
  } catch (err) {
    console.log(`[SHEIN] Live scrape error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function extractProductsFromHtml(html: string, pageSize: number): CatalogProduct[] {
  // Extract product data from embedded JSON in script tags
  const products: CatalogProduct[] = [];
  const goodsIdRe = /"goods_id"\s*:\s*"?(\d+)"?[^}]*?"goods_name"\s*:\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = goodsIdRe.exec(html)) !== null && products.length < pageSize) {
    const goodsId = m[1];
    const name = m[2];
    // Try to find price and image near this product
    const nearbyHtml = html.substring(Math.max(0, m.index - 200), m.index + 2000);
    const priceMatch = nearbyHtml.match(/"retail_price"[^}]*?"amountWithSymbol"\s*:\s*"\$?([0-9.]+)"/);
    const imgMatch = nearbyHtml.match(/"goods_img"\s*:\s*"(\/\/[^"]+)"/);
    const urlNameMatch = nearbyHtml.match(/"goods_url_name"\s*:\s*"([^"]+)"/);

    products.push({
      productId: goodsId,
      title: name,
      brand: "SHEIN",
      price: priceMatch ? parseFloat(priceMatch[1]) : 0,
      currency: "USD",
      imageUrl: imgMatch ? `https:${imgMatch[1]}` : "",
      productUrl: `https://us.shein.com/${urlNameMatch?.[1] || "product"}-p-${goodsId}.html`,
      category: "",
      sku: goodsId,
      sizes: [],
      rating: null,
      reviewsCount: null,
    });
  }
  return products;
}

// ── Supabase catalog fallback ───────────────────────────────────────────────

function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("[SHEIN] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }
  return createClient(url, key);
}

// Map search keywords to catalog categories and genders
function parseKeywords(keywords: string): { category: string | null; gender: string | null; terms: string[] } {
  const lower = keywords.toLowerCase();
  let category: string | null = null;
  let gender: string | null = null;

  if (/\b(dress|dresses|clothing|shirt|pants|jeans|jacket|coat|top|blouse|blazer|skirt|sweater|hoodie|knit)\b/.test(lower)) {
    category = "clothing";
  }
  if (/\b(shoe|shoes|sneaker|sneakers|boot|boots|sandal|sandals|heel|heels|footwear)\b/.test(lower)) {
    category = "shoes";
  }
  if (/\b(accessory|accessories|case|charger|cable|watch|band|phone|earbuds|gadget)\b/.test(lower)) {
    category = "accessories";
  }

  if (/\b(women|woman|female|girl|lady|women\'s)\b/.test(lower)) {
    gender = "women";
  }
  if (/\b(men|man|male|boy|men\'s)\b/.test(lower)) {
    gender = "men";
  }

  const terms = lower.split(/\s+/).filter((t) => t.length >= 2);
  return { category, gender, terms };
}

async function fetchFromCatalog(
  keywords: string,
  page: number,
  pageSize: number
): Promise<CatalogProduct[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { category, gender, terms } = parseKeywords(keywords);

  let query = supabase
    .from("shein_products")
    .select("goods_id, title, brand, price, original_price, currency, image_url, product_url, category, gender, sizes, search_keywords");

  // Filter by category if detected
  if (category) {
    query = query.eq("category", category);
  }

  // Filter by gender if detected (but also include unisex)
  if (gender) {
    query = query.in("gender", [gender, "unisex"]);
  }

  // Pagination
  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data, error } = await query;

  if (error) {
    console.error(`[SHEIN] Catalog query error: ${error.message}`);
    return [];
  }

  if (!data || data.length === 0) {
    // If no results with category/gender filter, try without filters
    console.log(`[SHEIN] No catalog results with filters, trying unfiltered...`);
    const { data: allData, error: allError } = await supabase
      .from("shein_products")
      .select("goods_id, title, brand, price, original_price, currency, image_url, product_url, category, gender, sizes, search_keywords")
      .range(offset, offset + pageSize - 1);

    if (allError || !allData) return [];
    return allData.map(rowToProduct);
  }

  // If we have search terms, sort by keyword match relevance
  if (terms.length > 0) {
    const sorted = [...data].sort((a, b) => {
      const aKeywords = (a.search_keywords || []).join(" ");
      const bKeywords = (b.search_keywords || []).join(" ");
      const aScore = terms.filter((t) => aKeywords.includes(t)).length;
      const bScore = terms.filter((t) => bKeywords.includes(t)).length;
      return bScore - aScore;
    });
    return sorted.map(rowToProduct);
  }

  return data.map(rowToProduct);
}

function rowToProduct(row: Record<string, unknown>): CatalogProduct {
  return {
    productId: String(row.goods_id ?? ""),
    title: String(row.title ?? ""),
    brand: String(row.brand ?? "SHEIN"),
    price: Number(row.price ?? 0),
    currency: String(row.currency ?? "USD"),
    imageUrl: String(row.image_url ?? ""),
    productUrl: String(row.product_url ?? ""),
    category: String(row.category ?? ""),
    sku: String(row.goods_id ?? ""),
    sizes: Array.isArray(row.sizes) ? row.sizes as string[] : [],
    rating: null,
    reviewsCount: null,
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("Only POST is supported");
  }

  try {
    const body = await req.json() as { keywords?: string; page?: number; pageSize?: number };
    const keywords = (body.keywords ?? "").trim();
    const page = Math.max(1, Math.min(body.page ?? 1, 100));
    const pageSize = Math.min(body.pageSize ?? 40, 80);

    if (!keywords) return errorResponse("keywords is required");

    console.log(`[SHEIN] Search: keywords="${keywords}", page=${page}, pageSize=${pageSize}`);

    // 1. Try live scraping (will almost certainly fail due to bot protection)
    let products = await tryLiveScrape(keywords, page, pageSize);
    if (products.length > 0) {
      console.log(`[SHEIN] Live scrape returned ${products.length} products`);
      return okResponse({ products, count: products.length, source: "live" });
    }

    // 2. Fall back to curated catalog in Supabase
    console.log(`[SHEIN] Live scrape failed, falling back to catalog...`);
    products = await fetchFromCatalog(keywords, page, pageSize);
    console.log(`[SHEIN] Catalog returned ${products.length} products`);

    if (products.length === 0) {
      console.warn(`[SHEIN] No products found for "${keywords}" in catalog`);
      return okResponse({ products: [], count: 0, source: "empty" });
    }

    return okResponse({ products, count: products.length, source: "catalog" });
  } catch (err) {
    console.error("[SHEIN] Edge function error:", err);
    return errorResponse(err instanceof Error ? err.message : "Search failed");
  }
});
