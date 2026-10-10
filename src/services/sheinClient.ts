import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams, CJCredentials } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
export { searchVisualMatch as searchExactVisualMatch } from './imageSearch'

// SHEIN adapter — routes through CJ Affiliate's GraphQL API (SHEIN is a CJ advertiser).
// No mock data: if credentials aren't configured, returns empty so the aggregator
// can auto-generate SHEIN search links as secondary offers on real products.

export const CJ_CREDENTIALS: CJCredentials = {
  accessToken: '',
  websiteId: '',
  advertiserId: '',
}

export function setCJCredentials(creds: Partial<CJCredentials>): void {
  Object.assign(CJ_CREDENTIALS, creds)
}

const SHEIN_CATEGORIES: Record<FeedCategory, string> = {
  all: 'Fashion',
  clothing: 'Apparel & Clothing',
  shoes: 'Shoes & Footwear',
  accessories: 'Accessories & Jewelry',
}

const CJ_GRAPHQL_QUERY = `
  query SearchProducts($keywords: String!, $advertiserId: String!, $page: Int, $pageSize: Int) {
    products(
      keywords: $keywords
      advertiserId: $advertiserId
      page: $page
      pageSize: $pageSize
    ) {
      productId
      title
      brand
      price
      currency
      imageUrl
      productUrl
      category
      sku
      sizes
      rating
      reviewsCount
    }
  }
`

async function callCjGraphQL(keywords: string, pageNo: number, pageSize: number): Promise<Product[]> {
  if (!CJ_CREDENTIALS.accessToken || !CJ_CREDENTIALS.advertiserId) return []

  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/cj-affiliate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: 'graphql-search',
        query: CJ_GRAPHQL_QUERY,
        variables: {
          keywords,
          advertiserId: CJ_CREDENTIALS.advertiserId,
          page: pageNo,
          pageSize,
        },
        accessToken: CJ_CREDENTIALS.accessToken,
      }),
    })

    if (!response.ok) return []

    const result = await response.json() as { products?: Record<string, unknown>[]; error?: string }
    if (result.error) return []

    const raw = result.products ?? []
    return raw.map((p) => ({
      name: String(p.title ?? p.name ?? ''),
      brand: String(p.brand ?? 'SHEIN'),
      price: Number(p.price ?? 0),
      originalPrice: null,
      currency: String(p.currency ?? 'USD'),
      img: String(p.imageUrl ?? p.img ?? ''),
      imageUrl: String(p.imageUrl ?? p.img ?? ''),
      category: String(p.category ?? ''),
      aliexpressUrl: String(p.productUrl ?? p.link ?? ''),
      aliexpressSku: String(p.sku ?? p.productId ?? ''),
      availableSizes: (p.sizes as string[]) ?? [],
      ordersCount: Number(p.reviewsCount ?? 0) || undefined,
      evaluateRate: Number(p.rating ?? 0) || undefined,
      platform: 'shein' as const,
      promotionLink: null,
    })) as Product[]
  } catch {
    return []
  }
}

// Build a valid live SHEIN search URL for any product name.
export function sheinSearchUrl(productName: string): string {
  const keyword = productName.replace(/^SHEIN\s+/i, '').trim()
  return `https://www.shein.com/pdsearch/${encodeURIComponent(keyword)}/`
}

function buildKeywords(category: FeedCategory, gender: Gender): string {
  const categoryWord = SHEIN_CATEGORIES[category] ?? 'Fashion'
  const genderWord = gender === 'male' ? 'men' : gender === 'female' ? 'women' : ''
  return [genderWord, categoryWord].filter(Boolean).join(' ')
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
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = buildKeywords(category, gender)
  try {
    const products = await callCjGraphQL(keywords, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // No credentials or API error — return empty so aggregator auto-generates SHEIN offers
  }
  return []
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  try {
    const products = await callCjGraphQL(keywords, pageNo, Math.min(pageSize, 40))
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
    const products = await callCjGraphQL(`${deviceName} accessories`, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // No credentials — return empty
  }
  return []
}

export const sheinAdapter: AffiliateAdapter = {
  platform: 'shein',
  isConfigured: !!CJ_CREDENTIALS.accessToken,

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
