// CJ Affiliate GraphQL proxy — all CJ API calls happen server-side.
// CJ_PERSONAL_ACCESS_TOKEN, CJ_PROPERTY_ID, CJ_PUBLISHER_ID are read from
// Deno.env and are NEVER sent to the client browser.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CJ_GRAPHQL_ENDPOINT = "https://commissions.api.cj.com/query";

interface CJProduct {
  id: string;
  title: string;
  price: string;
  currency: string;
  imageUrl: string;
  productUrl: string;
  advertiserName: string;
  category: string;
  inStock: string;
}

interface NormalizedProduct {
  name: string;
  brand: string;
  price: number;
  currency: string;
  img: string;
  category: string;
  aliexpressUrl: string;
  aliexpressSku: string;
  availableSizes: string[];
  platform: "cj";
  promotionLink: string | null;
}

function getEnvVar(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`[CJ] Missing required environment variable: ${name}`);
  }
  return value?.trim() ?? "";
}

// ── GraphQL queries ───────────────────────────────────────────────────────

const SEARCH_PRODUCTS_QUERY = `
  query SearchProducts($advertiserIds: [String], $keywords: String, $page: Int, $pageSize: Int) {
    productSearch(
      advertiserIds: $advertiserIds
      keywords: $keywords
      page: $page
      resultsPerPage: $pageSize
    ) {
      products {
        id
        title
        price
        currency
        imageUrl
        buyUrl
        advertiserName
        category
        inStock
      }
      totalCount
    }
  }
`;

const GET_LINK_QUERY = `
  query GetLink($advertiserId: String!, $websiteId: String!, $landingUrl: String!) {
    link(
      advertiserId: $advertiserId
      websiteId: $websiteId
      landingUrl: $landingUrl
    ) {
      clickUrl
    }
  }
`;

// ── Helpers ──────────────────────────────────────────────────────────────

function parsePrice(priceStr: string): number {
  const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
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

function normalizeProduct(raw: CJProduct): NormalizedProduct {
  return {
    name: raw.title,
    brand: raw.advertiserName ?? "",
    price: parsePrice(raw.price),
    currency: raw.currency || "USD",
    img: raw.imageUrl ?? "",
    category: raw.category ?? "",
    aliexpressUrl: raw.productUrl ?? raw.buyUrl ?? "",
    aliexpressSku: raw.id,
    availableSizes: extractSizes(raw.title),
    platform: "cj",
    promotionLink: null,
  };
}

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

// ── Request handler ──────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "search";

    if (action === "search") {
      const keywords: string = body.keywords ?? "";
      const page: number = body.page ?? 1;
      const pageSize: number = body.pageSize ?? 50;
      const advertiserIds: string[] | undefined = body.advertiserIds;

      if (!keywords) {
        return new Response(
          JSON.stringify({ error: "keywords is required", products: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const data = await cjGraphQL<{
        productSearch: { products: CJProduct[]; totalCount: number };
      }>(SEARCH_PRODUCTS_QUERY, {
        advertiserIds: advertiserIds ?? null,
        keywords,
        page,
        pageSize,
      });

      const products = (data.productSearch?.products ?? []).map(normalizeProduct);

      return new Response(
        JSON.stringify({ products, totalCount: data.productSearch?.totalCount ?? 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "link") {
      const advertiserId: string = body.advertiserId ?? "";
      const landingUrl: string = body.landingUrl ?? "";

      const propertyId = getEnvVar("CJ_PROPERTY_ID");
      const publisherId = getEnvVar("CJ_PUBLISHER_ID");

      if (!advertiserId || !landingUrl) {
        return new Response(
          JSON.stringify({ error: "advertiserId and landingUrl are required" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const data = await cjGraphQL<{ link: { clickUrl: string } }>(
        GET_LINK_QUERY,
        {
          advertiserId,
          websiteId: publisherId || propertyId,
          landingUrl,
        },
      );

      return new Response(
        JSON.stringify({ clickUrl: data.link?.clickUrl ?? landingUrl }),
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
