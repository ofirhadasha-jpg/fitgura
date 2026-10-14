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

// Build profile-aware category landing URLs for all supported retailers,
// each wrapped with affiliate tracking. The gender and ageGroup of the
// active profile determine which clothing category each link targets.
export function buildCategoryAffiliateUrls(gender: 'male' | 'female' | 'unisex', ageGroup: AgeGroup): RetailerChip[] {
  const isChild = ageGroup === 'child' || ageGroup === 'toddler'
  const isBaby = ageGroup === 'baby'
  const isFemale = gender === 'female'
  const isMale = gender === 'male'

  let sheinPath = 'Women-Dresses-c-1727.html'
  let aliPath = 'womens-clothing'
  let temuPath = 'women-clothing'
  let zaraPath = 'woman'
  let amazonQuery = 'womens clothing'

  if (isChild) {
    if (isFemale) {
      sheinPath = 'Kids-Girls-c-2031.html'
      aliPath = 'girls-clothing'
      temuPath = 'girls-clothing'
      zaraPath = 'girl'
      amazonQuery = 'girls clothing kids'
    } else {
      sheinPath = 'Kids-Boys-c-2030.html'
      aliPath = 'boys-clothing'
      temuPath = 'boys-clothing'
      zaraPath = 'boy'
      amazonQuery = 'boys clothing kids'
    }
  } else if (isBaby) {
    sheinPath = 'Baby-c-2029.html'
    aliPath = 'baby-clothing'
    temuPath = 'baby-clothing'
    zaraPath = 'baby'
    amazonQuery = 'baby clothing'
  } else if (isMale) {
    sheinPath = 'Men-Tees-c-1996.html'
    aliPath = 'mens-clothing'
    temuPath = 'men-clothing'
    zaraPath = 'man'
    amazonQuery = 'mens clothing'
  }

  const chips: RetailerChip[] = [
    { label: 'Amazon', url: `https://www.amazon.com/s?k=${encodeURIComponent(amazonQuery)}` },
    { label: 'AliExpress', url: `https://www.aliexpress.com/${aliPath}.html` },
    { label: 'SHEIN', url: `https://www.shein.com/${sheinPath}` },
    { label: 'Temu', url: `https://www.temu.com/${temuPath}.html` },
    { label: 'Zara', url: `https://www.zara.com/us/${zaraPath}.html` },
  ]

  return chips.map((c) => ({ ...c, url: wrapAffiliateUrl(c.url) }))
}
