import type { Product, PriceComparisonEntry, ProductPlatform, Offer } from '../types'
import type { AffiliateAdapter } from './adapterTypes'
import {
  aliExpressAdapter,
  searchProductsByCategory as aliSearchByCategory,
  searchProducts as aliSearchProducts,
  searchDeviceAccessories as aliSearchDeviceAccessories,
  filterProducts,
  filterByPrice,
} from './aliexpressClient'
import {
  sheinAdapter,
  searchProductsByCategory as sheinSearchByCategory,
  searchProducts as sheinSearchProducts,
  searchDeviceAccessories as sheinSearchDeviceAccessories,
} from './sheinClient'
import {
  temuAdapter,
  searchProductsByCategory as temuSearchByCategory,
  searchProducts as temuSearchProducts,
  searchDeviceAccessories as temuSearchDeviceAccessories,
} from './temuClient'
import {
  cjAdapter,
  searchProductsByCategory as cjSearchByCategory,
  searchProducts as cjSearchProducts,
  searchDeviceAccessories as cjSearchDeviceAccessories,
} from './cjClient'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import { getFallbackImage } from '../utils/productImages'

// ── Adapter registry ─────────────────────────────────────────────────────────
// All four affiliate adapters are registered here. The aggregator queries them
// in parallel and merges results. Adapters without credentials return mock or
// fallback data rather than throwing, so the feed always has results.

export const ADAPTERS: AffiliateAdapter[] = [
  aliExpressAdapter,
  sheinAdapter,
  temuAdapter,
  cjAdapter,
]

export function getAdapterStatus(): { platform: ProductPlatform; isConfigured: boolean }[] {
  return ADAPTERS.map((a) => ({ platform: a.platform, isConfigured: a.isConfigured }))
}

// ── Sorting & dedup ───────────────────────────────────────────────────────

function sortByBestSellers(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const salesA = a.ordersCount ?? a.volume ?? 0
    const salesB = b.ordersCount ?? b.volume ?? 0
    const ratingA = a.evaluateRate ?? 0
    const ratingB = b.evaluateRate ?? 0
    return (salesB * 0.6 + ratingB * 0.4) - (salesA * 0.6 + ratingA * 0.4)
  })
}

