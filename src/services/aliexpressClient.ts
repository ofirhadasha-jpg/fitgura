import { fetchAliExpressProducts, fetchProductDetails, generateAffiliateLink as fetchAffiliateLink } from '../lib/aliexpress'
import type { Product } from '../types'

export type Gender = 'male' | 'female' | 'unisex'
export type FeedCategory = 'all' | 'clothing' | 'shoes' | 'accessories'

const BATCH_SIZE = 200
const ILS_TO_USD_RATE = 3.7

/**
 * Safe client-side price filter.
 * Prices from the edge function arrive in ILS (target_currency=ILS).
 * If price parsing fails (NaN or 0), the item is kept — never discarded.
 */
export function filterByPrice(product: Product, minILS: number, maxILS: number): boolean {
  const rawPrice = product.price
  const numericPrice = typeof rawPrice === 'number' && !isNaN(rawPrice) ? rawPrice : 0
  if (numericPrice === 0) return true
  const isUSD = product.currency === 'USD' || (!product.currency || product.currency === '')
  const priceInILS = isUSD ? numericPrice * ILS_TO_USD_RATE : numericPrice
  return priceInILS >= minILS && priceInILS <= maxILS
}

// ── Gender keyword injection ──────────────────────────────────────────────

const GENDER_POSITIVE: Record<string, string[]> = {
  female: ['women', 'womens', 'female', 'ladies', 'lady'],
  male: ['men', 'mens', 'male'],
  unisex: [],
}

const GENDER_REJECT: Record<string, RegExp> = {
  female: /\b(men|men's|mens|male|boy|boys|man|man's|for him)\b/i,
  male: /\b(women|women's|womens|woman|female|girl|girls|lady|ladies|for her)\b/i,
  unisex: /$^/,
}

const BOTH_GENDERS_REGEX = /\b(men|men's|mens|male|boy|boys|man|man's|for him)\b.*\b(women|women's|womens|woman|female|girl|girls|lady|ladies|for her)\b|\b(women|women's|womens|woman|female|girl|girls|lady|ladies|for her)\b.*\b(men|men's|mens|male|boy|boys|man|man's|for him)\b/i

// ── Top-searched AliExpress query arrays by category & gender ──────────────

export const TOP_ALIEXPRESS_QUERIES = {
  female: {
    clothing: [
      'women dress best seller', 'women tops blouses best seller', 'women pants jeans best seller',
      'women skirts popular', 'women sweaters hoodies popular', 'women coats jackets best seller',
      'women suits sets popular', 'women lingerie underwear top rated', 'women activewear leggings best seller',
    ],
    shoes: [
      'women sneakers best seller', 'women boots popular', 'women sandals best seller',
      'women heels pumps top rated', 'women casual shoes best seller', 'women loafers flats popular',
      'women running shoes best seller',
    ],
  },
  male: {
    clothing: [
      'men t shirts best seller', 'men pants jeans popular', 'men hoodies sweatshirts best seller',
      'men jackets coats top rated', 'men shirts best seller', 'men shorts popular',
      'men suits blazers best seller', 'men sportswear tracksuit popular',
    ],
    shoes: [
      'men sneakers best seller', 'men casual shoes popular', 'men running shoes best seller',
      'men boots top rated', 'men sandals slippers best seller', 'men dress shoes loafers popular',
    ],
  },
} as const

const CLOTHING_SUBQUERIES_UNISEX = [
  ...TOP_ALIEXPRESS_QUERIES.female.clothing,
  ...TOP_ALIEXPRESS_QUERIES.male.clothing,
]

const SHOES_SUBQUERIES_UNISEX = [
  ...TOP_ALIEXPRESS_QUERIES.female.shoes,
  ...TOP_ALIEXPRESS_QUERIES.male.shoes,
]

const CATEGORY_IDS_CLOTHING = '200000783,200000782'
const CATEGORY_IDS_SHOES = '200000835,200000832,200000831'

// ── Hard-exclusion keyword lists ───────────────────────────────────────────

const FOOTWEAR_TERMS = [
  'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots',
  'heel', 'heels', 'sandal', 'sandals', 'slipper', 'slippers',
  'footwear', 'pump', 'pumps', 'loafer', 'loafers',
  'wedge', 'wedges', 'נעל', 'נעליים', 'סניקרס', 'מגף', 'מגפיים', 'סנדל', 'סנדלים',
]

const APPAREL_TERMS = [
  'dress', 'skirt', 'suit', 'bra', 'lingerie', 'panties',
  'shirt', 'blouse', 'jacket', 'coat', 'pants', 'trouser',
  'hoodie', 'sweater', 'jeans', 'shorts', 'top', 't-shirt',
  'שמלה', 'חצאית', 'חליפה', 'חולצה', 'מעיל', 'מכנסיים', 'בגד',
]

const FOOTWEAR_REGEX = new RegExp(`\\b(${FOOTWEAR_TERMS.join('|')})\\b`, 'i')
const APPAREL_REGEX = new RegExp(`\\b(${APPAREL_TERMS.join('|')})\\b`, 'i')

const CATEGORY_IDS: Record<FeedCategory, string | undefined> = {
  all: undefined,
  clothing: CATEGORY_IDS_CLOTHING,
  shoes: CATEGORY_IDS_SHOES,
  accessories: '5090301,509',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function dedupById(products: Product[]): Product[] {
  const seen = new Set<string>()
  return products.filter((p) => {
    if (p.aliexpressSku && seen.has(p.aliexpressSku)) return false
    if (p.aliexpressSku) seen.add(p.aliexpressSku)
    return true
  })
}

function sortByBestSellers(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const salesA = a.ordersCount ?? a.volume ?? 0
    const salesB = b.ordersCount ?? b.volume ?? 0
    const ratingA = a.evaluateRate ?? 0
    const ratingB = b.evaluateRate ?? 0
    return (salesB * 0.6 + ratingB * 0.4) - (salesA * 0.6 + ratingA * 0.4)
  })
}

