import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import type { ExactVisualMatch, ProductPlatform } from './adapterTypes'

// ── Visual reverse image search client ────────────────────────────────────
// Calls the `visual-search` edge function, which runs the Apify Google Lens
// actor to find exact PDP matches on the target platform. Only verified,
// live PDP URLs with a score >= 85 are returned. Unverified results are
// never used — the function returns null so the UI can show "exclusive".

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

export async function searchAllVisualMatches(
  imageUrl: string,
): Promise<ExactVisualMatch[]> {
  const [sheinMatch, temuMatch] = await Promise.all([
    searchVisualMatch(imageUrl, 'shein'),
    searchVisualMatch(imageUrl, 'temu'),
  ])
  return [sheinMatch, temuMatch].filter((m): m is ExactVisualMatch => m !== null)
}

// Determine which platforms were searched but returned no match,
// so the UI can show "בלעדי ב-[Platform]" badges.
export function getExclusivePlatforms(matches: ExactVisualMatch[]): ProductPlatform[] {
  const found = new Set(matches.map((m) => m.platform))
  const allSearched: ProductPlatform[] = ['shein', 'temu']
  return allSearched.filter((p) => !found.has(p))
}
