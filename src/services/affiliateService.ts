import { SKIMLINKS_PUBLISHER_ID } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'

export type StorePlatform = 'shein' | 'temu' | 'aliexpress' | 'amazon'

const STORE_DOMAINS: { platform: StorePlatform; patterns: RegExp[] }[] = [
  { platform: 'shein', patterns: [/shein\.(com|us|il)/i] },
  { platform: 'temu', patterns: [/temu\.(com|us)/i] },
  { platform: 'aliexpress', patterns: [/aliexpress\.(com|us)/i] },
  { platform: 'amazon', patterns: [/amazon\.(com|co\.uk|de|fr|ca|com\.au)/i] },
]

function detectPlatform(url: string): StorePlatform | null {
  try {
    const parsed = new URL(url)
    for (const { platform, patterns } of STORE_DOMAINS) {
      if (patterns.some((p) => p.test(parsed.hostname))) return platform
    }
  } catch { /* ignore */ }
  return null
}

function isAlreadyWrapped(url: string): boolean {
  return /go\.skimlinks|go\.skimresources|go\.redirecting/i.test(url)
}

// Wrap any raw merchant URL with Skimlinks affiliate tracking.
// Idempotent: returns the input unchanged if already wrapped or no publisher ID configured.
export function wrapAffiliateUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl
  if (isAlreadyWrapped(originalUrl)) return originalUrl
  if (!SKIMLINKS_PUBLISHER_ID) return originalUrl
  return wrapWithSkimlinks(originalUrl)
}

// Build a platform-specific search URL for a product name, wrapped with affiliate tracking.
export function buildAffiliateSearchUrl(platform: StorePlatform, productName: string): string {
  const cleanName = productName.replace(/^(SHEIN|Temu|AliExpress|Amazon)\s+/i, '').trim()
  let rawUrl = ''
  if (platform === 'shein') {
    rawUrl = `https://www.shein.com/pdsearch/${encodeURIComponent(cleanName)}/`
  } else if (platform === 'temu') {
    rawUrl = `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(cleanName)}`
  } else if (platform === 'aliexpress') {
    rawUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(cleanName)}`
  } else if (platform === 'amazon') {
    rawUrl = `https://www.amazon.com/s?k=${encodeURIComponent(cleanName)}`
  }
  return rawUrl ? wrapAffiliateUrl(rawUrl) : ''
}

// Build a multi-platform affiliate search link — picks AliExpress as the default
// comparison destination since it consistently has the lowest prices.
export function buildComparisonAffiliateUrl(productName: string, platform?: StorePlatform): string {
  const target = platform ?? 'aliexpress'
  return buildAffiliateSearchUrl(target, productName)
}

// Build a Google Lens visual search URL for a product image.
// This is a neutral user tool — no affiliate tracking.
export function buildGoogleLensUrl(imageUrl: string): string {
  if (!imageUrl) return ''
  return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`
}

// Ensure any outbound store URL is wrapped with affiliate tracking before redirecting.
export function ensureAffiliateWrapped(url: string): string {
  if (!url) return url
  const platform = detectPlatform(url)
  if (!platform) return url
  return wrapAffiliateUrl(url)
}