export function filterProducts(
  products: Product[],
  category: FeedCategory,
  gender: Gender,
): Product[] {
  const rejectRegex = GENDER_REJECT[gender] ?? /$^/
  return products.filter((p) => {
    const name = p.name ?? ''
    if (rejectRegex.test(name)) return false
    if (gender !== 'unisex' && BOTH_GENDERS_REGEX.test(name)) return false
    if (category === 'clothing' && FOOTWEAR_REGEX.test(name)) return false
    if (category === 'shoes' && APPAREL_REGEX.test(name) && !FOOTWEAR_REGEX.test(name)) return false
    if (category === 'accessories') {
      if (APPAREL_REGEX.test(name)) return false
      if (FOOTWEAR_REGEX.test(name)) return false
    }
    return true
  })
}

function getQueryPool(category: FeedCategory, gender: Gender): { clothing: readonly string[]; shoes: readonly string[] } {
  const clothing = gender === 'female'
    ? TOP_ALIEXPRESS_QUERIES.female.clothing
    : gender === 'male'
      ? TOP_ALIEXPRESS_QUERIES.male.clothing
      : CLOTHING_SUBQUERIES_UNISEX
  const shoes = gender === 'female'
    ? TOP_ALIEXPRESS_QUERIES.female.shoes
    : gender === 'male'
      ? TOP_ALIEXPRESS_QUERIES.male.shoes
      : SHOES_SUBQUERIES_UNISEX
  return { clothing, shoes }
}

// ── 200-Product Batch Aggregator ───────────────────────────────────────────

async function aggregateBatch(
  category: FeedCategory,
  gender: Gender,
  batchNo: number,
): Promise<Product[]> {
  const { clothing: clothingPool, shoes: shoePool } = getQueryPool(category, gender)

  // For "all": run clothing and shoes as separate batches with their own category IDs
  // so the edge function applies gender + category filtering correctly for each.
  // For specific categories: use the single matching pool + category IDs.
  type SubBatch = { queries: readonly string[]; categoryIds: string }
  const subBatches: SubBatch[] = []
  if (category === 'all' || category === 'clothing') {
    subBatches.push({ queries: clothingPool, categoryIds: CATEGORY_IDS_CLOTHING })
  }
  if (category === 'all' || category === 'shoes') {
    subBatches.push({ queries: shoePool, categoryIds: CATEGORY_IDS_SHOES })
  }

  const collected: Product[] = []
  const seenIds = new Set<string>()
  const perQuerySize = 40
  let currentPage = batchNo
  let attempts = 0
  const maxAttempts = 2

  while (collected.length < BATCH_SIZE && attempts < maxAttempts) {
    attempts++
    // Gather 4 queries round-robin from each sub-batch
    const roundQueries: { q: string; categoryIds: string }[] = []
    for (const sb of subBatches) {
      const startIdx = (batchNo - 1) * 4 + (attempts - 1) * 4
      for (let i = 0; i < Math.min(4, sb.queries.length); i++) {
        roundQueries.push({ q: sb.queries[(startIdx + i) % sb.queries.length], categoryIds: sb.categoryIds })
      }
    }

    const raw = await Promise.all(
      roundQueries.map(({ q, categoryIds }) =>
        fetchAliExpressProducts(q, currentPage, perQuerySize, gender, categoryIds, 'VOLUME_DOWN'),
      ),
    )

    // Dedup against already-collected
    for (const p of raw.flat()) {
      const id = p.aliexpressSku
      if (id && seenIds.has(id)) continue
      if (id) seenIds.add(id)
      collected.push(p)
    }

    currentPage++
  }

  const deduped = dedupById(collected)
  const filtered = filterProducts(deduped, category, gender)
  return sortByBestSellers(filtered)
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  _pageSize: number,
  _extraKeywords?: string,
): Promise<Product[]> {
  console.log('[aliexpressClient] searchProductsByCategory:', { category, gender, pageNo, batchSize: BATCH_SIZE })
  return aggregateBatch(category, gender, pageNo)
}

