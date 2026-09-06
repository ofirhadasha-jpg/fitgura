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

// ── Category query templates (gender-specific) ─────────────────────────────

const CLOTHING_SUBQUERIES_FEMALE = [
  'dresses',
  'skirts',
  'women top blouse',
  'women shirt',
  'women pants',
  'women jeans',
  'women pajama sleepwear',
  'women outfit set',
  'women sweater',
  'women hoodie',
  'women coat jacket',
  'women suit blazer',
  'women leggings',
  'women lingerie bra set',
  'women t-shirt',
  'women shorts',
]

const CLOTHING_SUBQUERIES_MALE = [
  'men shirt',
  'men t-shirt',
  'men pants',
  'men jeans',
  'men suit blazer',
  'men hoodie',
  'men jacket coat',
  'men sweater',
  'men polo',
  'men tracksuit set',
  'men shorts',
  'men underwear',
  'men pajama sleepwear',
  'men outfit set',
  'men jogger pants',
  'men vest',
]

const CLOTHING_SUBQUERIES_UNISEX = [
  'suit sets',
  'two piece sets',
  'blazer set',
  'dresses',
  'casual skirts',
  'evening dresses',
  'tops blouses',
  't-shirts',
  'coats jackets',
  'pants trousers',
  'jeans',
  'hoodies',
  'sweaters',
  'pajama sleepwear',
  'outfit set',
  'shorts',
]

const SHOES_SUBQUERIES_FEMALE = [
  'women sneakers',
  'women running shoes',
  'women high heels',
  'women ankle boots',
  'women sandals',
  'women flat shoes',
  'women boots',
  'women loafers',
  'women slippers',
  'women wedges',
]

const SHOES_SUBQUERIES_MALE = [
  'men sneakers',
  'men running shoes',
  'men boots',
  'men ankle boots',
  'men sandals',
  'men loafers',
  'men slippers',
  'men casual shoes',
  'men leather shoes',
  'men slip-on',
]

