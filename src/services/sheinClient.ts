import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import { ageGroupToDemographic, getDemographicAnchorQuery, getDemographicFallbackQueries, scoreProductForDemographic } from './demographicQuery'
export { searchVisualMatch as searchExactVisualMatch } from './imageSearch'

const USD_TO_ILS_RATE = 3.7

// SHEIN adapter — fetches real product data from SHEIN's public search API
// via the shein-search edge function. Products without a verified direct PDP
// URL (-p-[NUMERIC_ID].html) are discarded entirely. No fallback search or
// category URLs are ever generated.

const SHEIN_CATEGORIES: Record<FeedCategory, string> = {
  all: 'fashion',
  clothing: 'clothing',
  shoes: 'shoes',
  accessories: 'accessories',
}

interface SheinSearchResult {
  productId: string
  title: string
  brand: string
  price: number
  currency: string
  imageUrl: string
  productUrl: string
  category: string
  sku: string
  sizes: string[]
  rating: number | null
  reviewsCount: number | null
}

// ── PDP validation ──────────────────────────────────────────────────────

function isSheinUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && /(^|\.)shein\.com$/i.test(parsed.hostname)
  } catch { /* ignore */ }
  return false
}

function isSheinDestinationUrl(url: string): boolean {
  if (!url || !isSheinUrl(url)) return false
  // Accept both direct product pages and search result pages.
  // The curated catalog uses /pdsearch/ URLs derived from product titles.
  return /-p-\d+\.html(?:$|[?#])/i.test(url) || /\/pdsearch\//i.test(url)
}

// Only keep real SHEIN destination URLs — either a product page or a
// search results page. Products without a valid URL are discarded.
function ensureSheinDestinationUrl(url: string): string {
  if (!isSheinDestinationUrl(url)) return ''
  return url.split('?')[0]
}

// ── Edge function call ───────────────────────────────────────────────────

async function callSheinSearch(keywords: string, pageNo: number, pageSize: number): Promise<Product[]> {
  try {
    console.log(`[SHEIN] Calling edge function: keywords="${keywords}", page=${pageNo}, size=${pageSize}`)
    const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/shein-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
      },
      body: JSON.stringify({ keywords, page: pageNo, pageSize }),
    })

    if (!response.ok) {
      console.warn(`[SHEIN] Edge function returned HTTP ${response.status}`)
      return []
    }

    const result = await response.json() as { products?: SheinSearchResult[]; error?: string }
    if (result.error) {
      console.warn(`[SHEIN] Edge function error: ${result.error}`)
      return []
    }
    if (!Array.isArray(result.products)) {
      console.warn(`[SHEIN] Edge function returned non-array products`)
      return []
    }

    console.log(`[SHEIN] Edge function returned ${result.products.length} raw products`)

    const mapped = result.products.map((p) => {
      const sku = p.sku || p.productId || ''
      const pdpUrl = ensureSheinDestinationUrl(p.productUrl)
      return {
        name: p.title,
        brand: p.brand || 'SHEIN',
        price: p.currency === 'USD' ? Math.round(p.price * USD_TO_ILS_RATE) : p.price,
        originalPrice: null,
        currency: '₪',
        img: p.imageUrl,
        imageUrl: p.imageUrl,
        category: p.category,
        aliexpressUrl: pdpUrl,
        aliexpressSku: sku,
        availableSizes: p.sizes,
        ordersCount: p.reviewsCount ?? undefined,
        evaluateRate: p.rating ?? undefined,
        platform: 'shein' as const,
        promotionLink: null,
      } as Product
    })

    const filtered = mapped.filter((p) => Boolean(p.aliexpressUrl)) as Product[]
    console.log(`[SHEIN] After PDP filter: ${filtered.length} products (dropped ${mapped.length - filtered.length} without valid PDP URL)`)
    return filtered
  } catch (err) {
    console.error(`[SHEIN] callSheinSearch exception:`, err instanceof Error ? err.message : String(err))
    return []
  }
}

// ── Skimlinks wrapping ───────────────────────────────────────────────────