// ── Smartwatch / Wearable detection ──────────────────────────────────────────

const SMARTWATCH_KEYWORDS = ['watch', 'galaxy watch', 'apple watch', 'pixel watch', 'garmin', 'fitbit']

export function isSmartwatch(deviceName: string): boolean {
  const lower = deviceName.toLowerCase()
  return SMARTWATCH_KEYWORDS.some((kw) => lower.includes(kw))
}

const DEVICE_ACCESSORY_QUERIES = (d: string) => [
  `${d} strap band`,
  `${d} screen protector glass`,
  `${d} charger cable`,
  `${d} case cover protector`,
  `${d} accessories`,
]

const SMARTWATCH_QUERIES = (d: string) => [
  `${d} strap band`,
  `${d} screen protector glass`,
  `${d} charger cable`,
  `${d} case cover protector`,
  `${d} accessories`,
]

const LAPTOP_QUERIES = (d: string) => [
  `${d} laptop case cover sleeve`,
  `${d} screen protector glass`,
  `${d} charger cable adapter`,
  `${d} stand holder dock`,
  `${d} accessories`,
]

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo: number,
  _pageSize: number,
  gender?: Gender,
): Promise<Product[]> {
  const lower = deviceName.toLowerCase()
  const watch = isSmartwatch(deviceName)
  const isDesktop = lower.includes('desktop') || lower.includes('laptop')
  const categoryIds = CATEGORY_IDS.accessories

  const queries = watch
    ? SMARTWATCH_QUERIES(deviceName)
    : isDesktop
      ? LAPTOP_QUERIES(deviceName)
      : DEVICE_ACCESSORY_QUERIES(deviceName)

  // Run all 5 query categories in parallel for maximum yield per page
  const parallelResults = await Promise.all(
    queries.map((q) => fetchAliExpressProducts(q, pageNo, 30, gender ?? 'unisex', categoryIds, 'VOLUME_DOWN')),
  )

  const seenIds = new Set<string>()
  const collected: Product[] = []
  for (const p of parallelResults.flat()) {
    const id = p.aliexpressSku
    if (id && seenIds.has(id)) continue
    if (id) seenIds.add(id)
    collected.push(p)
  }

  // If first page didn't yield enough, try page pageNo+1 across all queries
  if (collected.length < 50 && pageNo < 10) {
    const moreResults = await Promise.all(
      queries.map((q) => fetchAliExpressProducts(q, pageNo + 1, 30, gender ?? 'unisex', categoryIds, 'VOLUME_DOWN')),
    )
    for (const p of moreResults.flat()) {
      const id = p.aliexpressSku
      if (id && seenIds.has(id)) continue
      if (id) seenIds.add(id)
      collected.push(p)
    }
  }

  const filtered = collected.filter((p) => {
    if (APPAREL_REGEX.test(p.name)) return false
    if (FOOTWEAR_REGEX.test(p.name)) return false
    return true
  })
  return sortByBestSellers(dedupById(filtered))
}

// ── Legacy wrappers ────────────────────────────────────────────────────────

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  return fetchAliExpressProducts(keywords, pageNo, pageSize)
}

export async function getProductDetails(productIds: string[]): Promise<unknown> {
  return fetchProductDetails(productIds)
}

export async function generateAffiliateLink(sourceUrl: string): Promise<string | null> {
  return fetchAffiliateLink(sourceUrl)
}