const SHOES_SUBQUERIES_UNISEX = [
  'sneakers',
  'running shoes',
  'high heels',
  'ankle boots',
  'sandals',
  'flat shoes',
  'boots',
  'loafers',
  'slippers',
  'wedges',
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

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Search for products by category with strict gender isolation and
 * clothing/footwear separation. Returns deduplicated, filtered products.
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

  let keywords: string

  // Select subquery pool based on gender
  const clothingSubqueries = gender === 'female'
    ? CLOTHING_SUBQUERIES_FEMALE
    : gender === 'male'
      ? CLOTHING_SUBQUERIES_MALE
      : CLOTHING_SUBQUERIES_UNISEX
  const shoesSubqueries = gender === 'female'
    ? SHOES_SUBQUERIES_FEMALE
    : gender === 'male'
      ? SHOES_SUBQUERIES_MALE
      : SHOES_SUBQUERIES_UNISEX

  if (category === 'clothing') {
    // Search multiple clothing subqueries in parallel for diverse results on every page
    const startIdx = (pageNo - 1) * 4 % clothingSubqueries.length
    const subqueries: string[] = []
    for (let i = 0; i < 4; i++) {
      subqueries.push(clothingSubqueries[(startIdx + i) % clothingSubqueries.length])
    }
    // Run all 4 subqueries in parallel and merge results
    const perQuerySize = Math.max(12, Math.ceil(pageSize / subqueries.length))
    const results = await Promise.all(
      subqueries.map((sq) => {
        const prefix = sq.startsWith('women') || sq.startsWith('men') ? '' : genderPrefix
        let kw = `${prefix}${sq}`
        if (extraKeywords) kw += ` ${extraKeywords}`
        return fetchAliExpressProducts(kw, pageNo, perQuerySize, gender, categoryIds, 'VOLUME_DOWN')
      }),
    )
    const merged = results.flat()
    const seen = new Set<string>()
    const deduped = merged.filter((p) => {
      if (p.aliexpressSku && seen.has(p.aliexpressSku)) return false
      if (p.aliexpressSku) seen.add(p.aliexpressSku)
      return true
    })
    const filtered = filterProducts(deduped, category, gender)
    return sortByBestSellers(filtered)
  } else if (category === 'shoes') {
    const startIdx = (pageNo - 1) * 3 % shoesSubqueries.length
    const subqueries: string[] = []
    for (let i = 0; i < 3; i++) {
      subqueries.push(shoesSubqueries[(startIdx + i) % shoesSubqueries.length])
    }
    const perQuerySize = Math.max(15, Math.ceil(pageSize / subqueries.length))
    const results = await Promise.all(
      subqueries.map((sq) => {
        const prefix = sq.startsWith('women') || sq.startsWith('men') ? '' : genderPrefix
        let kw = `${prefix}${sq}`
        if (extraKeywords) kw += ` ${extraKeywords}`
        return fetchAliExpressProducts(kw, pageNo, perQuerySize, gender, categoryIds, 'VOLUME_DOWN')
      }),
    )
    const merged = results.flat()
    const seen = new Set<string>()
    const deduped = merged.filter((p) => {
      if (p.aliexpressSku && seen.has(p.aliexpressSku)) return false
      if (p.aliexpressSku) seen.add(p.aliexpressSku)
      return true
    })
    const filtered = filterProducts(deduped, category, gender)
    return sortByBestSellers(filtered)
  } else if (category === 'all') {
    keywords = `${genderPrefix}fashion clothing`
    if (extraKeywords) keywords += ` ${extraKeywords}`
  } else {
    // accessories — caller provides device-specific keywords
    keywords = extraKeywords ?? `${genderPrefix}phone case cover`
  }

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

// Dedicated smartwatch accessory query variations for rich, high-converting results
const SMARTWATCH_QUERIES = [
  (d: string) => `${d} strap`,
  (d: string) => `${d} band wristband`,
  (d: string) => `${d} silicone band metal strap`,
  (d: string) => `${d} screen protector case cover`,
  (d: string) => `${d} charger charging dock`,
]

// Watch accessory terms — explicitly permitted in accessories tab
const WATCH_ACCESSORY_TERMS = ['strap', 'band', 'wristband', 'bracelet', 'screen protector', 'charging dock', 'bezel']
const WATCH_ACCESSORY_REGEX = new RegExp(`\\b(${WATCH_ACCESSORY_TERMS.join('|').replace(' ', '\\s+')})\\b`, 'i')

/**
 * Search for tech accessories matching a specific device model.
 * Uses dedicated smartwatch queries for wearable devices.
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

  let allProducts: Product[] = []

  if (watch) {
    // Run all 5 smartwatch query variations and merge results
    const perQuerySize = Math.max(10, Math.ceil(pageSize / SMARTWATCH_QUERIES.length))
    const results = await Promise.all(
      SMARTWATCH_QUERIES.map((q) => {
        const keywords = q(deviceName)
        console.log('[aliexpressClient] smartwatch query:', { deviceName, keywords })
        return fetchAliExpressProducts(keywords, pageNo, perQuerySize, gender, categoryIds)
      }),
    )
    allProducts = results.flat()
  } else if (isDesktop) {
    const keywords = `${deviceName} laptop case cover sleeve charger stand cable adapter dock`
    allProducts = await fetchAliExpressProducts(keywords, pageNo, pageSize, gender, categoryIds, 'VOLUME_DOWN')
  } else {
    const keywords = `${deviceName} case cover screen protector charger cable holder stand`
    allProducts = await fetchAliExpressProducts(keywords, pageNo, pageSize, gender, categoryIds, 'VOLUME_DOWN')
  }

  console.log('[aliexpressClient] searchDeviceAccessories:', { deviceName, watch, isDesktop, totalFetched: allProducts.length })

  const filtered = allProducts.filter((p) => {
    if (APPAREL_REGEX.test(p.name)) return false
    if (FOOTWEAR_REGEX.test(p.name)) return false
    return true
  })
  return sortByBestSellers(filtered)
}

// Sort products by best sellers (volume/orders) then by highest rating
function sortByBestSellers(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const salesA = a.ordersCount ?? a.volume ?? 0
    const salesB = b.ordersCount ?? b.volume ?? 0
    const ratingA = a.evaluateRate ?? 0
    const ratingB = b.evaluateRate ?? 0
    return (salesB - salesA) || (ratingB - ratingA)
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
