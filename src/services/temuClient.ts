import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import { ageGroupToDemographic, getDemographicAnchorQuery, getDemographicFallbackQueries, scoreProductForDemographic } from './demographicQuery'
export { searchVisualMatch as searchExactVisualMatch } from './imageSearch'

const TEMU_CATEGORIES: Record<FeedCategory, string> = {
  all: 'fashion',
  clothing: 'clothing',
  shoes: 'shoes',
  accessories: 'accessories',
}

interface TemuSearchResult {
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

function isTemuUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && /(^|\.)temu\.com$/i.test(parsed.hostname)
  } catch { /* ignore */ }
  return false
}

function isTemuDestinationUrl(url: string): boolean {
  if (!url || !isTemuUrl(url)) return false
  // Accept both product pages and search result pages
  return /\/goods\/|\/p\//i.test(url) || /search_result\.html/i.test(url)
}

function ensureTemuDestinationUrl(url: string): string {
  if (!isTemuDestinationUrl(url)) return ''
  return url.split('?')[0] || url
}

async function callTemuSearch(keywords: string, pageNo: number, pageSize: number): Promise<Product[]> {
  try {
    console.log(`[TEMU] Calling edge function: keywords="${keywords}", page=${pageNo}, size=${pageSize}`)
    const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/temu-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
      },
      body: JSON.stringify({ keywords, page: pageNo, pageSize }),
    })

    if (!response.ok) {
      console.warn(`[TEMU] Edge function returned HTTP ${response.status}`)
      return []
    }

    const result = await response.json() as { products?: TemuSearchResult[]; error?: string }
    if (result.error) {
      console.warn(`[TEMU] Edge function error: ${result.error}`)
      return []
    }
    if (!Array.isArray(result.products)) {
      console.warn(`[TEMU] Edge function returned non-array products`)
      return []
    }

    console.log(`[TEMU] Edge function returned ${result.products.length} raw products`)

    const mapped = result.products.map((p) => {
      const sku = p.sku || p.productId || ''
      const destUrl = ensureTemuDestinationUrl(p.productUrl)
      return {
        name: p.title,
        brand: p.brand || 'Temu',
        price: p.price,
        originalPrice: null,
        currency: p.currency || 'USD',
        img: p.imageUrl,
        imageUrl: p.imageUrl,
        category: p.category,
        aliexpressUrl: destUrl,
        aliexpressSku: sku,
        availableSizes: p.sizes,
        ordersCount: p.reviewsCount ?? undefined,
        evaluateRate: p.rating ?? undefined,
        platform: 'temu' as const,
        promotionLink: null,
      } as Product
    })

    const filtered = mapped.filter((p) => Boolean(p.aliexpressUrl)) as Product[]
    console.log(`[TEMU] After URL filter: ${filtered.length} products (dropped ${mapped.length - filtered.length} without valid URL)`)
    return filtered
  } catch (err) {
    console.error(`[TEMU] callTemuSearch exception:`, err instanceof Error ? err.message : String(err))
    return []
  }
}

function withSkimlinks(products: Product[]): Product[] {
  return products.map((p) => {
    const rawUrl = p.aliexpressUrl ?? ''
    if (!rawUrl || !isTemuUrl(rawUrl)) {
      return p
    }
    const wrappedUrl = wrapWithSkimlinks(rawUrl)
    return { ...p, buyUrl: wrappedUrl }
  })
}

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
  let products = await callTemuSearch(keywords, pageNo, Math.min(pageSize, 40))

  const fallbacks = getDemographicFallbackQueries(ageGroupToDemographic(ageGroup as any, gender))
  let fallbackIdx = 0
  while (products.length < 15 && fallbackIdx < fallbacks.length) {
    const fbQuery = fallbacks[fallbackIdx]
    console.log(`[TEMU] Fallback retry (${products.length} results so far): "${fbQuery}"`)
    const more = await callTemuSearch(fbQuery, pageNo, Math.min(pageSize, 40))
    products = [...products, ...more]
    fallbackIdx++
  }

  if (products.length > 0) {
    const demo = ageGroupToDemographic(ageGroup as any, gender)
    const scored = products.map((p) => ({ p, score: scoreProductForDemographic(p.name, demo) }))
    scored.sort((a, b) => b.score - a.score)
    const sorted = scored.map((s) => s.p)
    const wrapped = withSkimlinks(sorted)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} Temu products to main feed (demographic: ${demo}).`)
    return wrapped
  }

  console.warn('[TEMU] All search attempts returned 0 products')
  return []
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  let products = await callTemuSearch(keywords, pageNo, Math.min(pageSize, 40))

  if (products.length === 0) {
    const firstWord = keywords.split(' ')[0]
    if (firstWord && firstWord !== keywords) {
      console.log(`[TEMU] Retry with first word: "${firstWord}"`)
      products = await callTemuSearch(firstWord, pageNo, Math.min(pageSize, 40))
    }
  }

  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} Temu products to main feed.`)
    return wrapped
  }

  console.warn('[TEMU] All search attempts returned 0 products')
  return []
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  _gender?: Gender,
): Promise<Product[]> {
  let products = await callTemuSearch(`${deviceName} accessories`, pageNo, Math.min(pageSize, 40))

  if (products.length === 0) {
    const cleanDevice = deviceName.replace(/^\w+\s+/, '').trim()
    console.log(`[TEMU] Retry device search with: "${cleanDevice} case"`)
    products = await callTemuSearch(`${cleanDevice} case`, pageNo, Math.min(pageSize, 40))
  }

  if (products.length === 0) {
    console.log(`[TEMU] Retry device search with: "phone accessories"`)
    products = await callTemuSearch('phone accessories', pageNo, Math.min(pageSize, 40))
  }

  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} Temu products to main feed.`)
    return wrapped
  }

  console.warn('[TEMU] All device accessory search attempts returned 0 products')
  return []
}

export function temuSearchUrl(productName: string): string {
  const keyword = productName.replace(/^Temu\s+/i, '').trim()
  return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(keyword)}`
}

export const temuAdapter: AffiliateAdapter = {
  platform: 'temu',
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
