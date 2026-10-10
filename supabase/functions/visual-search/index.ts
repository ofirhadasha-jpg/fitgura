const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Visual reverse image search via RapidAPI Google Lens ───────────────────
// Calls the RapidAPI "google-lens-image-search1" endpoint to perform a real
// Google Lens reverse image search. The API returns visual_matches — an array
// of pages Google Lens identified as containing the same or a similar image.
//
// Required env secrets (configured in Supabase project settings):
//   RAPIDAPI_KEY  — Your RapidAPI key
//   RAPIDAPI_HOST — e.g. "google-lens-image-search1.p.rapidapi.com"
//
// API: GET https://<RAPIDAPI_HOST>/v1/google-lens?query_url=<imageUrl>
// Headers: X-RapidAPI-Key, X-RapidAPI-Host
//
// Response shape (visual_matches array):
//   { position, title, link, source, thumbnail, ... }
//
// We filter results to only shein.com / temu.com PDP URLs, verify each
// page is live via HEAD, extract price/sizes/title from the page HTML,
// and return only matches with score >= 85 and verifiedActive = true.

interface RapidApiLensMatch {
  position?: number;
  title?: string;
  link?: string;
  source?: string;
  thumbnail?: string;
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

function isAliExpressPdpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)aliexpress\.(com|us)$/i.test(url.hostname) && /\/item\/\d+/i.test(url.pathname);
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
    if (platform === 'aliexpress') {
      const match = parsed.pathname.match(/\/item\/(\d+)/i);
      return match?.[1] ?? '';
    }
  } catch { /* ignore */ }
  return '';
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
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? '';
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

async function callRapidApiGoogleLens(imageUrl: string): Promise<RapidApiLensMatch[]> {
  const apiKey = Deno.env.get("RAPIDAPI_KEY")?.trim();
  const apiHost = Deno.env.get("RAPIDAPI_HOST")?.trim();

  if (!apiKey || !apiHost) {
    throw new Error("RAPIDAPI_KEY and RAPIDAPI_HOST are not configured");
  }

  const endpoint = `https://${apiHost}/v1/google-lens?query_url=${encodeURIComponent(imageUrl)}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': apiHost,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`RapidAPI Google Lens error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;

  // The API may return visual_matches under different key names
  const matches = payload.visual_matches
    ?? payload.visualMatches
    ?? payload.matches
    ?? payload.results
    ?? [];

  if (!Array.isArray(matches)) return [];
  return matches as RapidApiLensMatch[];
}

async function findVisualMatches(
  imageUrl: string,
  targetPlatform: string,
): Promise<VisualMatchResult | null> {
  if (!imageUrl.trim()) return null;

  const matches = await callRapidApiGoogleLens(imageUrl);
  if (matches.length === 0) return null;

  const isPlatformPdp = targetPlatform === 'shein' ? isSheinPdpUrl
    : targetPlatform === 'temu' ? isTemuPdpUrl
    : targetPlatform === 'aliexpress' ? isAliExpressPdpUrl
    : (() => false);

  // Filter to platform PDP URLs; score by position (earlier = higher confidence)
  const scored = matches
    .map((m, idx) => ({
      match: m,
      score: Math.max(95 - (idx * 2), 85), // position 0 → 95, position 5 → 85
    }))
    .filter((s) => s.score >= 85 && isPlatformPdp(s.match.link))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];

  // Verify the PDP is live
  const isLive = await verifyPdpLive(best.match.link!);
  if (!isLive) return null;

  // Fetch the page to extract price, sizes, and title
  const pageData = await fetchPagePrice(best.match.link!);

  return {
    name: pageData.title || best.match.title || `${targetPlatform} item`,
    price: pageData.price,
    currency: pageData.currency,
    imageUrl: best.match.thumbnail ?? '',
    productUrl: best.match.link!,
    productId: extractProductId(best.match.link!, targetPlatform),
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
