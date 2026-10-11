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
// Three platforms: SHEIN (primary, public search API), AliExpress (live API, secondary),
// and Temu (live when configured, secondary). SHEIN is always fetched first; AliExpress
// and Temu populate comparison offers only.

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
  // Rank by popularity within each platform group so SHEIN items don't
  // get displaced by high-volume AliExpress/Temu products.
  const shein = products.filter((p) => p.platform === 'shein')
  const others = products.filter((p) => p.platform !== 'shein')

  const rankByPopularity = (items: Product[]): Product[] =>
    [...items].sort((a, b) => {
      const salesA = a.ordersCount ?? a.volume ?? 0
      const salesB = b.ordersCount ?? b.volume ?? 0
      const ratingA = a.evaluateRate ?? 0
      const ratingB = b.evaluateRate ?? 0
      return (salesB * 0.6 + ratingB * 0.4) - (salesA * 0.6 + ratingA * 0.4)
    })

  return [...rankByPopularity(shein), ...rankByPopularity(others)]
}

function dedupByName(products: Product[]): Product[] {
  const seenImages = new Set<string>()
  const seenTitles: { tokens: string[]; nameKey: string }[] = []
  const result: Product[] = []

  for (const p of products) {
    // 1. Reject if the exact same image URL was already seen
    const imgUrl = (p.imageUrl ?? p.img ?? '').trim()
    if (imgUrl && seenImages.has(imgUrl)) continue

    // 2. Reject if title is 90%+ similar to an already-kept product
    const tokens = normalizeTitle(p.name)
    const nameKey = normalizeNameKey(p.name)
    let isDuplicate = false
    for (const seen of seenTitles) {
      const sim = jaccardSimilarity(tokens, seen.tokens)
      if (sim >= 0.9 || nameKey === seen.nameKey) {
        isDuplicate = true
        break
      }
    }
    if (isDuplicate) continue

    if (imgUrl) seenImages.add(imgUrl)
    seenTitles.push({ tokens, nameKey })
    result.push(p)
  }

  console.log(`[Deduplication] Filtered out duplicate image/title variants. Rendering ${result.length} unique items.`)
  return result
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

// ── PDP / search validation ───────────────────────────────────────────────
// A valid destination URL is either a direct Product Detail Page (contains
// a specific product ID) or a SHEIN search results page (/pdsearch/).
// SHEIN search URLs are used by the curated catalog: each product's title
// is turned into a search URL so the image, title, and destination all
// describe the same item.

const SHEIN_PDP_RE = /-p-\d+\.html(?:$|[?#])/i
const SHEIN_SEARCH_RE = /\/pdsearch\//i
const ALIEXPRESS_PDP_RE = /\/item\/|product\/[a-z0-9]+$/i
const TEMU_PDP_RE = /\/goods\/|\/p\/[a-z0-9_-]+\.html/i
const TEMU_SEARCH_RE = /search_result\.html/i

export function isDirectPdpUrl(url: string): boolean {
  if (!url) return false
  // Skimlinks-wrapped URLs contain the real URL as a query param
  const skimlinksMatch = url.match(/[?&]url=([^&]+)/i)
  const rawUrl = skimlinksMatch ? decodeURIComponent(skimlinksMatch[1]) : url
  if (SHEIN_PDP_RE.test(rawUrl)) return true
  if (SHEIN_SEARCH_RE.test(rawUrl)) return true
  if (ALIEXPRESS_PDP_RE.test(rawUrl)) return true
  if (TEMU_PDP_RE.test(rawUrl)) return true
  if (TEMU_SEARCH_RE.test(rawUrl)) return true
  return false
}

function filterToPdpProducts(products: Product[]): Product[] {
  const before = products.length
  const result = products.filter((p) => {
    const url = platformUrl(p)
    return isDirectPdpUrl(url)
  })
  if (result.length < before) {
    console.log(`[PDP Filter] Filtered out ${before - result.length} products without direct PDP URLs (kept ${result.length})`)
  }
  return result
}

// Filter to high-rated products (4.0+). Products with no rating data are kept
// so the feed isn't empty when rating info is unavailable from the API.
function filterByHighRating(products: Product[]): Product[] {
  const result = products.filter((p) => {
    const rating = p.evaluateRate ?? 0
    if (rating === 0) return true
    return rating >= 4.0
  })
  if (result.length < products.length) {
    console.log(`[Rating Filter] Filtered out ${products.length - result.length} products below 4.0 rating (kept ${result.length})`)
  }
  return result
}

// Strict 3-tier platform ordering: SHEIN first, then AliExpress, then Temu.
// Within each tier, products are sorted by ascending price (lowest to highest).
// This sort is applied last and is the final word on ordering — no other sort
// can mix platforms.
function sortByPlatformThenPrice(products: Product[]): Product[] {
  const PLATFORM_ORDER: Record<string, number> = { shein: 0, aliexpress: 1, temu: 2 }
  return [...products].sort((a, b) => {
    const aRank = PLATFORM_ORDER[a.platform ?? 'aliexpress'] ?? 3
    const bRank = PLATFORM_ORDER[b.platform ?? 'aliexpress'] ?? 3
    if (aRank !== bRank) return aRank - bRank
    return a.price - b.price
  })
}

// ── Product clustering ────────────────────────────────────────────────────

function platformUrl(p: Product): string {
  if (p.buyUrl) return p.buyUrl
  if (p.platform === 'shein' && p.aliexpressUrl) return p.aliexpressUrl
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

  // SHEIN is always the primary offer when available — but ONLY if it has
  // a verified direct PDP URL.
  const sheinProduct = group.find((p) => p.platform === 'shein' && isDirectPdpUrl(platformUrl(p)))
  if (sheinProduct) {
    const sheinUrl = platformUrl(sheinProduct)
    offers.push({
      platform: 'shein',
      label: PLATFORM_LABELS.shein,
      price: sheinProduct.price,
      currency: sheinProduct.currency,
      url: sheinUrl,
    })
    usedPlatforms.add('shein')
    console.log('[Offer Builder] Bound SHEIN PDP URL:', sheinUrl)
  }

  // Only fall back to AliExpress as primary if NO SHEIN PDP exists.
  const aliProduct = group.find((p) => (p.platform ?? 'aliexpress') === 'aliexpress' && isDirectPdpUrl(platformUrl(p)))
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

  // Secondary: Temu with a direct PDP URL only
  const temuProduct = group.find((p) => p.platform === 'temu' && isDirectPdpUrl(platformUrl(p)))
  if (temuProduct) {
    offers.push({
      platform: 'temu',
      label: PLATFORM_LABELS.temu,
      price: temuProduct.price,
      currency: temuProduct.currency,
      url: platformUrl(temuProduct),
    })
    usedPlatforms.add('temu')
  }

  // Secondary: AliExpress if it wasn't the primary and has a PDP URL
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
  // SHEIN is the primary feed source. AliExpress and Temu fill in as
  // secondary feed items and price-comparison offers.
  const sheinProducts = await sheinSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup)
  console.log('[Search Service] Primary source loaded: SHEIN', `(${sheinProducts.length} products)`)

  // Fetch secondary platforms in parallel.
  const secondaryResults = await Promise.allSettled([
    aliSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
    temuSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup),
  ])

  const merged: Product[] = [...sheinProducts]
  for (const r of secondaryResults) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const filtered = filterProducts(merged, category, gender, ageGroup)
  const priceFiltered = filtered.filter((p) => filterByPrice(p, minPrice, maxPrice))
  const highRated = filterByHighRating(priceFiltered)
  const pdpOnly = filterToPdpProducts(highRated)
  const deduped = dedupByName(pdpOnly)
  const clustered = clusterProducts(deduped)
  const bestSellerRanked = sortByBestSellers(clustered)
  const priceSorted = sortByPlatformThenPrice(bestSellerRanked)
  console.log('[Feed Ranking] Sorted feed: SHEIN priority first, then AliExpress, then Temu.')
  return ensureOffers(priceSorted)
}

export async function searchAllPlatformsByQuery(
  keywords: string,
  pageNo = 1,
  pageSize = 50,
  minPrice = 0,
  maxPrice = 1000,
): Promise<Product[]> {
  // SHEIN is the primary feed source.
  const sheinProducts = await sheinSearchProducts(keywords, pageNo, pageSize)
  console.log('[Search Service] Primary source loaded: SHEIN', `(${sheinProducts.length} products)`)

  // Fetch secondary platforms in parallel.
  const secondaryResults = await Promise.allSettled([
    aliSearchProducts(keywords, pageNo, pageSize),
    temuSearchProducts(keywords, pageNo, pageSize),
  ])

  const merged: Product[] = [...sheinProducts]
  for (const r of secondaryResults) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const priceFiltered = merged.filter((p) => filterByPrice(p, minPrice, maxPrice))
  const highRated = filterByHighRating(priceFiltered)
  const pdpOnly = filterToPdpProducts(highRated)
  const deduped = dedupByName(pdpOnly)
  const clustered = clusterProducts(deduped)
  const bestSellerRanked = sortByBestSellers(clustered)
  const priceSorted = sortByPlatformThenPrice(bestSellerRanked)
  console.log('[Feed Ranking] Sorted feed: SHEIN priority first, then AliExpress, then Temu.')
  return ensureOffers(priceSorted)
}

export async function searchAllPlatformDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  gender?: Gender,
): Promise<Product[]> {
  // SHEIN is the primary feed source.
  const sheinProducts = await sheinSearchDeviceAccessories(deviceName, pageNo, pageSize, gender)
  console.log('[Search Service] Primary source loaded: SHEIN', `(${sheinProducts.length} products)`)

  // Fetch secondary platforms in parallel.
  const secondaryResults = await Promise.allSettled([
    aliSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
    temuSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
  ])

  const merged: Product[] = [...sheinProducts]
  for (const r of secondaryResults) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const pdpOnly = filterToPdpProducts(merged)
  const deduped = dedupByName(pdpOnly)
  const clustered = clusterProducts(deduped)
  const bestSellerRanked = sortByBestSellers(clustered)
  const priceSorted = sortByPlatformThenPrice(bestSellerRanked)
  console.log('[Feed Ranking] Sorted feed: SHEIN priority first, then AliExpress, then Temu.')
  return ensureOffers(priceSorted)
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
