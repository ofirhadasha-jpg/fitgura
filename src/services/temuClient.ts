import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams, TemuCredentials } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
export { searchVisualMatch as searchExactVisualMatch } from './imageSearch'

// Temu adapter — calls Temu affiliate API via edge function.
// No mock data: if credentials aren't configured, returns empty so the aggregator
// can auto-generate Temu search links as secondary offers on real products.

export const TEMU_CREDENTIALS: TemuCredentials = {
  affiliateKey: '',
  trackingId: '',
}

export function setTemuCredentials(creds: Partial<TemuCredentials>): void {
  Object.assign(TEMU_CREDENTIALS, creds)
}

const TEMU_CATEGORIES: Record<FeedCategory, string> = {
  all: 'fashion',
  clothing: 'clothing',
  shoes: 'shoes',
  accessories: 'accessories',
}

async function callTemuApi(keywords: string, pageNo: number, pageSize: number): Promise<Product[]> {
  if (!TEMU_CREDENTIALS.affiliateKey) return []

  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/temu-affiliate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: 'search',
        keywords,
        pageNo,
        pageSize,
        affiliateKey: TEMU_CREDENTIALS.affiliateKey,
        trackingId: TEMU_CREDENTIALS.trackingId,
      }),
    })

    if (!response.ok) return []

    const result = await response.json() as { products?: Record<string, unknown>[]; error?: string }
    if (result.error) return []

    const raw = result.products ?? []
    return raw.map((p) => ({
      name: String(p.title ?? p.name ?? ''),
      brand: String(p.brand ?? 'Temu'),
      price: Number(p.price ?? 0),
      originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
      currency: String(p.currency ?? 'ILS'),
      img: String(p.image ?? p.img ?? ''),
      imageUrl: String(p.image ?? p.img ?? ''),
      category: String(p.category ?? ''),
      aliexpressUrl: String(p.url ?? p.productUrl ?? ''),
      aliexpressSku: String(p.sku ?? p.productId ?? ''),
      availableSizes: (p.sizes as string[]) ?? [],
      ordersCount: Number(p.sales ?? 0) || undefined,
      evaluateRate: Number(p.rating ?? 0) || undefined,
      platform: 'temu' as const,
      promotionLink: (p.promotionLink ?? null) as string | null,
    })) as Product[]
  } catch {
    return []
  }
}

// Build a valid live Temu search URL for any product name.
export function temuSearchUrl(productName: string): string {
  const keyword = productName.replace(/^Temu\s+/i, '').trim()
  return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(keyword)}`
}

function buildKeywords(category: FeedCategory, gender: Gender, extraKeywords?: string): string {
  const categoryWord = TEMU_CATEGORIES[category] ?? 'fashion'
  const genderWord = gender === 'male' ? 'men' : gender === 'female' ? 'women' : ''
  return [genderWord, categoryWord, extraKeywords].filter(Boolean).join(' ')
}

function withSkimlinks(products: Product[]): Product[] {
  return products.map((p) => ({
    ...p,
    buyUrl: wrapWithSkimlinks(p.aliexpressUrl ?? ''),
  }))
}

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = buildKeywords(category, gender, extraKeywords)
  try {
    const products = await callTemuApi(keywords, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // No credentials — return empty
  }
  return []
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  try {
    const products = await callTemuApi(keywords, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // No credentials — return empty
  }
  return []
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  _gender?: Gender,
): Promise<Product[]> {
  try {
    const products = await callTemuApi(`${deviceName} accessories`, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // No credentials — return empty
  }
  return []
}

export const temuAdapter: AffiliateAdapter = {
  platform: 'temu',
  isConfigured: !!TEMU_CREDENTIALS.affiliateKey,

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