function withSkimlinks(products: Product[]): Product[] {
  return products.map((p) => {
    const rawUrl = p.aliexpressUrl ?? ''
    if (!rawUrl || !isSheinUrl(rawUrl)) {
      return p
    }
    const wrappedUrl = wrapWithSkimlinks(rawUrl)
    return { ...p, buyUrl: wrappedUrl }
  })
}

// ── Public API ───────────────────────────────────────────────────────────

function buildKeywords(category: FeedCategory, _gender: Gender, ageGroup: AgeGroupFilter = 'adult', gender: Gender = 'unisex'): string {
  const demo = ageGroupToDemographic(ageGroup as any, gender)
  return getDemographicAnchorQuery(demo, category)
}

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  _extraKeywords?: string,
  ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = buildKeywords(category, gender, ageGroup, gender)
  let products = await callSheinSearch(keywords, pageNo, Math.min(pageSize, 40))

  // Fallback relaxation: if <15 results, progressively try broader queries
  const fallbacks = getDemographicFallbackQueries(ageGroupToDemographic(ageGroup as any, gender))
  let fallbackIdx = 0
  while (products.length < 15 && fallbackIdx < fallbacks.length) {
    const fbQuery = fallbacks[fallbackIdx]
    console.log(`[SHEIN] Fallback retry (${products.length} results so far): "${fbQuery}"`)
    const more = await callSheinSearch(fbQuery, pageNo, Math.min(pageSize, 40))
    products = [...products, ...more]
    fallbackIdx++
  }

  if (products.length > 0) {
    const demo = ageGroupToDemographic(ageGroup as any, gender)
    const scored = products.map((p) => ({ p, score: scoreProductForDemographic(p.name, demo) }))
    scored.sort((a, b) => b.score - a.score)
    const sorted = scored.map((s) => s.p)
    const wrapped = withSkimlinks(sorted)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed (demographic: ${demo}).`)
    return wrapped
  }

  console.warn('[SHEIN] All search attempts returned 0 products')
  return []
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  let products = await callSheinSearch(keywords, pageNo, Math.min(pageSize, 40))

  // Retry with just the first word if the full query returned nothing.
  if (products.length === 0) {
    const firstWord = keywords.split(' ')[0]
    if (firstWord && firstWord !== keywords) {
      console.log(`[SHEIN] Retry with first word: "${firstWord}"`)
      products = await callSheinSearch(firstWord, pageNo, Math.min(pageSize, 40))
    }
  }

  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed.`)
    return wrapped
  }

  console.warn('[SHEIN] All search attempts returned 0 products')
  return []
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  _gender?: Gender,
): Promise<Product[]> {
  // Try the full query first, then simplify.
  let products = await callSheinSearch(`${deviceName} accessories`, pageNo, Math.min(pageSize, 40))

  if (products.length === 0) {
    const cleanDevice = deviceName.replace(/^\w+\s+/, '').trim()
    console.log(`[SHEIN] Retry device search with: "${cleanDevice} case"`)
    products = await callSheinSearch(`${cleanDevice} case`, pageNo, Math.min(pageSize, 40))
  }

  if (products.length === 0) {
    console.log(`[SHEIN] Retry device search with: "phone accessories"`)
    products = await callSheinSearch('phone accessories', pageNo, Math.min(pageSize, 40))
  }

  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed.`)
    return wrapped
  }

  console.warn('[SHEIN] All device accessory search attempts returned 0 products')
  return []
}

export const sheinAdapter: AffiliateAdapter = {
  platform: 'shein',
  isConfigured: true,

  async searchByCategory(params: AdapterSearchParams): Promise<Product[]> {
    return searchProductsByCategory(
      params.category,
      params.gender,
      params.pageNo,
      params.pageSize,
      params.extraKeywords,
      params.ageGroup,
    )
  },

  async searchByQuery(params: AdapterQueryParams): Promise<Product[]> {
    return searchProducts(params.keywords, params.pageNo, params.pageSize)
  },

  async searchDeviceAccessories(params: AdapterDeviceParams): Promise<Product[]> {
    return searchDeviceAccessories(params.deviceName, params.pageNo, params.pageSize, params.gender)
  },
}
