// SHEIN product search edge function.
// SHEIN blocks direct API calls and renders products client-side, but the
// SSR HTML includes embedded JSON in <script> tags (Next.js/Nuxt hydration data)
// that contains full product info. This function:
//  1. Tries the internal search API (sometimes works from edge IPs)
//  2. Falls back to fetching the search page HTML and extracting products
//     from embedded JSON blobs + regex-based PDP link extraction
//  3. Falls back to category landing pages (Women, Men, etc.)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RawProduct {
  goods_id: string;
  goods_name: string;
  goods_url_name: string;
  goods_img: string;
  goods_thumb: string;
  retail_price: { amountWithSymbol: string } | null;
  salePrice: { amountWithSymbol: string } | null;
  unit_price: { amountWithSymbol: string } | null;
  brand: string | null;
  cat_name: string | null;
  attr_value_list: { attr_value: string }[] | null;
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

function extractPrice(priceObj: { amountWithSymbol: string } | null | undefined): number {
  if (!priceObj?.amountWithSymbol) return 0;
  const cleaned = priceObj.amountWithSymbol.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function extractSizes(attrList: { attr_value: string }[] | null | undefined): string[] {
  if (!Array.isArray(attrList)) return [];
  const sizes = new Set<string>();
  for (const attr of attrList) {
    if (!attr?.attr_value) continue;
    const val = attr.attr_value.toUpperCase();
    if (/^(XS|S|M|L|XL|2XL|3XL|4XL|5XL|XXL|XXXL|XXXXL)$/.test(val)) {
      sizes.add(val.replace("XXL", "2XL").replace("XXXL", "3XL").replace("XXXXL", "4XL"));
    }
  }
  return Array.from(sizes);
}

function buildPdpUrl(goodsId: string, goodsUrlName: string, goodsName: string): string {
  const slug = goodsUrlName || goodsName?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "product";
  return `https://us.shein.com/${slug}-p-${goodsId}.html`;
}

function normalizeImage(img: string | undefined): string {
  if (!img) return "";
  if (img.startsWith("//")) return `https:${img}`;
  if (img.startsWith("http://")) return img.replace("http://", "https://");
  return img;
}

function normalizeRawProduct(value: unknown): RawProduct | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const goodsId = String(source.goods_id ?? source.goodsId ?? source.product_id ?? source.productId ?? "").trim();
  if (!goodsId) return null;

  const toPriceObject = (price: unknown): { amountWithSymbol: string } | null => {
    if (typeof price === "string" || typeof price === "number") return { amountWithSymbol: String(price) };
    if (price && typeof price === "object") {
      const amount = (price as Record<string, unknown>).amountWithSymbol ?? (price as Record<string, unknown>).amount;
      return amount == null ? null : { amountWithSymbol: String(amount) };
    }
    return null;
  };

  return {
    goods_id: goodsId,
    goods_name: String(source.goods_name ?? source.goodsName ?? source.title ?? "").trim(),
    goods_url_name: String(source.goods_url_name ?? source.goodsUrlName ?? source.url_name ?? "").trim(),
    goods_img: String(source.goods_img ?? source.goodsImg ?? source.image_url ?? source.imageUrl ?? ""),
    goods_thumb: String(source.goods_thumb ?? source.goodsThumb ?? source.thumbnail ?? ""),
    retail_price: toPriceObject(source.retail_price ?? source.retailPrice),
    salePrice: toPriceObject(source.salePrice ?? source.sale_price),
    unit_price: toPriceObject(source.unit_price ?? source.unitPrice),
    brand: source.brand == null ? null : String(source.brand),
    cat_name: source.cat_name == null ? null : String(source.cat_name),
    attr_value_list: Array.isArray(source.attr_value_list) ? source.attr_value_list as { attr_value: string }[] : null,
  };
}

// Deep-search any JSON structure for arrays of product-like objects.
function deepSearchProducts(node: unknown, depth: number): RawProduct[] {
  if (depth > 10) return [];
  if (Array.isArray(node)) {
    const products = node.map(normalizeRawProduct).filter((p): p is RawProduct => p !== null);
    if (products.length > 0) return products;
    for (const item of node) {
      const result = deepSearchProducts(item, depth + 1);
      if (result.length > 0) return result;
    }
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const result = deepSearchProducts(value, depth + 1);
      if (result.length > 0) return result;
    }
  }
  return [];
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Upgrade-Insecure-Requests": "1",
};

