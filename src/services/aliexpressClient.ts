import { fetchAliExpressProducts, fetchProductDetails, generateAffiliateLink as fetchAffiliateLink } from '../lib/aliexpress'
import type { Product } from '../types'

export type Gender = 'male' | 'female' | 'unisex'
export type FeedCategory = 'all' | 'clothing' | 'shoes' | 'accessories'

// ── Gender keyword injection ──────────────────────────────────────────────

const GENDER_POSITIVE: Record<string, string[]> = {
  female: ['women', 'womens', 'female', 'ladies', 'lady'],
  male: ['men', 'mens', 'male'],
  unisex: [],
}

const GENDER_REJECT: Record<string, RegExp> = {
  female: /\b(men|mens|male|boy|man)\b/i,
  male: /\b(women|womens|female|girl|lady|ladies)\b/i,
  unisex: /$^/,
}

// Products mentioning both genders are unisex-only — exclude from gender-specific results
const BOTH_GENDERS_REGEX = /\b(men|mens|male|boy|man).*(women|womens|female|girl|lady|ladies)\b|\b(women|womens|female|girl|lady|ladies).*(men|mens|male|boy|man)\b/i

// ── Top-searched AliExpress query arrays by category & gender ──────────────

export const TOP_ALIEXPRESS_QUERIES = {
  female: {
    clothing: [
      'women dress',
      'women tops blouses',
      'women pants jeans',
      'women skirts',
      'women sweaters hoodies',
      'women coats jackets',
      'women suits sets',
      'women lingerie underwear',
      'women activewear leggings',
    ],
    shoes: [
      'women sneakers',
      'women boots',
      'women sandals',
      'women heels pumps',
      'women casual shoes',
      'women loafers flats',
      'women running shoes',
    ],
  },
  male: {
    clothing: [
      'men t shirts',
      'men pants jeans',
      'men hoodies sweatshirts',
      'men jackets coats',
      'men shirts',
      'men shorts',
      'men suits blazers',
      'men sportswear tracksuit',
    ],
    shoes: [
      'men sneakers',
      'men casual shoes',
      'men running shoes',
      'men boots',
      'men sandals slippers',
      'men dress shoes loafers',
    ],
  },
} as const

// Unisex fallback: merge female + male pools
const CLOTHING_SUBQUERIES_UNISEX = [
  ...TOP_ALIEXPRESS_QUERIES.female.clothing,
  ...TOP_ALIEXPRESS_QUERIES.male.clothing,
]

const SHOES_SUBQUERIES_UNISEX = [
  ...TOP_ALIEXPRESS_QUERIES.female.shoes,
  ...TOP_ALIEXPRESS_QUERIES.male.shoes,
]

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

// ── Category IDs ────────────────────────────────────────────────────────────

const CATEGORY_IDS: Record<FeedCategory, string | undefined> = {
  all: '200000783,200000782,200000835,200000832,200000831',
  clothing: '200000783,200000782',
  shoes: '200000835,200000832,200000831',
  accessories: '5090301,509',
}

// ── Parallel fetch + aggregation helpers ────────────────────────────────────

function pickSubqueries(pool: readonly string[], count: number, pageNo: number): string[] {
  const startIdx = (pageNo - 1) * count % pool.length
  const selected: string[] = []
  for (let i = 0; i < count; i++) {
    selected.push(pool[(startIdx + i) % pool.length])
  }
  return selected
}

function dedupById(products: Product[]): Product[] {
  const seen = new Set<string>()
  return products.filter((p) => {
    if (p.aliexpressSku && seen.has(p.aliexpressSku)) return false
    if (p.aliexpressSku) seen.add(p.aliexpressSku)
    return true
  })
}

