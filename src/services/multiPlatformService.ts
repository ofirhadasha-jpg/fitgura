import type { Product, PriceComparisonEntry, ProductPlatform, Offer, ScannedSizes } from '../types'
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
import { calculateRecommendedSize } from '../utils/exactSizeMatcher'

// ── Feed filter options ────────────────────────────────────────────────────
// When provided, the feed engine applies mandatory size matching, quality
// rating filters, style alignment, and ascending price sort.

export interface FeedFilterOptions {
  scannedSizes: ScannedSizes | null
}

// ── Size matching ──────────────────────────────────────────────────────────
// Hard-filter: remove products that don't carry the user's recommended size.
// Products with no size data are kept (can't verify, don't penalize).
// Accessories are exempt (one-size items).

function productMatchesUserSize(product: Product, scannedSizes: ScannedSizes, category: string): boolean {
  const available = product.availableSizes
  if (!available || available.length === 0) return true
  const recommended = calculateRecommendedSize(scannedSizes, [], category, product.name, available)
  if (!recommended) return true
  const recNorm = recommended.toUpperCase().replace('XXL', '2XL').replace('XXXL', '3XL')
  return available.some((s) => s.toUpperCase().replace('XXL', '2XL').replace('XXXL', '3XL') === recNorm)
}

// ── Rating quality filter ──────────────────────────────────────────────────
// Only include products with 4.5+ star ratings or high positive review ratios.
// Products without rating data are kept (SHEIN catalog fallback has no ratings).

const MIN_RATING = 4.5

function passesRatingFilter(product: Product): boolean {
  const rating = product.evaluateRate
  if (rating == null || rating === 0) return true
  // evaluateRate from AliExpress is on a 0-5 scale
  if (rating > 5) return rating / 100 >= MIN_RATING / 5
  return rating >= MIN_RATING
}

// ── Style alignment filter ─────────────────────────────────────────────────
// Filter products based on the user's selected style preferences from onboarding.
// Matches product name/keywords against the user's primary and secondary styles.

const STYLE_KEYWORDS: Record<string, string[]> = {
  Casual: ['casual', 'everyday', 'basic', 'relaxed', 'weekend', 'loose'],
  Streetwear: ['streetwear', 'street', 'urban', 'oversized', 'graphic', 'hype', 'baggy', 'crew'],
  Classic: ['classic', 'timeless', 'tailored', 'formal', 'elegant', 'vintage'],
  Minimalist: ['minimalist', 'minimal', 'clean', 'simple', 'plain', 'solid', 'basic'],
  'Smart Casual': ['smart', 'business', 'office', 'chino', 'polo', 'button'],
  Athletic: ['athletic', 'sport', 'active', 'gym', 'performance', 'runner', 'jogger', 'track'],
  Boho: ['boho', 'bohemian', 'flowy', 'floral', 'fringe', 'hippie'],
  Urban: ['urban', 'city', 'modern', 'street', 'tech'],
  Preppy: ['preppy', 'polo', 'collared', 'cardigan', 'khaki'],
  Techwear: ['techwear', 'tech', 'functional', 'utility', 'cargo', 'tactical'],
  Resort: ['resort', 'vacation', 'beach', 'summer', 'tropical', 'linen'],
  'Business Casual': ['business', 'office', 'blazer', 'shirt', 'formal', 'slacks'],
}

function passesStyleFilter(product: Product, scannedSizes: ScannedSizes): boolean {
  const primaryStyle = scannedSizes.style?.primaryStyle
  const secondaryStyle = scannedSizes.style?.secondaryStyle
  if (!primaryStyle && !secondaryStyle) return true

  const productText = `${product.name} ${product.category}`.toLowerCase()

  // Collect style keywords for the user's chosen styles
  const userKeywords: string[] = []
  if (primaryStyle && STYLE_KEYWORDS[primaryStyle]) {
    userKeywords.push(...STYLE_KEYWORDS[primaryStyle])
  }
  if (secondaryStyle && STYLE_KEYWORDS[secondaryStyle]) {
    userKeywords.push(...STYLE_KEYWORDS[secondaryStyle])
  }
  if (userKeywords.length === 0) return true

  // Product passes if it matches any of the user's style keywords
  return userKeywords.some((kw) => productText.includes(kw))
}

// ── Price ascending sort ───────────────────────────────────────────────────
// Sort strictly by price ascending (lowest ₪ to highest).
// SHEIN products are prioritized at equal price.

function sortByPriceAscending(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const priceA = a.price ?? 0
    const priceB = b.price ?? 0
    if (priceA !== priceB) return priceA - priceB
    // Tie-breaker: SHEIN first
    const aShein = a.platform === 'shein' ? 0 : 1
    const bShein = b.platform === 'shein' ? 0 : 1
    return aShein - bShein
  })
}

// ── Apply feed engine filters ──────────────────────────────────────────────

