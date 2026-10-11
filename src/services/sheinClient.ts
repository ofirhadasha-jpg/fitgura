import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
export { searchVisualMatch as searchExactVisualMatch } from './imageSearch'

// SHEIN adapter — fetches real product data from SHEIN's public search API
// via the shein-search edge function. Products without a verified direct PDP
// URL (-p-[NUMERIC_ID].html) are discarded entirely. No fallback search or
// category URLs are ever generated.

const SHEIN_CATEGORIES: Record<FeedCategory, string> = {
  all: 'fashion clothing',
  clothing: 'clothing dress shirt pants',
  shoes: 'shoes sneakers boots sandals',
  accessories: 'accessories bag jewelry sunglasses',
}

const STYLE_TAGS = [
  'trending', 'new arrivals', 'casual', 'elegant', 'streetwear',
  'minimalist', 'vintage', 'boho', 'y2k', 'preppy', 'oversized',
  'slim fit', 'relaxed', 'classic', 'modern', 'chic',
]

function pickRotationTags(seed: number, count: number): string[] {
  const shuffled = [...STYLE_TAGS].sort(() => {
    const h = (seed + Math.random() * 1000) | 0
    return ((h % 3) - 1)
  })
  return shuffled.slice(0, count)
}

let currentSessionSeed = Date.now() % 100000

export function setRotationSeed(seed: number): void {
  currentSessionSeed = seed
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

function isSheinPdpUrl(url: string): boolean {
  if (!url || !isSheinUrl(url)) return false
  return /-p-\d+\.html(?:$|[?#])/i.test(url)
}

// Only keep real SHEIN product pages. Products without a verified PDP URL
// containing -p-[NUMERIC_ID].html are discarded entirely.
function ensureSheinDestinationUrl(url: string): string {
  if (!isSheinPdpUrl(url)) return ''
  return url.split('?')[0]
}

// ── Edge function call ───────────────────────────────────────────────────

async function callSheinSearch(keywords: string, pageNo: number, pageSize: number): Promise<Product[]> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/shein-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
      },
      body: JSON.stringify({ keywords, page: pageNo, pageSize }),
    })

    if (!response.ok) return []

    const result = await response.json() as { products?: SheinSearchResult[]; error?: string }
    if (result.error || !Array.isArray(result.products)) return []

    return result.products.map((p) => {
      const sku = p.sku || p.productId || ''
      const pdpUrl = ensureSheinDestinationUrl(p.productUrl)
      return {
        name: p.title,
        brand: p.brand || 'SHEIN',
        price: p.price,
        originalPrice: null,
        currency: p.currency || 'USD',
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
    }).filter((p) => Boolean(p.aliexpressUrl)) as Product[]
  } catch {
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

function buildKeywords(category: FeedCategory, gender: Gender): string {
  const categoryWord = SHEIN_CATEGORIES[category] ?? 'Fashion'
  const genderWord = gender === 'male' ? 'men' : gender === 'female' ? 'women' : ''
  const rotationTags = pickRotationTags(currentSessionSeed, 2)
  return [genderWord, categoryWord, ...rotationTags].filter(Boolean).join(' ')
}

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = buildKeywords(category, gender)
  const products = await callSheinSearch(keywords, pageNo, Math.min(pageSize, 40))
  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed.`)
    return wrapped
  }

  console.warn('[SHEIN] No verified product-detail URLs returned; skipping non-product fallback links')
  console.log('[Feed Engine] Successfully loaded 0 SHEIN products to main feed.')
  return []
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  const products = await callSheinSearch(keywords, pageNo, Math.min(pageSize, 40))
  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed.`)
    return wrapped
  }

  console.warn('[SHEIN] No verified product-detail URLs returned; skipping non-product fallback links')
  console.log('[Feed Engine] Successfully loaded 0 SHEIN products to main feed.')
  return []
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  _gender?: Gender,
): Promise<Product[]> {
  const products = await callSheinSearch(`${deviceName} accessories`, pageNo, Math.min(pageSize, 40))
  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed.`)
    return wrapped
  }

  console.warn('[SHEIN] No verified product-detail URLs returned; skipping non-product fallback links')
  console.log('[Feed Engine] Successfully loaded 0 SHEIN products to main feed.')
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
