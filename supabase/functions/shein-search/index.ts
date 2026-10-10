// SHEIN product search edge function.
// Fetches real product data from SHEIN's internal search API.
// Uses the same endpoint that powers SHEIN's search page infinite scroll.
// Falls back to HTML scraping if the API endpoint fails.

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

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://us.shein.com/",
  "Origin": "https://us.shein.com",
};

// ── Strategy 1: SHEIN internal search API ───────────────────────────────────
// This endpoint powers the search page's product loading.
async function searchViaApi(keywords: string, page: number, pageSize: number): Promise<RawProduct[]> {
  const url = `https://www.shein.com/productapi/search/v3/search?keyword=${encodeURIComponent(keywords)}&page_num=${page}&page_size=${pageSize}&language=en&currency=USD&country=US`;

  const response = await fetch(url, { headers: BROWSER_HEADERS });
  if (!response.ok) {
    console.error(`[SHEIN] API returned ${response.status}`);
    return [];
  }

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[SHEIN] API response is not valid JSON");
    return [];
  }

  const products = (data.products ?? data.goods_list ?? []) as RawProduct[];
  if (!Array.isArray(products)) return [];
  return products;
}

// ── Strategy 2: HTML scraping ───────────────────────────────────────────────
// Fetch the search page HTML and extract product links from <a> tags.
// SHEIN's SSR HTML includes product card links with PDP URLs.
const PDP_LINK_RE = /href="([^"]*-p-(\d+)\.html)"/gi;

interface ScrapedLink {
  goods_id: string;
  pdpPath: string;
  slug: string;
}

function extractPdpLinks(html: string): ScrapedLink[] {
  const results: ScrapedLink[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  PDP_LINK_RE.lastIndex = 0;
  while ((m = PDP_LINK_RE.exec(html)) !== null) {
    const href = m[1];
    const goodsId = m[2];
    if (!goodsId || seen.has(goodsId)) continue;
    seen.add(goodsId);
    const slugMatch = href.match(/\/([^/]+?)-p-\d+\.html/);
    const slug = slugMatch ? slugMatch[1] : "product";
    results.push({ goods_id: goodsId, pdpPath: href, slug });
  }
  return results;
}

function extractNamesFromHtml(html: string): Map<string, string> {
  const nameMap = new Map<string, string>();
  let m: RegExpExecArray | null;
  // aria-label="Product Name" near product link
  const ariaRe = /aria-label="([^"]+)"[^>]*>\s*<a[^>]*href="[^"]*-p-(\d+)\.html/gi;
  while ((m = ariaRe.exec(html)) !== null) {
    if (m[1] && m[2] && !nameMap.has(m[2])) nameMap.set(m[2], m[1].trim());
  }
  // title="Product Name" in product link
  const titleRe = /<a[^>]*title="([^"]+)"[^>]*href="[^"]*-p-(\d+)\.html/gi;
  while ((m = titleRe.exec(html)) !== null) {
    if (m[1] && m[2] && !nameMap.has(m[2])) nameMap.set(m[2], m[1].trim());
  }
  // alt="Product Name" in product card image
  const altRe = /<img[^>]*alt="([^"]+)"[^>]*>\s*<\/?\w*>\s*<a[^>]*href="[^"]*-p-(\d+)\.html/gi;
  while ((m = altRe.exec(html)) !== null) {
    if (m[1] && m[2] && !nameMap.has(m[2])) nameMap.set(m[2], m[1].trim());
  }
  // Link text content
  const linkTextRe = /<a[^>]*href="[^"]*-p-(\d+)\.html[^"]*"[^>]*>([^<]{10,200})<\/a>/gi;
  while ((m = linkTextRe.exec(html)) !== null) {
    const name = m[2].trim();
    if (name && m[1] && !nameMap.has(m[1]) && name.length > 5) nameMap.set(m[1], name);
  }
  return nameMap;
}