async function parallelFetch(
  subqueries: string[],
  gender: Gender,
  categoryIds: string | undefined,
  pageNo: number,
  pageSize: number,
  extraKeywords?: string,
): Promise<Product[]> {
  const perQuerySize = Math.max(12, Math.ceil(pageSize / subqueries.length))
  const results = await Promise.all(
    subqueries.map((sq) => {
      let kw = sq
      if (extraKeywords) kw += ` ${extraKeywords}`
      return fetchAliExpressProducts(kw, pageNo, perQuerySize, gender, categoryIds, 'VOLUME_DOWN')
    }),
  )
  return results.flat()
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Search for products by category with strict gender isolation and
 * clothing/footwear separation. Runs 3-4 parallel queries per page
 * and aggregates 100-300 items per batch.
 */
export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  extraKeywords?: string,
): Promise<Product[]> {
  const positiveTerms = GENDER_POSITIVE[gender] ?? []
  const genderPrefix = positiveTerms.length > 0 ? positiveTerms[0] + ' ' : ''
  const categoryIds = CATEGORY_IDS[category]

  if (category === 'clothing' || category === 'all') {
    const pool = gender === 'female'
      ? TOP_ALIEXPRESS_QUERIES.female.clothing
      : gender === 'male'
        ? TOP_ALIEXPRESS_QUERIES.male.clothing
        : CLOTHING_SUBQUERIES_UNISEX

    if (category === 'clothing') {
      const subqueries = pickSubqueries(pool, 4, pageNo)
      const raw = await parallelFetch(subqueries, gender, categoryIds, pageNo, pageSize, extraKeywords)
      const deduped = dedupById(raw)
      const filtered = filterProducts(deduped, category, gender)
      return sortByBestSellers(filtered)
    }

    // "all" tab: run 4 clothing + 3 shoe queries in parallel for maximum variety
    const shoePool = gender === 'female'
      ? TOP_ALIEXPRESS_QUERIES.female.shoes
      : gender === 'male'
        ? TOP_ALIEXPRESS_QUERIES.male.shoes
        : SHOES_SUBQUERIES_UNISEX

    const clothingSubs = pickSubqueries(pool, 4, pageNo)
    const shoeSubs = pickSubqueries(shoePool, 3, pageNo)
    const allSubs = [...clothingSubs, ...shoeSubs]
    const raw = await parallelFetch(allSubs, gender, categoryIds, pageNo, pageSize, extraKeywords)
    const deduped = dedupById(raw)
    const filtered = filterProducts(deduped, 'all', gender)
    return sortByBestSellers(filtered)
  }

  if (category === 'shoes') {
    const pool = gender === 'female'
      ? TOP_ALIEXPRESS_QUERIES.female.shoes
      : gender === 'male'
        ? TOP_ALIEXPRESS_QUERIES.male.shoes
        : SHOES_SUBQUERIES_UNISEX

    const subqueries = pickSubqueries(pool, 4, pageNo)
    const raw = await parallelFetch(subqueries, gender, categoryIds, pageNo, pageSize, extraKeywords)
    const deduped = dedupById(raw)
    const filtered = filterProducts(deduped, category, gender)
    return sortByBestSellers(filtered)
  }

  // accessories — caller provides device-specific keywords
  const keywords = extraKeywords ?? `${genderPrefix}phone case cover`
  console.log('[aliexpressClient] searchProductsByCategory:', { category, gender, pageNo, keywords, categoryIds })

  const products = await fetchAliExpressProducts(keywords, pageNo, pageSize, gender, categoryIds, 'VOLUME_DOWN')
  const filtered = filterProducts(products, category, gender)
  return sortByBestSellers(filtered)
}

// ── Smartwatch / Wearable detection ──────────────────────────────────────────

const SMARTWATCH_KEYWORDS = ['watch', 'galaxy watch', 'apple watch', 'pixel watch', 'garmin', 'fitbit']

export function isSmartwatch(deviceName: string): boolean {
  const lower = deviceName.toLowerCase()
  return SMARTWATCH_KEYWORDS.some((kw) => lower.includes(kw))
}

// Core accessory query categories for any device
const DEVICE_ACCESSORY_QUERIES = (d: string) => [
  `${d} case cover`,
  `${d} strap band`,
  `${d} screen protector`,
  `${d} charger`,
  `${d} cable adapter`,
  `${d} holder stand`,
]

// Watch-specific accessory queries (broader than generic)
const SMARTWATCH_QUERIES = (d: string) => [
  `${d} strap band`,
  `${d} silicone band metal strap`,
  `${d} screen protector case cover`,
  `${d} charger charging dock`,
  `${d} bezel frame`,
]

