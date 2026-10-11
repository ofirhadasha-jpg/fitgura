// Temu product search edge function.
// Temu blocks server-side scraping and has no public affiliate API.
// This function serves products from a curated catalog in the temu_products
// Supabase table. Each product has a Temu search URL derived from its title.

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

    const products = await fetchFromCatalog(keywords, page, pageSize);
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
