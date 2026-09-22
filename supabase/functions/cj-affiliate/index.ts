// CJ Affiliate GraphQL proxy — all CJ API calls happen server-side.
// CJ_PERSONAL_ACCESS_TOKEN and CJ_PROPERTY_ID are read from Deno.env
// and are NEVER sent to the client browser.
//
// Endpoint: https://ads.api.cj.com/query
// Auth: Authorization: Bearer <CJ_PERSONAL_ACCESS_TOKEN>

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CJ_GRAPHQL_ENDPOINT = "https://ads.api.cj.com/query";

// ── Types ─────────────────────────────────────────────────────────────────

interface CJShoppingProduct {
  id: string;
  title: string;
  description?: string;
  price: { amount: string; currency: string };
  link: string;
  imageLink: string;
  advertiserName: string;
}

interface CJSearchResponse {
  shoppingProducts: {
    totalMatched: number;
    resultList: CJShoppingProduct[];
  };
}

// ── Env helpers ────────────────────────────────────────────────────────────

function getEnvVar(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`[CJ] Missing required environment variable: ${name}`);
  }
  return value?.trim() ?? "";
}

// ── GraphQL query (shoppingProducts) ───────────────────────────────────────

const SHOPPING_PRODUCTS_QUERY = `
  query getProducts($companyId: String!, $keywords: String) {
    shoppingProducts(companyId: $companyId, keywords: $keywords) {
      totalMatched
      resultList {
        id
        title
        description
        price {
          amount
          currency
        }
        link
        imageLink
        advertiserName
      }
    }
  }
`;

// ── Normalization into Fitgura's unified Product schema ────────────────────

function parsePrice(amount: string): number {
  const num = parseFloat(amount.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

const SIZE_RE = /\b(XS|S|M|L|XL|2XL|3XL|4XL|5XL|XXL|XXXL|XXXXL)\b/gi;

function extractSizes(title: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(SIZE_RE.source, "gi");
  while ((m = re.exec(title)) !== null) {
    const raw = m[1].toUpperCase().replace("XXL", "2XL").replace("XXXL", "3XL").replace("XXXXL", "4XL");
    found.add(raw);
  }
  return Array.from(found);
}

function normalizeProduct(raw: CJShoppingProduct): Record<string, unknown> {
  return {
    name: raw.title,
    brand: raw.advertiserName ?? "",
    price: parsePrice(raw.price?.amount ?? "0"),
    currency: raw.price?.currency ?? "USD",
    img: raw.imageLink ?? "",
    category: "",
    aliexpressUrl: raw.link ?? "",
    aliexpressSku: raw.id,
    availableSizes: extractSizes(raw.title),
    platform: "cj",
    promotionLink: null,
  };
}

// ── GraphQL fetch ──────────────────────────────────────────────────────────

async function cjGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const token = getEnvVar("CJ_PERSONAL_ACCESS_TOKEN");
  if (!token) {
    throw new Error("CJ_PERSONAL_ACCESS_TOKEN is not configured");
  }

  const response = await fetch(CJ_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CJ API error (${response.status}): ${text.slice(0, 500)}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`CJ returned non-JSON response: ${text.slice(0, 500)}`);
  }

  if (parsed.errors) {
    const messages = (parsed.errors as Array<{ message: string }>)
      .map((e) => e.message)
      .join("; ");
    throw new Error(`CJ GraphQL errors: ${messages}`);
  }

  return parsed.data as T;
}

// ── Request handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "search";

    if (action === "search") {
      const keywords: string = body.keywords ?? "";
      const propertyId = getEnvVar("CJ_PROPERTY_ID");

      if (!propertyId) {
        return new Response(
          JSON.stringify({ error: "CJ_PROPERTY_ID is not configured", products: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!keywords) {
        return new Response(
          JSON.stringify({ error: "keywords is required", products: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const data = await cjGraphQL<CJSearchResponse>(SHOPPING_PRODUCTS_QUERY, {
        companyId: propertyId,
        keywords,
      });

      const resultList = data.shoppingProducts?.resultList ?? [];
      const products = resultList.map(normalizeProduct);
      const totalCount = data.shoppingProducts?.totalMatched ?? 0;

      return new Response(
        JSON.stringify({ products, totalCount }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[CJ] Error:", message);
    return new Response(
      JSON.stringify({ error: message, products: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
