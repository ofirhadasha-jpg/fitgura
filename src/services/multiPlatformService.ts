import type { Product, PriceComparisonEntry, ProductPlatform } from '../types'
import {
  searchProductsByCategory as aliSearchByCategory,
  searchProducts as aliSearchProducts,
  searchDeviceAccessories as aliSearchDeviceAccessories,
  filterProducts,
  filterByPrice,
} from './aliexpressClient'
import {
  searchProductsByCategory as sheinSearchByCategory,
  searchProducts as sheinSearchProducts,
  searchDeviceAccessories as sheinSearchDeviceAccessories,
} from './sheinClient'
import {
  searchProductsByCategory as temuSearchByCategory,
  searchProducts as temuSearchProducts,
  searchDeviceAccessories as temuSearchDeviceAccessories,
} from './temuClient'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'

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
  if (p.aliexpressUrl) return p.aliexpressUrl
  const platform = p.platform ?? 'aliexpress'
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
  const minPrice = Math.min(...entries.map((e) => e.price))
  entries.forEach((e) => {
    e.isLowestPrice = e.price === minPrice
  })
  return entries.sort((a, b) => a.price - b.price)
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
      if (sim >= SIMILARITY_THRESHOLD && sameCategory) {
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
    return representative
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
  return sortByBestSellers(clustered)
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
  return sortByBestSellers(clustered)
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
  return sortByBestSellers(clustered)
}

// ── Platform display helpers (shared by UI components) ────────────────────

export const PLATFORM_LABELS: Record<ProductPlatform, string> = {
  aliexpress: 'AliExpress',
  shein: 'SHEIN',
  temu: 'Temu',
}

export const PLATFORM_COLORS: Record<ProductPlatform, string> = {
  aliexpress: '#E84B35',
  shein: '#111827',
  temu: '#2563EB',
}

export const PLATFORM_LOGOS: Record<ProductPlatform, string> = {
  aliexpress: '🟠',
  shein: '⬛',
  temu: '🔵',
}
