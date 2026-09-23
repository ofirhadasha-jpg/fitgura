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
  advertiserId?: string;
}

interface CJSearchResponse {
  products: {
    totalCount: number;
    count: number;
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

// ── GraphQL query (products) ───────────────────────────────────────────────
// Per CJ API docs: companyId is ID!, keywords is [String!], field is "products"
// with totalCount/count/resultList. imageLink and advertiserName are valid fields.

const PRODUCTS_QUERY = `
  query getProducts($companyId: ID!, $keywords: [String!]) {
    products(companyId: $companyId, keywords: $keywords) {
      totalCount
      count
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
        advertiserId
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
    advertiserName: raw.advertiserName ?? "",
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
      // Try CJ_PUBLISHER_ID first (this is the publisher's company ID),
      // then fall back to CJ_PROPERTY_ID
      const companyId = getEnvVar("CJ_PUBLISHER_ID") || getEnvVar("CJ_PROPERTY_ID");

      if (!companyId) {
        return new Response(
          JSON.stringify({ error: "CJ_PUBLISHER_ID or CJ_PROPERTY_ID is not configured", products: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!keywords) {
        return new Response(
          JSON.stringify({ error: "keywords is required", products: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // CJ keywords argument is [String!] — split the keyword string into tokens
      const keywordTokens = keywords.split(/\s+/).filter((k) => k.length > 0);

      let data: CJSearchResponse;
      try {
        data = await cjGraphQL<CJSearchResponse>(PRODUCTS_QUERY, {
          companyId,
          keywords: keywordTokens,
        });
      } catch (err) {
        // If the products query fails (e.g. wrong companyId), try shoppingProductFeeds
        // to discover available advertiser feeds, then query products from those.
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[CJ] products query failed, trying productFeeds:", errMsg);

        // Try querying productFeeds to find advertiser IDs
        const feedsQuery = `
          query getFeeds($companyId: ID!) {
            productFeeds(companyId: $companyId) {
              totalCount
              count
              resultList {
                adId
                advertiserId
                advertiserName
                productCount
                language
                currency
              }
            }
          }
        `;
        const feedsData = await cjGraphQL<{ productFeeds: { resultList: { adId: string; advertiserId: string; advertiserName: string; productCount: number; language: string; currency: string }[] } }>(feedsQuery, {
          companyId,
        });

        const feeds = feedsData.productFeeds?.resultList ?? [];
        if (feeds.length === 0) {
          throw new Error("No advertiser product feeds found for this CJ account");
        }

        // Query products from the first few advertiser feeds
        const topFeeds = feeds.filter((f) => f.productCount > 0).slice(0, 5);
        const allProducts: CJShoppingProduct[] = [];

        for (const feed of topFeeds) {
          try {
            const feedProductsQuery = `
              query getFeedProducts($companyId: ID!, $adId: ID!, $keywords: [String!]) {
                products(companyId: $companyId, adId: $adId, keywords: $keywords) {
                  totalCount
                  count
                  resultList {
                    id
                    title
                    description
                    price { amount currency }
                    link
                    imageLink
                    advertiserName
                    advertiserId
                  }
                }
              }
            `;
            const feedData = await cjGraphQL<CJSearchResponse>(feedProductsQuery, {
              companyId,
              adId: feed.adId,
              keywords: keywordTokens,
            });
            const feedResults = feedData.products?.resultList ?? [];
            allProducts.push(...feedResults);
          } catch (feedErr) {
            console.error(`[CJ] Feed ${feed.adId} (${feed.advertiserName}) query failed:`, feedErr instanceof Error ? feedErr.message : feedErr);
          }
        }

        data = {
          products: {
            totalCount: allProducts.length,
            count: allProducts.length,
            resultList: allProducts,
          },
        };
      }

      const resultList = data.products?.resultList ?? [];
      const products = resultList.map(normalizeProduct);
      const totalCount = data.products?.totalCount ?? 0;

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