// ── Strategy 1: Try SHEIN's internal search API ────────────────────────────
async function searchViaApi(keywords: string, page: number, pageSize: number): Promise<RawProduct[]> {
  const apiUrls = [
    `https://us.shein.com/productapi/search/v3/search?keyword=${encodeURIComponent(keywords)}&page_num=${page}&page_size=${pageSize}&language=en&currency=USD&country=US`,
    `https://www.shein.com/productapi/search/v3/search?keyword=${encodeURIComponent(keywords)}&page_num=${page}&page_size=${pageSize}&language=en&currency=USD&country=US`,
  ];

  for (const url of apiUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://us.shein.com/",
        },
      });
      if (!response.ok) {
        console.log(`[SHEIN] API ${response.status}: ${url.substring(0, 70)}`);
        continue;
      }
      const text = await response.text();
      if (!text || text.length < 20) continue;
      let data: Record<string, unknown>;
      try { data = JSON.parse(text); } catch { continue; }
      const products = deepSearchProducts(data, 0);
      if (products.length > 0) {
        console.log(`[SHEIN] API success: ${products.length} products`);
        return products;
      }
    } catch (err) {
      console.log(`[SHEIN] API error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return [];
}

// ── Strategy 2: Fetch HTML page and extract embedded JSON ──────────────────
// SHEIN's SSR HTML contains <script> tags with large JSON blobs that hold
// product data for client-side hydration. We extract and parse those.

function extractJsonFromScripts(html: string): RawProduct[] {
  const products = new Map<string, RawProduct>();

  // Approach A: Find all <script> tags containing JSON with goods_id fields.
  // SHEIN embeds data like: window.__INITIAL_STATE__ = {...} or <script type="application/json">...
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRe.exec(html)) !== null) {
    const content = scriptMatch[1];
    if (!content || content.length < 50) continue;
    // Only process scripts that mention goods_id or product_id
    if (!content.includes("goods_id") && !content.includes("goodsId") && !content.includes("product_id")) continue;

    // Try to parse the entire script content as JSON
    const parsed = tryParseJson(content);
    if (parsed) {
      const found = deepSearchProducts(parsed, 0);
      for (const p of found) {
        if (!products.has(p.goods_id)) products.set(p.goods_id, p);
      }
    }

    // Also try extracting individual JSON objects with goods_id from the script
    // using regex — handles cases where the JSON is embedded in a JS assignment.
    const goodsObjRe = /\{[^{}]*"goods_id"\s*:\s*"?(\d+)"?[^}]*\}/gi;
    let objMatch: RegExpExecArray | null;
    while ((objMatch = goodsObjRe.exec(content)) !== null) {
      const objStr = objMatch[0];
      const parsedObj = tryParseJson(objStr);
      if (parsedObj) {
        const product = normalizeRawProduct(parsedObj);
        if (product && !products.has(product.goods_id)) products.set(product.goods_id, product);
      }
    }
  }

  // Approach B: Search the entire HTML for JSON arrays containing goods_id.
  // SHEIN sometimes embeds product lists directly in the HTML body.
  const inlineJsonRe = /\{[^{}]*"goods_id"\s*:\s*"?(\d+)"?[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineJsonRe.exec(html)) !== null) {
    const parsed = tryParseJson(inlineMatch[0]);
    if (parsed) {
      const product = normalizeRawProduct(parsed);
      if (product && !products.has(product.goods_id)) products.set(product.goods_id, product);
    }
  }

  if (products.size > 0) {
    console.log(`[SHEIN] Extracted ${products.size} products from embedded JSON`);
  }
  return Array.from(products.values());
}

function tryParseJson(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    // Try to find the first { and last } — sometimes the script has JS around the JSON
    const start = str.indexOf("{");
    const end = str.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(str.substring(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Strategy 3: Regex-based PDP link extraction from HTML ──────────────────
const PDP_LINK_RE = /href="([^"]*-p-(\d+)\.html)"/gi;

function extractPdpLinks(html: string): Map<string, { slug: string; url: string }> {
  const links = new Map<string, { slug: string; url: string }>();
  let m: RegExpExecArray | null;
  PDP_LINK_RE.lastIndex = 0;
  while ((m = PDP_LINK_RE.exec(html)) !== null) {
    const href = m[1];
    const goodsId = m[2];
    if (!goodsId || links.has(goodsId)) continue;
    const slugMatch = href.match(/\/([^/]+?)-p-\d+\.html/);
    links.set(goodsId, { slug: slugMatch ? slugMatch[1] : "product", url: href });
  }
  return links;
}

function extractNamesFromHtml(html: string): Map<string, string> {
  const nameMap = new Map<string, string>();
  let m: RegExpExecArray | null;
  const patterns = [
    /aria-label="([^"]+)"[^>]*>\s*<a[^>]*href="[^"]*-p-(\d+)\.html/gi,
    /<a[^>]*title="([^"]+)"[^>]*href="[^"]*-p-(\d+)\.html/gi,
    /<a[^>]*href="[^"]*-p-(\d+)\.html[^"]*"[^>]*>([^<]{10,200})<\/a>/gi,
    /"goods_id"\s*:\s*"?(\d+)"?[^}]*?"goods_name"\s*:\s*"([^"]{3,200})"/gi,
    /"goods_name"\s*:\s*"([^"]{3,200})"[^}]*?"goods_id"\s*:\s*"?(\d+)"?/gi,
  ];
  for (const re of patterns) {
    while ((m = re.exec(html)) !== null) {
      const name = m[1] || m[2];
      const id = m[2] || m[1];
      // For patterns where group 1 is name and group 2 is id
      if (re === patterns[0] || re === patterns[1]) {
        if (m[1] && m[2] && !nameMap.has(m[2])) nameMap.set(m[2], m[1].trim());
      } else if (re === patterns[2]) {
        if (m[2] && m[1] && !nameMap.has(m[1])) nameMap.set(m[1], m[2].trim());
      } else {
        if (m[1] && m[2] && !nameMap.has(m[2])) nameMap.set(m[2], m[1].trim());
      }
    }
  }
  return nameMap;
}

function extractImagesFromHtml(html: string): Map<string, string> {
  const imgMap = new Map<string, string>();
  let m: RegExpExecArray | null;
  const patterns = [
    /<a[^>]*href="[^"]*-p-(\d+)\.html[\s\S]{0,800}?src=["'](\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /<a[^>]*href="[^"]*-p-(\d+)\.html[\s\S]{0,800}?data-src=["'](\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /src=["'](\/\/img\.ltwebstatic\.com[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][\s\S]{0,300}?href="[^"]*-p-(\d+)\.html/gi,
    /"goods_id"\s*:\s*"?(\d+)"?[^}]*?"goods_img"\s*:\s*"(\/\/[^"]+)"/gi,
    /"goods_img"\s*:\s*"(\/\/img\.ltwebstatic\.com[^"]+)"/gi,
    /"goods_id"\s*:\s*"?(\d+)"?[^}]*?"goods_thumb"\s*:\s*"(\/\/[^"]+)"/gi,
  ];
  for (const re of patterns) {
    while ((m = re.exec(html)) !== null) {
      let id: string, img: string;
      if (re === patterns[2]) { id = m[2]; img = m[1]; }
      else if (re === patterns[4]) { continue; } // standalone goods_img without id — skip
      else { id = m[1]; img = m[2]; }
      if (id && img && !imgMap.has(id)) imgMap.set(id, normalizeImage(img));
    }
  }
  return imgMap;
}

function extractPricesFromHtml(html: string): Map<string, number> {
  const priceMap = new Map<string, number>();
  let m: RegExpExecArray | null;
  const patterns = [
    /<a[^>]*href="[^"]*-p-(\d+)\.html[\s\S]{0,1000}?\$([0-9]+\.?[0-9]*)/gi,
    /"goods_id"\s*:\s*"?(\d+)"?[^}]*?"retail_price"[^}]*?"amountWithSymbol"\s*:\s*"\$?([0-9]+\.?[0-9]*)"/gi,
    /"goods_id"\s*:\s*"?(\d+)"?[^}]*?"salePrice"[^}]*?"amountWithSymbol"\s*:\s*"\$?([0-9]+\.?[0-9]*)"/gi,
  ];
  for (const re of patterns) {
    while ((m = re.exec(html)) !== null) {
      const num = parseFloat(m[2]);
      if (m[1] && !isNaN(num) && !priceMap.has(m[1])) priceMap.set(m[1], num);
    }
  }
  return priceMap;
}

async function scrapeSearchPage(keywords: string, page: number, pageSize: number): Promise<RawProduct[]> {
  const searchUrls = [
    `https://us.shein.com/pdsearch/${encodeURIComponent(keywords)}/?page=${page}`,
    `https://www.shein.com/pdsearch/${encodeURIComponent(keywords)}/?page=${page}`,
  ];

  for (const searchUrl of searchUrls) {
    try {
      console.log(`[SHEIN] Scraping: ${searchUrl.substring(0, 80)}`);
      const response = await fetch(searchUrl, { headers: BROWSER_HEADERS });
      if (!response.ok) {
        console.log(`[SHEIN] Scrape ${response.status}: ${searchUrl.substring(0, 60)}`);
        continue;
      }

      const html = await response.text();
      console.log(`[SHEIN] HTML length: ${html.length}, contains goods_id: ${html.includes("goods_id")}, contains -p-: ${html.includes("-p-")}`);

      if (html.length < 500) {
        console.log(`[SHEIN] HTML too short, likely a challenge page`);
        continue;
      }

      // Strategy A: Extract products from embedded JSON
      const jsonProducts = extractJsonFromScripts(html);
      if (jsonProducts.length > 0) {
        return jsonProducts.slice(0, pageSize);
      }

      // Strategy B: Regex-based extraction from HTML structure
      const pdpLinks = extractPdpLinks(html);
      console.log(`[SHEIN] Found ${pdpLinks.size} PDP links`);
      if (pdpLinks.size === 0) continue;

      const nameMap = extractNamesFromHtml(html);
      const imgMap = extractImagesFromHtml(html);
      const priceMap = extractPricesFromHtml(html);

      const products: RawProduct[] = [];
      for (const [goodsId, linkInfo] of pdpLinks) {
        products.push({
          goods_id: goodsId,
          goods_name: nameMap.get(goodsId) || linkInfo.slug.replace(/-/g, " "),
          goods_url_name: linkInfo.slug,
          goods_img: imgMap.get(goodsId) ?? "",
          goods_thumb: imgMap.get(goodsId) ?? "",
          retail_price: priceMap.has(goodsId) ? { amountWithSymbol: `$${priceMap.get(goodsId)!.toFixed(2)}` } : null,
          salePrice: null,
          unit_price: null,
          brand: "SHEIN",
          cat_name: null,
          attr_value_list: null,
        });
        if (products.length >= pageSize) break;
      }

      if (products.length > 0) {
        console.log(`[SHEIN] Regex extraction got ${products.length} products`);
        return products;
      }
    } catch (err) {
      console.log(`[SHEIN] Scrape error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return [];
}

// ── Strategy 3: Category page fallback ─────────────────────────────────────
// If search returns nothing, try browsing a category page directly.
const CATEGORY_PAGES: Record<string, string> = {
  "women": "https://us.shein.com/Women-Dresses-c-1727.html",
  "men": "https://us.shein.com/Men-Clothing-c-1970.html",
  "women clothing": "https://us.shein.com/Women-Dresses-c-1727.html",
  "men clothing": "https://us.shein.com/Men-Clothing-c-1970.html",
  "shoes": "https://us.shein.com/Women-Shoes-c-1752.html",
  "women shoes": "https://us.shein.com/Women-Shoes-c-1752.html",
  "men shoes": "https://us.shein.com/Men-Shoes-c-2132.html",
  "accessories": "https://us.shein.com/Women-Accessories-c-2031.html",
};

async function scrapeCategoryPage(keywords: string, pageSize: number): Promise<RawProduct[]> {
  const categoryUrl = CATEGORY_PAGES[keywords.toLowerCase().trim()];
  if (!categoryUrl) return [];

  try {
    console.log(`[SHEIN] Trying category page: ${categoryUrl}`);
    const response = await fetch(categoryUrl, { headers: BROWSER_HEADERS });
    if (!response.ok) {
      console.log(`[SHEIN] Category page ${response.status}`);
      return [];
    }
    const html = await response.text();
    console.log(`[SHEIN] Category HTML length: ${html.length}`);

    // Try embedded JSON first
    const jsonProducts = extractJsonFromScripts(html);
    if (jsonProducts.length > 0) return jsonProducts.slice(0, pageSize);

    // Regex fallback
    const pdpLinks = extractPdpLinks(html);
    if (pdpLinks.size === 0) return [];
    const nameMap = extractNamesFromHtml(html);
    const imgMap = extractImagesFromHtml(html);
    const priceMap = extractPricesFromHtml(html);

    const products: RawProduct[] = [];
    for (const [goodsId, linkInfo] of pdpLinks) {
      products.push({
        goods_id: goodsId,
        goods_name: nameMap.get(goodsId) || linkInfo.slug.replace(/-/g, " "),
        goods_url_name: linkInfo.slug,
        goods_img: imgMap.get(goodsId) ?? "",
        goods_thumb: imgMap.get(goodsId) ?? "",
        retail_price: priceMap.has(goodsId) ? { amountWithSymbol: `$${priceMap.get(goodsId)!.toFixed(2)}` } : null,
        salePrice: null,
        unit_price: null,
        brand: "SHEIN",
        cat_name: null,
        attr_value_list: null,
      });
      if (products.length >= pageSize) break;
    }
    console.log(`[SHEIN] Category page got ${products.length} products`);
    return products;
  } catch (err) {
    console.log(`[SHEIN] Category page error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Cache ───────────────────────────────────────────────────────────────────
interface CacheEntry {
  payload: Record<string, unknown>;
  expiresAt: number;
}
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(key: string): Record<string, unknown> | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { responseCache.delete(key); return null; }
  return entry.payload;
}

function setCached(key: string, payload: Record<string, unknown>): void {
  responseCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
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

    const cacheKey = `${keywords}|${page}|${pageSize}`;
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`[SHEIN] Cache HIT for "${keywords}"`);
      return okResponse({ ...cached, cached: true });
    }

    console.log(`[SHEIN] Search: keywords="${keywords}", page=${page}, pageSize=${pageSize}`);

    // 1. Try internal API
    let rawProducts = await searchViaApi(keywords, page, pageSize);
    console.log(`[SHEIN] API: ${rawProducts.length} products`);

    // 2. Fall back to HTML scraping (search page)
    if (rawProducts.length === 0) {
      rawProducts = await scrapeSearchPage(keywords, page, pageSize);
      console.log(`[SHEIN] Search scrape: ${rawProducts.length} products`);
    }

    // 3. Fall back to category page
    if (rawProducts.length === 0) {
      rawProducts = await scrapeCategoryPage(keywords, pageSize);
      console.log(`[SHEIN] Category page: ${rawProducts.length} products`);
    }

    if (rawProducts.length === 0) {
      console.warn(`[SHEIN] No products found for "${keywords}" via any method`);
      return okResponse({ products: [], count: 0 });
    }

    const products = rawProducts.map((p) => {
      const pdpUrl = buildPdpUrl(p.goods_id, p.goods_url_name, p.goods_name);
      const price = extractPrice(p.retail_price) || extractPrice(p.salePrice) || extractPrice(p.unit_price);
      const imageUrl = normalizeImage(p.goods_img || p.goods_thumb || "");
      return {
        productId: p.goods_id,
        title: p.goods_name ?? "",
        brand: p.brand ?? "SHEIN",
        price,
        currency: "USD",
        imageUrl,
        productUrl: pdpUrl,
        category: p.cat_name ?? "",
        sku: p.goods_id,
        sizes: extractSizes(p.attr_value_list),
        rating: null,
        reviewsCount: null,
      };
    });

    const payload = { products, count: products.length };
    setCached(cacheKey, payload);
    console.log(`[SHEIN] Returning ${products.length} products for "${keywords}"`);
    return okResponse(payload);
  } catch (err) {
    console.error("[SHEIN] Edge function error:", err);
    return errorResponse(err instanceof Error ? err.message : "Search failed");
  }
});