// Watch accessory terms — explicitly permitted in accessories tab
const WATCH_ACCESSORY_TERMS = ['strap', 'band', 'wristband', 'bracelet', 'screen protector', 'charging dock', 'bezel']
const WATCH_ACCESSORY_REGEX = new RegExp(`\\b(${WATCH_ACCESSORY_TERMS.join('|').replace(' ', '\\s+')})\\b`, 'i')

/**
 * Search for tech accessories matching a specific device model.
 * Runs parallel queries across all core accessory categories.
 */
export async function searchDeviceAccessories(
  deviceName: string,
  pageNo: number,
  pageSize: number,
  gender?: Gender,
): Promise<Product[]> {
  const lower = deviceName.toLowerCase()
  const watch = isSmartwatch(deviceName)
  const isDesktop = lower.includes('desktop') || lower.includes('laptop')
  const categoryIds = CATEGORY_IDS.accessories

  const queryFns = watch
    ? SMARTWATCH_QUERIES(deviceName)
    : isDesktop
      ? [
          `${deviceName} laptop case cover sleeve`,
          `${deviceName} charger adapter`,
          `${deviceName} stand holder dock`,
          `${deviceName} cable hub adapter`,
        ]
      : DEVICE_ACCESSORY_QUERIES(deviceName)

  const perQuerySize = Math.max(10, Math.ceil(pageSize / queryFns.length))
  const results = await Promise.all(
    queryFns.map((keywords) => {
      console.log('[aliexpressClient] device accessory query:', { deviceName, keywords })
      return fetchAliExpressProducts(keywords, pageNo, perQuerySize, gender, categoryIds, 'VOLUME_DOWN')
    }),
  )
  const allProducts = results.flat()

  console.log('[aliexpressClient] searchDeviceAccessories:', { deviceName, watch, isDesktop, totalFetched: allProducts.length })

  const filtered = allProducts.filter((p) => {
    if (APPAREL_REGEX.test(p.name)) return false
    if (FOOTWEAR_REGEX.test(p.name)) return false
    return true
  })
  return sortByBestSellers(dedupById(filtered))
}

// ── Sort: weighted best-sellers + high ratings ─────────────────────────────

function sortByBestSellers(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const salesA = a.ordersCount ?? a.volume ?? 0
    const salesB = b.ordersCount ?? b.volume ?? 0
    const ratingA = a.evaluateRate ?? 0
    const ratingB = b.evaluateRate ?? 0
    const scoreA = salesA * 0.6 + ratingA * 0.4
    const scoreB = salesB * 0.6 + ratingB * 0.4
    return scoreB - scoreA
  })
}

/**
 * Client-side double-validation filter.
 * Discards products that violate gender isolation or category separation.
 */
export function filterProducts(
  products: Product[],
  category: FeedCategory,
  gender: Gender,
): Product[] {
  const rejectRegex = GENDER_REJECT[gender] ?? /$^/

  return products.filter((p) => {
    // 1. Gender Validation — discard opposite-gender items
    if (rejectRegex.test(p.name)) return false
    // 1b. Products mentioning both genders are unisex-only
    if (gender !== 'unisex' && BOTH_GENDERS_REGEX.test(p.name)) return false

    // 2. Category Validation
    if (category === 'clothing') {
      // Hard-exclude all footwear terms
      if (FOOTWEAR_REGEX.test(p.name)) return false
    }

    if (category === 'shoes') {
      // Exclude obvious apparel, but don't require footwear terms in the title
      // since AliExpress may return Hebrew product titles without English shoe keywords
      if (APPAREL_REGEX.test(p.name) && !FOOTWEAR_REGEX.test(p.name)) return false
    }

    if (category === 'accessories') {
      // Accessories tab: exclude both apparel and footwear
      if (APPAREL_REGEX.test(p.name)) return false
      if (FOOTWEAR_REGEX.test(p.name)) return false
    }

    return true
  })
}

// ── Legacy wrappers (kept for backward compatibility) ──────────────────────

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  return fetchAliExpressProducts(keywords, pageNo, pageSize)
}

export async function getProductDetails(productIds: string[]): Promise<unknown> {
  return fetchProductDetails(productIds)
}

export async function generateAffiliateLink(sourceUrl: string): Promise<string | null> {
  return fetchAffiliateLink(sourceUrl)
}
