// SHEIN product search edge function.
// Scrapes SHEIN's public search results page and returns structured products.
// No API key required — SHEIN's public search endpoint returns JSON-like data
// embedded in the page that we parse server-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SheinProduct {
  goods_id: string;
  goods_name: string;
  goods_url_name: string;
  goods_img: string;
  goods_thumb: string;
  retail_price: { amountWithSymbol: string };
  salePrice: { amountWithSymbol: string };
  unit_price: { amountWithSymbol: string };
  brand: string | null;
  cat_name: string;
  attr_value_list: { attr_value: string }[];
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

function extractPrice(priceObj: { amountWithSymbol: string } | undefined): number {
  if (!priceObj?.amountWithSymbol) return 0;
  const cleaned = priceObj.amountWithSymbol.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function extractSizes(attrList: { attr_value: string }[] | undefined): string[] {
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

function buildPdpUrl(product: SheinProduct): string {
  const id = product.goods_id;
  const slug = product.goods_url_name || product.goods_name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "product";
  return `https://www.shein.com/${slug}-p-${id}.html`;
}

function normalizeImage(img: string | undefined): string {
  if (!img) return "";
  if (img.startsWith("//")) return `https:${img}`;
  if (img.startsWith("http://")) return img.replace("http://", "https://");
  return img;
}

async function searchShein(keywords: string, page: number, pageSize: number): Promise<SheinProduct[]> {
  // SHEIN's public search API endpoint
  const url = `https://www.shein.com/productapi/search/v3/search?keyword=${encodeURIComponent(keywords)}&page_num=${page}&page_size=${pageSize}&language=en&currency=USD&country=US`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.shein.com/",
    },
  });

  if (!response.ok) {
    console.error(`[SHEIN] Search API returned ${response.status}`);
    return [];
  }

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[SHEIN] Response is not valid JSON");
    return [];
  }

  const products = (data.products ?? data.goods_list ?? []) as SheinProduct[];
  if (!Array.isArray(products)) return [];

  return products;
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

    console.log(`[SHEIN] Searching: keywords="${keywords}", page=${page}, pageSize=${pageSize}`);

    const rawProducts = await searchShein(keywords, page, pageSize);
    console.log(`[SHEIN] Found ${rawProducts.length} raw products`);

    const products = rawProducts.map((p) => {
      const pdpUrl = buildPdpUrl(p);
      const price = extractPrice(p.retail_price) || extractPrice(p.salePrice) || extractPrice(p.unit_price);
      return {
        productId: p.goods_id,
        title: p.goods_name ?? "",
        brand: p.brand ?? "SHEIN",
        price,
        currency: "USD",
        imageUrl: normalizeImage(p.goods_img || p.goods_thumb),
        productUrl: pdpUrl,
        category: p.cat_name ?? "",
        sku: p.goods_id,
        sizes: extractSizes(p.attr_value_list),
        rating: null,
        reviewsCount: null,
      };
    });

    return okResponse({ products, count: products.length });
  } catch (err) {
    console.error("[SHEIN] Edge function error:", err);
    return errorResponse(err instanceof Error ? err.message : "Search failed");
  }
});
