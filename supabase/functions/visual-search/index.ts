const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Visual reverse image search via Apify Google Lens actor ────────────────
// Uses the "thodor/google-lens-exact-matches" actor to find exact PDP URLs
// on shein.com and temu.com for a given source product image URL.
//
// Required env secrets:
//   APIFY_API_TOKEN — Apify account token
//
// The actor input format:
//   { imageUrls: [url], resolve: true, country: "US" }
//
// The actor output (one record per Lens match) includes:
//   source_image_url, page_url, title, source, thumbnail, resolve_status
//
// We filter matches by target platform domain, verify the PDP is live,
// attempt to extract price from the page HTML, and return only matches
// with score >= 85 and verifiedActive = true.

interface ApifyLensMatch {
  source_image_url?: string;
  page_url?: string;
  title?: string;
  source?: string;
  thumbnail?: string;
  resolve_status?: string;
  page_status?: number;
}

interface VisualMatchResult {
  name: string;
  price: number;
  currency: string;
  imageUrl: string;
  productUrl: string;
  productId: string;
  sizes: string[];
  score: number;
  verifiedActive: boolean;
}

const SIZE_RE = /\b(XS|S|M|L|XL|2XL|3XL|4XL|5XL|XXL|XXXL|\d{2,3})\b/gi;

function extractSizes(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(SIZE_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    found.add(m[1].toUpperCase());
  }
  return Array.from(found);
}

function parsePrice(text: string): { price: number; currency: string } {
  // Look for patterns like ₪129, $15.99, 49.90 ILS, €25
  const priceMatch = text.match(/(?:₪|ILS|\$|USD|€|EUR)\s?(\d+[.,]?\d*)/i);
  if (priceMatch) {
    const rawSymbol = priceMatch[0].match(/₪|ILS|\$|USD|€|EUR/i)?.[0]?.toUpperCase() ?? '';
    const currency = rawSymbol.includes('ILS') || rawSymbol.includes('₪') ? 'ILS'
      : rawSymbol.includes('USD') || rawSymbol.includes('$') ? 'USD'
      : rawSymbol.includes('EUR') || rawSymbol.includes('€') ? 'EUR' : 'ILS';
    const price = parseFloat(priceMatch[1].replace(',', '.'));
    if (!isNaN(price)) return { price, currency };
  }
  return { price: 0, currency: 'ILS' };
}

function isSheinPdpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)shein\.com$/i.test(url.hostname) && /-p-?[a-z0-9]+\.html/i.test(url.pathname);
  } catch {
    return false;
  }
}

function isTemuPdpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)temu\.com$/i.test(url.hostname) && /(?:goods-|product)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractProductId(url: string, platform: string): string {
  try {
    const parsed = new URL(url);
    if (platform === 'shein') {
      const match = parsed.pathname.match(/-p-([a-z0-9]+)\.html/i);
      return match?.[1] ?? '';
    }
    if (platform === 'temu') {
      const match = parsed.pathname.match(/goods-([a-z0-9]+)/i);
      return match?.[1] ?? '';
    }
  } catch { /* ignore */ }
  return '';
}

function scoreMatch(resolveStatus: string): number {
  if (resolveStatus === 'match_definitely') return 95;
  if (resolveStatus === 'match_maybe') return 87;
  return 0;
}

async function fetchPagePrice(url: string): Promise<{ price: number; currency: string; sizes: string[]; title: string }> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FitguraBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { price: 0, currency: 'ILS', sizes: [], title: '' };
    const html = await response.text();
    const { price, currency } = parsePrice(html);
    // Try to extract a title from the page
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? '';
    // Extract sizes from common size-chart patterns in the HTML
    const sizes = extractSizes(html.slice(0, 50000));
    return { price, currency, sizes, title };
  } catch {
    return { price: 0, currency: 'ILS', sizes: [], title: '' };
  }
}

async function verifyPdpLive(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

async function runApifyLensSearch(imageUrl: string): Promise<ApifyLensMatch[]> {
  const token = Deno.env.get("APIFY_API_TOKEN")?.trim();
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");

  const actorId = "thodor/google-lens-exact-matches";
  const startUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;

  const response = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: [imageUrl],
      resolve: true,
      country: 'US',
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Apify actor error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const items = await response.json().catch(() => []) as ApifyLensMatch[];
  return Array.isArray(items) ? items : [];
}

async function findVisualMatches(
  imageUrl: string,
  targetPlatform: string,
): Promise<VisualMatchResult | null> {
  if (!imageUrl.trim()) return null;

  const matches = await runApifyLensSearch(imageUrl);
  if (matches.length === 0) return null;

  const isPlatformPdp = targetPlatform === 'shein' ? isSheinPdpUrl : isTemuPdpUrl;

  // Sort by score descending — match_definitely first, then match_maybe
  const scored = matches
    .map((m) => ({ match: m, score: scoreMatch(m.resolve_status ?? '') }))
    .filter((s) => s.score >= 85 && isPlatformPdp(s.match.page_url))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];

  // Verify the PDP is live
  const isLive = await verifyPdpLive(best.match.page_url!);
  if (!isLive) return null;

  // Fetch the page to extract price, sizes, and title
  const pageData = await fetchPagePrice(best.match.page_url!);

  return {
    name: pageData.title || best.match.title || `${targetPlatform} item`,
    price: pageData.price,
    currency: pageData.currency,
    imageUrl: best.match.thumbnail ?? '',
    productUrl: best.match.page_url!,
    productId: extractProductId(best.match.page_url!, targetPlatform),
    sizes: pageData.sizes,
    score: best.score,
    verifiedActive: true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const imageUrl: string = String(body.imageUrl ?? '');
    const platform: string = String(body.platform ?? '');

    if (!imageUrl || !platform) {
      return new Response(
        JSON.stringify({ error: "imageUrl and platform are required", match: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const match = await findVisualMatches(imageUrl, platform);

    return new Response(
      JSON.stringify({ match }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[visual-search] Error:", message);
    return new Response(
      JSON.stringify({ error: message, match: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
