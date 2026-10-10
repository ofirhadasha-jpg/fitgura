import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import type { ExactVisualMatch, ProductPlatform } from './adapterTypes'

// ── Visual reverse image search client ────────────────────────────────────
// When a SHEIN product is loaded, its image URL is sent to the visual-search
// edge function (RapidAPI Google Lens). We search for exact PDP matches on
// Temu and AliExpress — the two platforms that are NOT the primary source.
// Verified, live PDP URLs with score >= 85 are wrapped with Skimlinks and
// returned as secondary "שווה בדיקה" offers. Platforms with no match get
// a fallback search-link button instead of a disabled state.

function isPdpForPlatform(url: string, platform: ProductPlatform): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (platform === 'shein') {
      return /(^|\.)shein\.com$/i.test(parsed.hostname) && /-p-?[a-z0-9]+\.html/i.test(parsed.pathname)
    }
    if (platform === 'temu') {
      return /(^|\.)temu\.com$/i.test(parsed.hostname) && /(?:goods-|product)/i.test(parsed.pathname)
    }
    if (platform === 'aliexpress') {
      return /(^|\.)aliexpress\.(com|us)$/i.test(parsed.hostname) && /\/item\/\d+/i.test(parsed.pathname)
    }
  } catch { /* ignore */ }
  return false
}

export async function searchVisualMatch(
  imageUrl: string,
  platform: ProductPlatform,
): Promise<ExactVisualMatch | null> {
  if (!imageUrl.trim()) return null
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/visual-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}` },
      body: JSON.stringify({ imageUrl, platform }),
    })
    if (!response.ok) return null
    const result = await response.json() as { match?: Partial<ExactVisualMatch> & { productUrl?: string }; error?: string }
    if (result.error || !result.match) return null

    const candidate = result.match
    const productUrl = typeof candidate.productUrl === 'string' ? candidate.productUrl : ''
    if (!productUrl || !isPdpForPlatform(productUrl, platform)) return null
    if (Number(candidate.score ?? 0) < 85 || candidate.verifiedActive !== true) return null

    return {
      platform,
      name: String(candidate.name ?? ''),
      price: Number(candidate.price ?? 0),
      currency: String(candidate.currency ?? 'ILS'),
      imageUrl: String(candidate.imageUrl ?? ''),
      productUrl: wrapWithSkimlinks(productUrl),
      productId: String(candidate.productId ?? ''),
      sizes: Array.isArray(candidate.sizes) ? candidate.sizes.map(String) : [],
      score: Number(candidate.score),
      verifiedActive: true,
    }
  } catch {
    return null
  }
}

// Search for visual matches on all secondary platforms (temu + aliexpress).
// The primary platform (shein) is excluded — it's the source of the image.
export async function searchAllVisualMatches(
  imageUrl: string,
  primaryPlatform?: ProductPlatform,
): Promise<ExactVisualMatch[]> {
  const secondaryPlatforms: ProductPlatform[] = ['temu', 'aliexpress'].filter(
    (p) => p !== primaryPlatform,
  ) as ProductPlatform[]

  const matches = await Promise.all(
    secondaryPlatforms.map((platform) => searchVisualMatch(imageUrl, platform)),
  )
  return matches.filter((m): m is ExactVisualMatch => m !== null)
}

// Platforms that had no visual match — used to render fallback search buttons.
export function getMissingPlatforms(matches: ExactVisualMatch[], primaryPlatform?: ProductPlatform): ProductPlatform[] {
  const found = new Set(matches.map((m) => m.platform))
  const secondaryPlatforms: ProductPlatform[] = ['temu', 'aliexpress'].filter(
    (p) => p !== primaryPlatform,
  ) as ProductPlatform[]
  return secondaryPlatforms.filter((p) => !found.has(p))
}

// Build a working fallback search URL for a platform, wrapped with affiliate tracking.
export function getFallbackSearchUrl(platform: ProductPlatform, productName: string): string {
  const cleanName = productName.replace(/^(SHEIN|Temu|AliExpress)\s+/i, '').trim()
  let rawUrl = ''
  if (platform === 'temu') {
    rawUrl = `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(cleanName)}`
  } else if (platform === 'aliexpress') {
    rawUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(cleanName)}`
  } else if (platform === 'shein') {
    rawUrl = `https://www.shein.com/pdsearch/${encodeURIComponent(cleanName)}/`
  }
  return rawUrl ? wrapWithSkimlinks(rawUrl) : ''
}