function dedupByName(products: Product[]): Product[] {
  const seen = new Set<string>()
  return products.filter((p) => {
    const key = `${p.platform ?? 'aliexpress'}-${p.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Title normalization & Jaccard similarity ──────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'and', 'or', 'of', 'in', 'on', 'with', 'to', 'is',
  'best', 'seller', 'popular', 'top', 'rated', 'new', 'hot', 'sale',
  'women', 'womens', "women's", 'men', 'mens', "men's", 'male', 'female',
  'unisex', 'casual', 'shein', 'temu', 'aliexpress',
])

function normalizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\w\s\u0590-\u05ff]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
}

function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

const SIMILARITY_THRESHOLD = 0.6

// ── Product clustering ────────────────────────────────────────────────────

function platformUrl(p: Product): string {
  const platform = p.platform ?? 'aliexpress'
  // Prefer buyUrl (already Skimlinks-wrapped for SHEIN/Temu) over aliexpressUrl
  if (p.buyUrl) return p.buyUrl
  if (p.aliexpressUrl) return p.aliexpressUrl
  if (platform === 'shein') return `https://www.shein.com/search?q=${encodeURIComponent(p.name)}`
  if (platform === 'temu') return `https://www.temu.com/search?q=${encodeURIComponent(p.name)}`
  return `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(p.name)}`
}

function buildPriceComparison(group: Product[]): PriceComparisonEntry[] {
  const entries = group.map((p) => ({
    platform: (p.platform ?? 'aliexpress') as ProductPlatform,
    price: p.price,
    originalPrice: p.originalPrice ?? null,
    currency: p.currency ?? 'ILS',
    productUrl: platformUrl(p),
    sizesAvailable: p.availableSizes ?? [],
    isLowestPrice: false,
  }))
  const minPrice = entries.length > 0 ? Math.min(...entries.map((e) => e.price)) : 0
  entries.forEach((e) => {
    e.isLowestPrice = e.price === minPrice
  })
  return entries.sort((a, b) => a.price - b.price)
}

// ── Offer builder: constructs primaryOffer + secondaryOffers for a product ──

function buildOffersForProduct(representative: Product, group: Product[]): {
  primaryOffer: Offer | null
  secondaryOffers: Offer[]
} {
  const offers: Offer[] = []

  // SHEIN is the primary verified source — add it first
  const sheinProduct = group.find((p) => p.platform === 'shein')
  if (sheinProduct) {
    offers.push({
      platform: 'shein',
      label: PLATFORM_LABELS.shein,
      price: sheinProduct.price,
      currency: sheinProduct.currency,
      url: platformUrl(sheinProduct),
    })
  }

  // Secondary: AliExpress, Temu, CJ (in that order)
  for (const plat of ['aliexpress', 'temu', 'cj'] as ProductPlatform[]) {
    const p = group.find((item) => (item.platform ?? 'aliexpress') === plat)
    if (p) {
      offers.push({
        platform: plat,
        label: PLATFORM_LABELS[plat],
        price: p.price,
        currency: p.currency,
        url: platformUrl(p),
      })
    }
  }

  // If no offers from group, use the representative product itself
  if (offers.length === 0) {
    const plat = representative.platform ?? 'aliexpress'
    offers.push({
      platform: plat,
      label: PLATFORM_LABELS[plat] ?? plat,
      price: representative.price,
      currency: representative.currency,
      url: platformUrl(representative),
    })
  }

  const primaryOffer = offers[0] ?? null
  const secondaryOffers = offers.slice(1)
  return { primaryOffer, secondaryOffers }
}

function clusterProducts(products: Product[]): Product[] {
  // Pre-compute normalized tokens for each product
  const tokenized = products.map((p) => ({
    product: p,
    tokens: normalizeTitle(p.name),
  }))

  const used = new Set<number>()
  const clusters: Product[][] = []

  for (let i = 0; i < tokenized.length; i++) {
    if (used.has(i)) continue
    const cluster: Product[] = [tokenized[i].product]
    used.add(i)

    for (let j = i + 1; j < tokenized.length; j++) {
      if (used.has(j)) continue
      const sim = jaccardSimilarity(tokenized[i].tokens, tokenized[j].tokens)
      const sameCategory = tokenized[i].product.category === tokenized[j].product.category
      const samePlatform = (tokenized[i].product.platform ?? 'aliexpress') === (tokenized[j].product.platform ?? 'aliexpress')
      // Only cluster products from the SAME platform — different platforms should show separately
      if (sim >= SIMILARITY_THRESHOLD && sameCategory && samePlatform) {
        cluster.push(tokenized[j].product)
        used.add(j)
      }
    }

    clusters.push(cluster)
  }

  // Build merged products: pick the lowest-price variant as the representative,
  // attach priceComparison array with all platforms
  return clusters.map((cluster) => {
    const sorted = [...cluster].sort((a, b) => a.price - b.price)
    const representative = { ...sorted[0] }
    representative.priceComparison = buildPriceComparison(cluster)
    // Show the lowest price as the main price
    representative.price = sorted[0].price
    representative.originalPrice = sorted[0].originalPrice
    representative.currency = sorted[0].currency
    // Build primary/secondary offers from the cluster
    const { primaryOffer, secondaryOffers } = buildOffersForProduct(representative, cluster)
    representative.primaryOffer = primaryOffer
    representative.secondaryOffers = secondaryOffers
    return representative
  })
}

// Ensures every product has primaryOffer and secondaryOffers populated.
// Products that already have offers (from clustering) are left intact.
// Single-platform products get a primary offer built from their own data.
function ensureOffers(products: Product[]): Product[] {
  return products.map((p) => {
    if (p.primaryOffer) return p
    const plat = p.platform ?? 'aliexpress'
    const label = PLATFORM_LABELS[plat] ?? plat
    const url = platformUrl(p)
    return {
      ...p,
      primaryOffer: {
        platform: plat,
        label,
        price: p.price,
        currency: p.currency,
        url,
      },
      secondaryOffers: [],
    }
  })
}

// Also ensure images are never empty — fill with category fallback if missing
function ensureImages(products: Product[]): Product[] {
  return products.map((p) => {
    if (p.img && p.img.trim()) return p
    return { ...p, img: getFallbackImage(p.category, p.name) }
  })
}

// ── Public API ────────────────────────────────────────────────────────────

export async function searchAllPlatformsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  extraKeywords?: string,
  ageGroup: AgeGroupFilter = 'adult',
  minPrice = 0,
  maxPrice = 1000,
): Promise<Product[]> {
  const results = await Promise.allSettled([
    sheinSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
    temuSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
    aliSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
    cjSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
  ])

  const merged: Product[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const filtered = filterProducts(merged, category, gender, ageGroup)
  const priceFiltered = filtered.filter((p) => filterByPrice(p, minPrice, maxPrice))
  const deduped = dedupByName(priceFiltered)
  const clustered = clusterProducts(deduped)
  // Sort so SHEIN products appear at the top, then by best-seller score
  const sheinFirst = [...clustered].sort((a, b) => {
    const aShein = a.platform === 'shein' ? 0 : 1
    const bShein = b.platform === 'shein' ? 0 : 1
    if (aShein !== bShein) return aShein - bShein
    const salesA = a.ordersCount ?? a.volume ?? 0
    const salesB = b.ordersCount ?? b.volume ?? 0
    const ratingA = a.evaluateRate ?? 0
    const ratingB = b.evaluateRate ?? 0
    return (salesB * 0.6 + ratingB * 0.4) - (salesA * 0.6 + ratingA * 0.4)
  })
  return ensureImages(ensureOffers(sheinFirst))
}

export async function searchAllPlatformsByQuery(
  keywords: string,
  pageNo = 1,
  pageSize = 50,
  minPrice = 0,
  maxPrice = 1000,
): Promise<Product[]> {
  const results = await Promise.allSettled([
    sheinSearchProducts(keywords, pageNo, pageSize),
    temuSearchProducts(keywords, pageNo, pageSize),
    aliSearchProducts(keywords, pageNo, pageSize),
    cjSearchProducts(keywords, pageNo, pageSize),
  ])

  const merged: Product[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const priceFiltered = merged.filter((p) => filterByPrice(p, minPrice, maxPrice))
  const deduped = dedupByName(priceFiltered)
  const clustered = clusterProducts(deduped)
  const sheinFirst = [...clustered].sort((a, b) => {
    const aShein = a.platform === 'shein' ? 0 : 1
    const bShein = b.platform === 'shein' ? 0 : 1
    if (aShein !== bShein) return aShein - bShein
    const salesA = a.ordersCount ?? a.volume ?? 0
    const salesB = b.ordersCount ?? b.volume ?? 0
    return salesB - salesA
  })
  return ensureImages(ensureOffers(sheinFirst))
}

export async function searchAllPlatformDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  gender?: Gender,
): Promise<Product[]> {
  const results = await Promise.allSettled([
    sheinSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
    temuSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
    aliSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
    cjSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
  ])

  const merged: Product[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const deduped = dedupByName(merged)
  const clustered = clusterProducts(deduped)
  return ensureImages(ensureOffers(sortByBestSellers(clustered)))
}

// ── Platform display helpers (shared by UI components) ────────────────────

export const PLATFORM_LABELS: Record<ProductPlatform, string> = {
  aliexpress: 'AliExpress',
  shein: 'SHEIN',
  temu: 'Temu',
  cj: 'CJ',
}

export const PLATFORM_COLORS: Record<ProductPlatform, string> = {
  aliexpress: '#E84B35',
  shein: '#111827',
  temu: '#2563EB',
  cj: '#FF6B00',
}

export const PLATFORM_LOGOS: Record<ProductPlatform, string> = {
  aliexpress: '🟠',
  shein: '⬛',
  temu: '🔵',
  cj: '🟡',
}