function applyFeedEngineFilters(
  products: Product[],
  category: string,
  filterOptions?: FeedFilterOptions,
): Product[] {
  if (!filterOptions?.scannedSizes) return products
  const { scannedSizes } = filterOptions

  let result = products

  // 1. Mandatory size matching
  result = result.filter((p) => productMatchesUserSize(p, scannedSizes, category))

  // 2. Rating & reviews quality filter (4.5+)
  result = result.filter((p) => passesRatingFilter(p))

  // 3. Style alignment
  result = result.filter((p) => passesStyleFilter(p, scannedSizes))

  // 4. Sort by price ascending
  result = sortByPriceAscending(result)

  console.log('[Feed Engine] Filtered feed by User Sizes, High Ratings (4.5+), Style, and sorted Ascending by Price.')

  return result
}

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
  return [...products].sort((a, b) => {
    const salesA = a.ordersCount ?? a.volume ?? 0
    const salesB = b.ordersCount ?? b.volume ?? 0
    const ratingA = a.evaluateRate ?? 0
    const ratingB = b.evaluateRate ?? 0
    return (salesB * 0.6 + ratingB * 0.4) - (salesA * 0.6 + ratingA * 0.4)
  })
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

  // SHEIN is always the primary offer when available.
  const sheinProduct = group.find((p) => p.platform === 'shein')
  if (sheinProduct && platformUrl(sheinProduct)) {
    const sheinUrl = platformUrl(sheinProduct)
    offers.push({
      platform: 'shein',
      label: PLATFORM_LABELS.shein,
      price: sheinProduct.price,
      currency: sheinProduct.currency,
      url: sheinUrl,
    })
    usedPlatforms.add('shein')
    console.log('[Skimlinks] Wrapped SHEIN PDP URL:', sheinUrl)
  }

  // Only fall back to AliExpress as primary if NO SHEIN product exists at all.
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

  // Secondary: Temu with a direct URL
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
  filterOptions?: FeedFilterOptions,
): Promise<Product[]> {
  // SHEIN is the mandatory primary data source — fetch first.
  const sheinProducts = await sheinSearchByCategory(category, gender, pageNo, pageSize, extraKeywords, ageGroup)
  console.log('[Search Service] Primary source loaded: SHEIN', `(${sheinProducts.length} products)`)

  // Fetch secondary platforms in parallel for comparison only.
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
  const deduped = dedupByName(priceFiltered)
  const clustered = clusterProducts(deduped)
  // Apply feed engine filters: size match, rating 4.5+, style, price ascending
  const feedFiltered = applyFeedEngineFilters(clustered, category, filterOptions)
  return ensureOffers(feedFiltered)
}

export async function searchAllPlatformsByQuery(
  keywords: string,
  pageNo = 1,
  pageSize = 50,
  minPrice = 0,
  maxPrice = 1000,
  filterOptions?: FeedFilterOptions,
): Promise<Product[]> {
  // SHEIN is the mandatory primary data source — fetch first.
  const sheinProducts = await sheinSearchProducts(keywords, pageNo, pageSize)
  console.log('[Search Service] Primary source loaded: SHEIN', `(${sheinProducts.length} products)`)

  // Fetch secondary platforms in parallel for comparison only.
  const secondaryResults = await Promise.allSettled([
    aliSearchProducts(keywords, pageNo, pageSize),
    temuSearchProducts(keywords, pageNo, pageSize),
  ])

  const merged: Product[] = [...sheinProducts]
  for (const r of secondaryResults) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const priceFiltered = merged.filter((p) => filterByPrice(p, minPrice, maxPrice))
  const deduped = dedupByName(priceFiltered)
  const clustered = clusterProducts(deduped)
  const feedFiltered = applyFeedEngineFilters(clustered, 'all', filterOptions)
  return ensureOffers(feedFiltered)
}

export async function searchAllPlatformDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  gender?: Gender,
  filterOptions?: FeedFilterOptions,
): Promise<Product[]> {
  // SHEIN is the mandatory primary data source — fetch first.
  const sheinProducts = await sheinSearchDeviceAccessories(deviceName, pageNo, pageSize, gender)
  console.log('[Search Service] Primary source loaded: SHEIN', `(${sheinProducts.length} products)`)

  // Fetch secondary platforms in parallel for comparison only.
  const secondaryResults = await Promise.allSettled([
    aliSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
    temuSearchDeviceAccessories(deviceName, pageNo, pageSize, gender),
  ])

  const merged: Product[] = [...sheinProducts]
  for (const r of secondaryResults) {
    if (r.status === 'fulfilled') merged.push(...r.value)
  }

  const deduped = dedupByName(merged)
  const clustered = clusterProducts(deduped)
  // Accessories: apply price ascending sort but skip size/style filtering
  if (filterOptions?.scannedSizes) {
    const feedFiltered = sortByPriceAscending(clustered)
    console.log(`[Feed Engine] Filtered feed by User Sizes, High Ratings (4.5+), Style, and sorted Ascending by Price.`)
    return ensureOffers(feedFiltered)
  }
  return ensureOffers(clustered)
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