function extractImagesFromHtml(html: string): Map<string, string> {
  const imgMap = new Map<string, string>();
  let m: RegExpExecArray | null;
  // src="(//img...jpg)" near product link
  const srcRe = /<a[^>]*href="[^"]*-p-(\d+)\.html[\s\S]{0,800}?src=["'](\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  while ((m = srcRe.exec(html)) !== null) {
    if (m[1] && m[2] && !imgMap.has(m[1])) imgMap.set(m[1], normalizeImage(m[2]));
  }
  // data-src for lazy-loaded
  const dataSrcRe = /<a[^>]*href="[^"]*-p-(\d+)\.html[\s\S]{0,800}?data-src=["'](\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  while ((m = dataSrcRe.exec(html)) !== null) {
    if (m[1] && m[2] && !imgMap.has(m[1])) imgMap.set(m[1], normalizeImage(m[2]));
  }
  // Image before link: <img src="..." ...> <a href="...-p-ID.html">
  const imgBeforeRe = /src=["'](\/\/img\.ltwebstatic\.com[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][\s\S]{0,300}?href="[^"]*-p-(\d+)\.html/gi;
  while ((m = imgBeforeRe.exec(html)) !== null) {
    if (m[1] && m[2] && !imgMap.has(m[2])) imgMap.set(m[2], normalizeImage(m[1]));
  }
  return imgMap;
}

function extractPricesFromHtml(html: string): Map<string, number> {
  const priceMap = new Map<string, number>();
  let m: RegExpExecArray | null;
  // $X.XX near product link
  const dollarRe = /<a[^>]*href="[^"]*-p-(\d+)\.html[\s\S]{0,1000}?\$([0-9]+\.?[0-9]*)/gi;
  while ((m = dollarRe.exec(html)) !== null) {
    const num = parseFloat(m[2]);
    if (m[1] && !isNaN(num) && !priceMap.has(m[1])) priceMap.set(m[1], num);
  }
  return priceMap;
}

async function scrapeSearchPage(keywords: string, page: number, pageSize: number): Promise<RawProduct[]> {
  const searchUrl = `https://us.shein.com/pdsearch/${encodeURIComponent(keywords)}/?page=${page}&sort=7`;

  const response = await fetch(searchUrl, {
    headers: {
      ...BROWSER_HEADERS,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
    },
  });

  if (!response.ok) {
    console.error(`[SHEIN] HTML scrape returned ${response.status}`);
    return [];
  }

  const html = await response.text();
  console.log(`[SHEIN] HTML length: ${html.length}`);

  const links = extractPdpLinks(html);
  console.log(`[SHEIN] Found ${links.length} PDP links in HTML`);
  if (links.length === 0) return [];

  const nameMap = extractNamesFromHtml(html);
  const imgMap = extractImagesFromHtml(html);
  const priceMap = extractPricesFromHtml(html);

  return links.slice(0, pageSize).map((link) => {
    const name = nameMap.get(link.goods_id) || link.slug.replace(/-/g, " ");
    const price = priceMap.get(link.goods_id) ?? 0;
    const image = imgMap.get(link.goods_id) ?? "";
    return {
      goods_id: link.goods_id,
      goods_name: name,
      goods_url_name: link.slug,
      goods_img: image,
      goods_thumb: image,
      retail_price: price > 0 ? { amountWithSymbol: `$${price.toFixed(2)}` } : null,
      salePrice: null,
      unit_price: null,
      brand: "SHEIN",
      cat_name: null,
      attr_value_list: null,
    };
  }).filter((p) => p.goods_id && p.goods_name);
}

// ── In-memory cache (15-minute TTL) ──────────────────────────────────────────
interface CacheEntry {
  payload: Record<string, unknown>;
  expiresAt: number;
}
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCached(key: string): Record<string, unknown> | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.payload;
}

function setCached(key: string, payload: Record<string, unknown>): void {
  responseCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
}

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

    if (!keywords) {
      return errorResponse("keywords is required");
    }

    const cacheKey = `${keywords}|${page}|${pageSize}`;
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`[SHEIN] Cache HIT for "${keywords}"`);
      return okResponse({ ...cached, cached: true });
    }

    console.log(`[SHEIN] Searching: keywords="${keywords}", page=${page}, pageSize=${pageSize}`);

    // Try API first, then HTML scraping
    let rawProducts = await searchViaApi(keywords, page, pageSize);
    console.log(`[SHEIN] API yielded ${rawProducts.length} products`);

    if (rawProducts.length === 0) {
      rawProducts = await scrapeSearchPage(keywords, page, pageSize);
      console.log(`[SHEIN] HTML scrape yielded ${rawProducts.length} products`);
    }

    if (rawProducts.length === 0) {
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
    return okResponse(payload);
  } catch (err) {
    console.error("[SHEIN] Edge function error:", err);
    return errorResponse(err instanceof Error ? err.message : "Search failed");
  }
});
