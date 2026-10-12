// SHEIN product search edge function.
// Tries multiple SHEIN API endpoints that return JSON product data.
// Falls back to a curated catalog in the shein_products Supabase table.

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
  "Referer": "https://us.shein.com/",
  "Origin": "https://us.shein.com",
};

// Attempt 1: SHEIN's internal search API (returns JSON with product list)
async function trySearchApi(keywords: string, page: number, pageSize: number): Promise<CatalogProduct[]> {
  const searchUrl = `https://us.shein.com/xhr/search/products?search_type=item&keyword=${encodeURIComponent(keywords)}&page=${page}&page_size=${pageSize}&sort=recommend&language=en&currency=USD`;

  try {
    const response = await fetch(searchUrl, { headers: BROWSER_HEADERS, redirect: "manual" });
    if (response.status !== 200) {
      console.log(`[SHEIN] Search API blocked: HTTP ${response.status}`);
      return [];
    }
    const text = await response.text();
    if (text.includes("risk/challenge") || text.includes("captcha") || text.length < 100) {
      console.log(`[SHEIN] Search API got challenge/captcha response`);
      return [];
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { return []; }

    const products = extractProductsFromApi(data, pageSize);
    if (products.length > 0) {
      console.log(`[SHEIN] Search API succeeded: ${products.length} products`);
    }
    return products;
  } catch (err) {
    console.log(`[SHEIN] Search API error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// Attempt 2: SHEIN's catalog/category API
async function tryCategoryApi(keywords: string, page: number, pageSize: number): Promise<CatalogProduct[]> {
  const categoryMap: Record<string, string> = {
    "women fashion": "1779",
    "women clothing": "1779",
    "men clothing": "1880",
    "men fashion": "1880",
    "women shoes": "1744",
    "men shoes": "1878",
    "women accessories": "1727",
    "men accessories": "1884",
  };
  const catId = categoryMap[keywords.toLowerCase()] || "1779";
  const url = `https://us.shein.com/xhr/catalog/products?category_id=${catId}&page=${page}&page_size=${pageSize}&sort=recommend&language=en&currency=USD`;

  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: "manual" });
    if (response.status !== 200) {
      console.log(`[SHEIN] Category API blocked: HTTP ${response.status}`);
      return [];
    }
    const text = await response.text();
    if (text.includes("risk/challenge") || text.includes("captcha") || text.length < 100) {
      console.log(`[SHEIN] Category API got challenge/captcha response`);
      return [];
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { return []; }

    const products = extractProductsFromApi(data, pageSize);
    if (products.length > 0) {
      console.log(`[SHEIN] Category API succeeded: ${products.length} products`);
    }
    return products;
  } catch (err) {
    console.log(`[SHEIN] Category API error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// Attempt 3: Scrape the HTML search page and extract embedded product JSON
async function tryHtmlScrape(keywords: string, page: number, pageSize: number): Promise<CatalogProduct[]> {
  const searchUrl = `https://us.shein.com/pdsearch/${encodeURIComponent(keywords)}/?page=${page}`;
  const headers = {
    ...BROWSER_HEADERS,
    "Accept": "text/html,application/xhtml+xml",
  };

  try {
    const response = await fetch(searchUrl, { headers, redirect: "manual" });
    if (response.status !== 200) {
      console.log(`[SHEIN] HTML scrape blocked: HTTP ${response.status}`);
      return [];
    }
    const html = await response.text();
    if (html.includes("risk/challenge") || html.includes("captcha")) {
      console.log(`[SHEIN] HTML scrape got challenge page`);
      return [];
    }
    const products = extractProductsFromHtml(html, pageSize);
    if (products.length > 0) {
      console.log(`[SHEIN] HTML scrape succeeded: ${products.length} products`);
    }
    return products;
  } catch (err) {
    console.log(`[SHEIN] HTML scrape error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// Extract products from SHEIN JSON API response (handles multiple response shapes)
function extractProductsFromApi(data: Record<string, unknown>, pageSize: number): CatalogProduct[] {
  const products: CatalogProduct[] = [];

  // Try various paths where product arrays might live
  const candidates: Record<string, unknown>[] = [];

  // Shape 1: data.products -> info -> products
  const productsRoot = (data as Record<string, unknown>).products as Record<string, unknown> | undefined;
  if (productsRoot?.products) {
    candidates.push(...(productsRoot.products as Record<string, unknown>[]));
  }
  // Shape 2: data.info -> products
  if (productsRoot?.info) {
    const info = productsRoot.info as Record<string, unknown>;
    if (Array.isArray(info.products)) {
      candidates.push(...(info.products as Record<string, unknown>[]));
    }
  }
  // Shape 3: data.data -> products
  const dataRoot = (data as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (dataRoot?.products) {
    candidates.push(...(dataRoot.products as Record<string, unknown>[]));
  }
  // Shape 4: data.goods_list
  if (Array.isArray((data as Record<string, unknown>).goods_list)) {
    candidates.push(...((data as Record<string, unknown>).goods_list as Record<string, unknown>[]));
  }
  // Shape 5: data.list
  if (Array.isArray((data as Record<string, unknown>).list)) {
    candidates.push(...((data as Record<string, unknown>).list as Record<string, unknown>[]));
  }

  for (const item of candidates) {
    if (products.length >= pageSize) break;
    const product = extractSingleProduct(item);
    if (product) products.push(product);
  }

  return products;
}

function extractSingleProduct(item: Record<string, unknown>): CatalogProduct | null {
  const goodsId = String(item.goods_id ?? item.goodsId ?? item.product_id ?? item.id ?? "");
  if (!goodsId) return null;

  const rawName = String(item.goods_name ?? item.goodsName ?? item.title ?? item.name ?? "");
  if (!rawName) return null;
  // Clean HTML entities from name
  const title = rawName.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

  const goodsImg = String(item.goods_img ?? item.goodsImg ?? item.goods_thumb ?? item.imageUrl ?? item.image_url ?? "");
  const imageUrl = goodsImg.startsWith("//") ? `https:${goodsImg}` : goodsImg.startsWith("http") ? goodsImg : "";

  // Price: try multiple paths
  let price = 0;
  const retailPrice = item.retail_price ?? item.retailPrice ?? item.price ?? item.salePrice ?? item.sale_price;
  if (typeof retailPrice === "object" && retailPrice !== null) {
    const amountWithSymbol = (retailPrice as Record<string, unknown>).amountWithSymbol;
    if (typeof amountWithSymbol === "string") {
      const match = amountWithSymbol.match(/[\d.]+/);
      if (match) price = parseFloat(match[0]);
    }
    const amount = (retailPrice as Record<string, unknown>).amount;
    if (!price && typeof amount === "number") price = amount;
  } else if (typeof retailPrice === "number") {
    price = retailPrice;
  } else if (typeof retailPrice === "string") {
    const match = String(retailPrice).match(/[\d.]+/);
    if (match) price = parseFloat(match[0]);
  }

  // Build PDP URL from goods_url_name or goods_id
  const goodsUrlName = String(item.goods_url_name ?? item.goodsUrlName ?? "");
  const productUrl = goodsUrlName
    ? `https://us.shein.com/${goodsUrlName}-p-${goodsId}.html`
    : `https://us.shein.com/product-p-${goodsId}.html`;

  // Sizes
  let sizes: string[] = [];
  const sizesAttr = item.goods_attr ?? item.sizes ?? item.sizeList;
  if (Array.isArray(sizesAttr)) {
    sizes = sizesAttr.map((s: unknown) => typeof s === "string" ? s : String((s as Record<string, unknown>)?.attr_value ?? (s as Record<string, unknown>)?.value ?? "")).filter(Boolean);
  }

  // Rating
  let rating: number | null = null;
  const commentInfo = item.comment_info ?? item.commentInfo;
  if (commentInfo && typeof commentInfo === "object") {
    const star = (commentInfo as Record<string, unknown>).comment_rank_average ?? (commentInfo as Record<string, unknown>).average;
    if (star != null) rating = Number(star) / 100 * 5 || null;
  }
  const reviewsCount = item.comment_num ?? item.commentNum ?? null;

  return {
    productId: goodsId,
    title,
    brand: "SHEIN",
    price,
    currency: "USD",
    imageUrl,
    productUrl,
    category: String(item.cat_name ?? item.category ?? ""),
    sku: goodsId,
    sizes,
    rating,
    reviewsCount: reviewsCount != null ? Number(reviewsCount) : null,
  };
}

function extractProductsFromHtml(html: string, pageSize: number): CatalogProduct[] {
  const products: CatalogProduct[] = [];

  // Try to find the __NUXT__ or window.__INITIAL_STATE__ JSON
  const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*(.+?)(?:<\/script>|$)/s);
  if (nuxtMatch) {
    try {
      // Nuxt data is JS, not JSON — try to extract the products portion
      const nuxtText = nuxtMatch[1];
      const productBlocks = nuxtText.matchAll(/\{[^}]*"goods_id"\s*:\s*"?(\d+)"?[^}]*"goods_name"\s*:\s*"([^"]+)"[^}]*\}/g);
      for (const m of productBlocks) {
        if (products.length >= pageSize) break;
        const goodsId = m[1];
        const name = m[2];
        const block = m[0];
        const priceMatch = block.match(/"retail_price"\s*:\s*\{[^}]*"amountWithSymbol"\s*:\s*"\$?([\d.]+)"/);
        const imgMatch = block.match(/"goods_img"\s*:\s*"(\/\/[^"]+)"/);
        const urlNameMatch = block.match(/"goods_url_name"\s*:\s*"([^"]+)"/);
        products.push({
          productId: goodsId,
          title: name.replace(/&amp;/g, "&"),
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
      if (products.length > 0) return products;
    } catch { /* fall through */ }
  }

  // Fallback: simple regex extraction
  const goodsIdRe = /"goods_id"\s*:\s*"?(\d+)"?[^}]*?"goods_name"\s*:\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = goodsIdRe.exec(html)) !== null && products.length < pageSize) {
    const goodsId = m[1];
    const name = m[2];
    const nearbyHtml = html.substring(Math.max(0, m.index - 200), m.index + 2000);
    const priceMatch = nearbyHtml.match(/"retail_price"[^}]*?"amountWithSymbol"\s*:\s*"\$?([\d.]+)"/);
    const imgMatch = nearbyHtml.match(/"goods_img"\s*:\s*"(\/\/[^"]+)"/);
    const urlNameMatch = nearbyHtml.match(/"goods_url_name"\s*:\s*"([^"]+)"/);

    products.push({
      productId: goodsId,
      title: name.replace(/&amp;/g, "&"),
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
    console.error(`[SHEIN] Catalog query error: ${error.message}`);
    return [];
  }

  if (!data || data.length === 0) {
    console.log(`[SHEIN] No catalog results with filters, trying unfiltered...`);
    const { data: allData, error: allError } = await supabase
      .from("shein_products")
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

    // 1. Try JSON search API
    let products = await trySearchApi(keywords, page, pageSize);
    if (products.length > 0) {
      return okResponse({ products, count: products.length, source: "search_api" });
    }

    // 2. Try category API
    products = await tryCategoryApi(keywords, page, pageSize);
    if (products.length > 0) {
      return okResponse({ products, count: products.length, source: "category_api" });
    }

    // 3. Try HTML scrape
    products = await tryHtmlScrape(keywords, page, pageSize);
    if (products.length > 0) {
      return okResponse({ products, count: products.length, source: "html_scrape" });
    }

    // 4. Fall back to curated catalog
    console.log(`[SHEIN] All live attempts failed, falling back to catalog...`);
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
