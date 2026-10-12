// Temu product search edge function.
// Tries live Temu API/scraping first to get real product page URLs.
// Falls back to a curated catalog in the temu_products Supabase table.

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

// ── Live API attempts ────────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.temu.com/",
  "Origin": "https://www.temu.com",
};

// Attempt 1: Temu's search API (returns JSON with product list)
async function trySearchApi(keywords: string, page: number, pageSize: number): Promise<CatalogProduct[]> {
  const searchUrl = `https://www.temu.com/api/search/v2/search?q=${encodeURIComponent(keywords)}&page=${page}&pageSize=${pageSize}`;

  try {
    const response = await fetch(searchUrl, { headers: BROWSER_HEADERS, redirect: "manual" });
    if (response.status !== 200) {
      console.log(`[TEMU] Search API blocked: HTTP ${response.status}`);
      return [];
    }
    const text = await response.text();
    if (text.length < 100) {
      console.log(`[TEMU] Search API returned empty/short response`);
      return [];
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { return []; }

    const products = extractProductsFromApi(data, pageSize);
    if (products.length > 0) {
      console.log(`[TEMU] Search API succeeded: ${products.length} products`);
    }
    return products;
  } catch (err) {
    console.log(`[TEMU] Search API error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// Attempt 2: Scrape Temu's HTML search page and extract embedded product JSON
async function tryHtmlScrape(keywords: string, page: number, pageSize: number): Promise<CatalogProduct[]> {
  const searchUrl = `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(keywords)}&page=${page}`;
  const headers = {
    ...BROWSER_HEADERS,
    "Accept": "text/html,application/xhtml+xml",
  };

  try {
    const response = await fetch(searchUrl, { headers, redirect: "manual" });
    if (response.status !== 200) {
      console.log(`[TEMU] HTML scrape blocked: HTTP ${response.status}`);
      return [];
    }
    const html = await response.text();
    if (html.length < 500) {
      console.log(`[TEMU] HTML scrape returned short response`);
      return [];
    }
    const products = extractProductsFromHtml(html, pageSize);
    if (products.length > 0) {
      console.log(`[TEMU] HTML scrape succeeded: ${products.length} products`);
    }
    return products;
  } catch (err) {
    console.log(`[TEMU] HTML scrape error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// Extract products from Temu JSON API response
function extractProductsFromApi(data: Record<string, unknown>, pageSize: number): CatalogProduct[] {
  const products: CatalogProduct[] = [];

  const candidates: Record<string, unknown>[] = [];

  // Try various paths where product arrays might live
  const dataRoot = (data as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (dataRoot?.items && Array.isArray(dataRoot.items)) {
    candidates.push(...(dataRoot.items as Record<string, unknown>[]));
  }
  if (dataRoot?.goods_list && Array.isArray(dataRoot.goods_list)) {
    candidates.push(...(dataRoot.goods_list as Record<string, unknown>[]));
  }
  if (dataRoot?.results && Array.isArray(dataRoot.results)) {
    candidates.push(...(dataRoot.results as Record<string, unknown>[]));
  }
  if ((data as Record<string, unknown>).goods_list && Array.isArray((data as Record<string, unknown>).goods_list)) {
    candidates.push(...((data as Record<string, unknown>).goods_list as Record<string, unknown>[]));
  }

  for (const item of candidates) {
    if (products.length >= pageSize) break;
    const product = extractSingleProduct(item);
    if (product) products.push(product);
  }

  return products;
}

function extractSingleProduct(item: Record<string, unknown>): CatalogProduct | null {
  const goodsId = String(item.goods_id ?? item.goodsId ?? item.goodsIdStr ?? item.id ?? "");
  if (!goodsId) return null;

  const title = String(item.goods_name ?? item.goodsName ?? item.title ?? item.name ?? "");
  if (!title) return null;

  const imgVal = String(item.thumb ?? item.image ?? item.imageUrl ?? item.image_url ?? item.goods_image ?? "");
  const imageUrl = imgVal.startsWith("//") ? `https:${imgVal}` : imgVal.startsWith("http") ? imgVal : "";

  let price = 0;
  const minPrice = item.min_normal_price ?? item.min_group_price ?? item.salePrice ?? item.price;
  if (typeof minPrice === "number") {
    price = minPrice / 100;
  } else if (typeof minPrice === "string") {
    const match = String(minPrice).match(/[\d.]+/);
    if (match) price = parseFloat(match[1]);
  }

  // Build direct Temu product URL
  const productUrl = `https://www.temu.com/goods-${goodsId}.html`;

  return {
    productId: goodsId,
    title,
    brand: "Temu",
    price,
    currency: "USD",
    imageUrl,
    productUrl,
    category: String(item.cat_name ?? item.category ?? ""),
    sku: goodsId,
    sizes: [],
    rating: null,
    reviewsCount: null,
  };
}

function extractProductsFromHtml(html: string, pageSize: number): CatalogProduct[] {
  const products: CatalogProduct[] = [];

  // Try to find product data in embedded JSON (window.__INITIAL_STATE__ or similar)
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*<\/script>/s);
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1]);
      const search = state.search ?? state.store?.search ?? {};
      const items = search.items ?? search.goodsList ?? search.results ?? [];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (products.length >= pageSize) break;
          const product = extractSingleProduct(item as Record<string, unknown>);
          if (product) products.push(product);
        }
        if (products.length > 0) return products;
      }
    } catch { /* fall through */ }
  }

  // Fallback: regex extraction of goods_id and goods_name
  const goodsIdRe = /"goods_id"\s*:\s*"?(\d+)"?[^}]*?"goods_name"\s*:\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = goodsIdRe.exec(html)) !== null && products.length < pageSize) {
    const goodsId = m[1];
    const name = m[2];
    const nearbyHtml = html.substring(Math.max(0, m.index - 100), m.index + 1500);
    const imgMatch = nearbyHtml.match(/"thumb"\s*:\s*"(https?:[^"]+|\/\/[^"]+)"/);
    const priceMatch = nearbyHtml.match(/"min_normal_price"\s*:\s*(\d+)/);

    products.push({
      productId: goodsId,
      title: name.replace(/&amp;/g, "&"),
      brand: "Temu",
      price: priceMatch ? parseInt(priceMatch[1]) / 100 : 0,
      currency: "USD",
      imageUrl: imgMatch ? (imgMatch[1].startsWith("//") ? `https:${imgMatch[1]}` : imgMatch[1]) : "",
      productUrl: `https://www.temu.com/goods-${goodsId}.html`,
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
    console.error("[TEMU] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }
  return createClient(url, key);
}

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
  if (/\b(accessory|accessories|case|charger|cable|watch|band|phone|earbuds|gadget|bag|necklace|sunglasses|hat|belt|earrings|scrunchie|headband)\b/.test(lower)) {
    category = "accessories";
  }

  if (/\b(women|woman|female|girl|lady|women's)\b/.test(lower)) {
    gender = "women";
  }
  if (/\b(men|man|male|boy|men's)\b/.test(lower)) {
    gender = "men";
  }

  const terms = lower.split(/\s+/).filter((t) => t.length >= 2);
  return { category, gender, terms };
}

function rowToProduct(row: Record<string, unknown>): CatalogProduct {
  return {
    productId: String(row.goods_id ?? ""),
    title: String(row.title ?? ""),
    brand: String(row.brand ?? "Temu"),
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

async function fetchFromCatalog(
  keywords: string,
  page: number,
  pageSize: number
): Promise<CatalogProduct[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { category, gender, terms } = parseKeywords(keywords);

  let query = supabase
    .from("temu_products")
    .select("goods_id, title, brand, price, original_price, currency, image_url, product_url, category, gender, sizes, search_keywords");

  if (category) {
    query = query.eq("category", category);
  }

  if (gender) {
    query = query.in("gender", [gender, "unisex"]);
  }

  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data, error } = await query;

  if (error) {
    console.error(`[TEMU] Catalog query error: ${error.message}`);
    return [];
  }

  if (!data || data.length === 0) {
    console.log(`[TEMU] No catalog results with filters, trying unfiltered...`);
    const { data: allData, error: allError } = await supabase
      .from("temu_products")
      .select("goods_id, title, brand, price, original_price, currency, image_url, product_url, category, gender, sizes, search_keywords")
      .range(offset, offset + pageSize - 1);

    if (allError || !allData) return [];
    return allData.map(rowToProduct);
  }

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

    console.log(`[TEMU] Search: keywords="${keywords}", page=${page}, pageSize=${pageSize}`);

    // 1. Try JSON search API
    let products = await trySearchApi(keywords, page, pageSize);
    if (products.length > 0) {
      return okResponse({ products, count: products.length, source: "search_api" });
    }

    // 2. Try HTML scrape
    products = await tryHtmlScrape(keywords, page, pageSize);
    if (products.length > 0) {
      return okResponse({ products, count: products.length, source: "html_scrape" });
    }

    // 3. Fall back to curated catalog
    console.log(`[TEMU] All live attempts failed, falling back to catalog...`);
    products = await fetchFromCatalog(keywords, page, pageSize);
    console.log(`[TEMU] Catalog returned ${products.length} products`);

    if (products.length === 0) {
      console.warn(`[TEMU] No products found for "${keywords}" in catalog`);
      return okResponse({ products: [], count: 0, source: "empty" });
    }

    return okResponse({ products, count: products.length, source: "catalog" });
  } catch (err) {
    console.error("[TEMU] Edge function error:", err);
    return errorResponse(err instanceof Error ? err.message : "Search failed");
  }
});
