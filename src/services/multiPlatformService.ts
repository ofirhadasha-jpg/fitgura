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
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'

// ── Adapter registry ─────────────────────────────────────────────────────────
// Three platforms: AliExpress (live API), SHEIN (CJ Affiliate, live when configured),
// and Temu (live when configured). CJ adapter removed — it was returning irrelevant
// AliExpress re-tags. SHEIN and Temu return empty without credentials; the aggregator
// auto-generates real search links as secondary offers on every product.

export const ADAPTERS: AffiliateAdapter[] = [
  aliExpressAdapter,
  sheinAdapter,
  temuAdapter,
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

const SIMILARITY_THRESHOLD = 0.45

function normalizeNameKey(title: string): string {
  return normalizeTitle(title).sort().join(' ')
}

// ── Product clustering ────────────────────────────────────────────────────

function platformUrl(p: Product): string {
  const platform = p.platform ?? 'aliexpress'
  if (p.buyUrl) return p.buyUrl
  if (p.aliexpressUrl) return p.aliexpressUrl
  return ''
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

// ── Offer builder ───────────────────────────────────────────────────────────
// For each product, build a primary offer (SHEIN if available, else the product's
// own platform) and secondary offers (Temu + AliExpress). When SHEIN/Temu don't
// return real products, we still generate valid search-link offers so users can
// check prices on those platforms.

function buildOffersForProduct(product: Product, group: Product[]): {
  primaryOffer: Offer | null
  secondaryOffers: Offer[]
} {
  const offers: Offer[] = []
  const usedPlatforms = new Set<string>()

  // SHEIN as primary if we have a real SHEIN product in the cluster
  const sheinProduct = group.find((p) => p.platform === 'shein')
  if (sheinProduct) {
    offers.push({
      platform: 'shein',
      label: PLATFORM_LABELS.shein,
      price: sheinProduct.price,
      currency: sheinProduct.currency,
      url: platformUrl(sheinProduct),
    })
    usedPlatforms.add('shein')
  }

  // AliExpress as primary if no SHEIN product
  const aliProduct = group.find((p) => (p.platform ?? 'aliexpress') === 'aliexpress')
  if (aliProduct && offers.length === 0) {
    offers.push({
      platform: 'aliexpress',
      label: PLATFORM_LABELS.aliexpress,
      price: aliProduct.price,
      currency: aliProduct.currency,
      url: platformUrl(aliProduct),
    })
    usedPlatforms.add('aliexpress')
  }

  // Add only platform products with a direct URL. Visual matches are loaded when a product is opened.
  const temuProduct = group.find((p) => p.platform === 'temu')
  if (temuProduct && platformUrl(temuProduct)) {
    offers.push({
      platform: 'temu',
      label: PLATFORM_LABELS.temu,
      price: temuProduct.price,
      currency: temuProduct.currency,
      url: platformUrl(temuProduct),
    })
    usedPlatforms.add('temu')
  }

  if (!usedPlatforms.has('shein') && sheinProduct && platformUrl(sheinProduct)) {
    offers.push({
      platform: 'shein',
      label: PLATFORM_LABELS.shein,
      price: sheinProduct.price,
      currency: sheinProduct.currency,
      url: platformUrl(sheinProduct),
    })
    usedPlatforms.add('shein')
  }

  // Secondary: AliExpress if it wasn't the primary
  if (!usedPlatforms.has('aliexpress') && aliProduct) {
    offers.push({
      platform: 'aliexpress',
      label: PLATFORM_LABELS.aliexpress,
      price: aliProduct.price,
      currency: aliProduct.currency,
      url: platformUrl(aliProduct),
    })
  }

  const primaryOffer = offers[0] ?? null
  const secondaryOffers = offers.slice(1).filter((o) => o.price > 0 || o.url)
  return { primaryOffer, secondaryOffers }
}

function clusterProducts(products: Product[]): Product[] {
  const tokenized = products.map((p) => ({
    product: p,
    tokens: normalizeTitle(p.name),
    nameKey: `${p.category}-${normalizeNameKey(p.name)}`,
  }))

  const used = new Set<number>()
  const clusters: Product[][] = []

  for (let i = 0; i < tokenized.length; i++) {
    if (used.has(i)) continue
    const cluster: Product[] = [tokenized[i].product]
    used.add(i)

    for (let j = i + 1; j < tokenized.length; j++) {
      if (used.has(j)) continue
      const sameCategory = tokenized[i].product.category === tokenized[j].product.category
      if (!sameCategory) continue

      const exactNameMatch = tokenized[i].nameKey === tokenized[j].nameKey
      if (exactNameMatch) {
        const plat = tokenized[j].product.platform ?? 'aliexpress'
        if (!cluster.some((c) => (c.platform ?? 'aliexpress') === plat)) {
          cluster.push(tokenized[j].product)
          used.add(j)
        }
        continue
      }

      const sim = jaccardSimilarity(tokenized[i].tokens, tokenized[j].tokens)
      if (sim >= SIMILARITY_THRESHOLD) {
        const plat = tokenized[j].product.platform ?? 'aliexpress'
        if (!cluster.some((c) => (c.platform ?? 'aliexpress') === plat)) {
          cluster.push(tokenized[j].product)
          used.add(j)
        }
      }
    }

    clusters.push(cluster)
  }

  return clusters.map((cluster) => {
    const sheinProduct = cluster.find((p) => p.platform === 'shein')
    const sorted = [...cluster].sort((a, b) => a.price - b.price)
    const representative = { ...(sheinProduct ?? sorted[0]) }
    representative.priceComparison = buildPriceComparison(cluster)
    representative.price = sorted[0].price
    representative.originalPrice = sorted[0].originalPrice
    representative.currency = sorted[0].currency
    const { primaryOffer, secondaryOffers } = buildOffersForProduct(representative, cluster)
    representative.primaryOffer = primaryOffer
    representative.secondaryOffers = secondaryOffers
    return representative
  })
}

// Ensures every product has primaryOffer and secondaryOffers populated.
function ensureOffers(products: Product[]): Product[] {
  return products.map((p) => {
    if (p.primaryOffer) return p
    const { primaryOffer, secondaryOffers } = buildOffersForProduct(p, [p])
    return { ...p, primaryOffer, secondaryOffers }
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
    aliSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
    sheinSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
    temuSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
  ])

  const merged: Product[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const filtered = filterProducts(merged, category, gender, ageGroup)
  const priceFiltered = filtered.filter((p) => filterByPrice(p, minPrice, maxPrice))
  const deduped = dedupByName(priceFiltered)
  const clustered = clusterProducts(deduped)
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
  return ensureOffers(sheinFirst)
}

export async function searchAllPlatformsByQuery(
  keywords: string,
  pageNo = 1,
  pageSize = 50,
  minPrice = 0,
  maxPrice = 1000,
): Promise<Product[]> {
  const results = await Promise.allSettled([
    aliSearchProducts(keywords, pageNo, pageSize),
    sheinSearchProducts(keywords, pageNo, pageSize),
    temuSearchProducts(keywords, pageNo, pageSize),
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
  return ensureOffers(sheinFirst)
}

export async function searchAllPlatformDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  gender?: Gender,
): Promise<Product[]> {
  const results = await Promise.allSettled([
    aliSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
    sheinSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
    temuSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
  ])

  const merged: Product[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const deduped = dedupByName(merged)
  const clustered = clusterProducts(deduped)
  return ensureOffers(sortByBestSellers(clustered))
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
