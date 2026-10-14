import { SKIMLINKS_PUBLISHER_ID } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import type { AgeGroup } from '../types'

export type StorePlatform = 'shein' | 'temu' | 'aliexpress' | 'amazon'

export interface RetailerChip {
  label: string
  url: string
}

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
// Uses vendor search-query endpoints (not rigid category pages) to prevent 404s.
export function buildAffiliateSearchUrl(platform: StorePlatform, productName: string): string {
  const cleanName = productName.replace(/^(SHEIN|Temu|AliExpress|Amazon)\s+/i, '').trim()
  const encoded = encodeURIComponent(cleanName)
  let rawUrl = ''
  if (platform === 'shein') {
    rawUrl = `https://www.shein.com/pdsearch/${encoded}`
  } else if (platform === 'temu') {
    rawUrl = `https://www.temu.com/search_result.html?search_key=${encoded}`
  } else if (platform === 'aliexpress') {
    rawUrl = `https://www.aliexpress.com/w/wholesale-${encoded}.html?SearchText=${encoded}`
  } else if (platform === 'amazon') {
    rawUrl = `https://www.amazon.com/s?k=${encoded}`
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

// Derive a human-readable English search query from the active profile's
// gender and age group. This query is used to build vendor search URLs
// that are resilient to category-page changes (no 404s).
export function profileSearchQuery(gender: 'male' | 'female' | 'unisex', ageGroup: AgeGroup): string {
  const isChild = ageGroup === 'child' || ageGroup === 'toddler'
  const isBaby = ageGroup === 'baby'
  const isFemale = gender === 'female'
  const isMale = gender === 'male'

  if (isBaby) return 'baby clothing'
  if (isChild) return isFemale ? 'girls clothing' : 'boys clothing'
  if (isFemale) return 'womens fashion'
  if (isMale) return 'mens fashion'
  return 'fashion clothing'
}

// Build profile-aware search URLs for all supported retailers, each wrapped
// with affiliate tracking. Uses vendor search-query endpoints (not rigid
// category sub-paths) so links never 404 when a merchant reorganises their
// site structure.
export function buildCategoryAffiliateUrls(gender: 'male' | 'female' | 'unisex', ageGroup: AgeGroup): RetailerChip[] {
  const query = profileSearchQuery(gender, ageGroup)
  const encoded = encodeURIComponent(query)

  const chips: RetailerChip[] = [
    { label: 'Amazon', url: `https://www.amazon.com/s?k=${encoded}` },
    { label: 'AliExpress', url: `https://www.aliexpress.com/w/wholesale-${encoded}.html?SearchText=${encoded}` },
    { label: 'SHEIN', url: `https://www.shein.com/pdsearch/${encoded}` },
    { label: 'Temu', url: `https://www.temu.com/search_result.html?search_key=${encoded}` },
    { label: 'Zara', url: `https://www.zara.com/us/search?searchTerm=${encoded}` },
  ]

  return chips.map((c) => ({ ...c, url: wrapAffiliateUrl(c.url) }))
}
