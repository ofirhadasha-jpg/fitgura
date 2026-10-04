import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams, CJCredentials } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'

// SHEIN adapter — routes through CJ Affiliate's GraphQL API (SHEIN is a CJ advertiser).
// While CJ approval is pending, returns structured mock data so the feed stays populated.
// Once CJ credentials are configured and the advertiser relationship is approved,
// the real CJ GraphQL queries will return live SHEIN products.

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

// ── CJ GraphQL query for SHEIN products ───────────────────────────────────────

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
    category: String(p.category ?? ''),
    aliexpressUrl: String(p.productUrl ?? p.link ?? ''),
    aliexpressSku: String(p.sku ?? p.productId ?? ''),
    availableSizes: (p.sizes as string[]) ?? [],
    ordersCount: Number(p.reviewsCount ?? 0) || undefined,
    evaluateRate: Number(p.rating ?? 0) || undefined,
    platform: 'shein' as const,
    promotionLink: null,
  })) as Product[]
}

// ── Structured mock data ──────────────────────────────────────────────────────

const MOCK_SHEIN_PRODUCTS: Record<string, Omit<Product, 'platform'>[]> = {
  clothing: [
    { name: 'SHEIN Women Oversized Knit Sweater', brand: 'SHEIN', price: 89, originalPrice: 149, currency: 'ILS', img: '', category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL'], ordersCount: 3200, evaluateRate: 4.6 },
    { name: 'SHEIN Men Casual Cargo Pants', brand: 'SHEIN', price: 119, originalPrice: 189, currency: 'ILS', img: '', category: 'clothing', availableSizes: ['38', '40', '42', '44'], ordersCount: 1800, evaluateRate: 4.3 },
    { name: 'SHEIN Women Floral Midi Dress', brand: 'SHEIN', price: 99, originalPrice: 169, currency: 'ILS', img: '', category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L'], ordersCount: 5400, evaluateRate: 4.7 },
    { name: 'SHEIN Men Striped Button-Up Shirt', brand: 'SHEIN', price: 79, originalPrice: 129, currency: 'ILS', img: '', category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], ordersCount: 2100, evaluateRate: 4.4 },
    { name: 'SHEIN Women High-Waist Wide Leg Jeans', brand: 'SHEIN', price: 109, originalPrice: 179, currency: 'ILS', img: '', category: 'clothing', availableSizes: ['36', '38', '40', '42', '44'], ordersCount: 4100, evaluateRate: 4.5 },
  ],
  shoes: [
    { name: 'SHEIN Women Chunky Platform Sneakers', brand: 'SHEIN', price: 129, originalPrice: 199, currency: 'ILS', img: '', category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], ordersCount: 2800, evaluateRate: 4.5 },
    { name: 'SHEIN Men Minimalist White Sneakers', brand: 'SHEIN', price: 149, originalPrice: 229, currency: 'ILS', img: '', category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], ordersCount: 1600, evaluateRate: 4.4 },
    { name: 'SHEIN Women Strappy Sandals', brand: 'SHEIN', price: 89, originalPrice: 139, currency: 'ILS', img: '', category: 'shoes', availableSizes: ['36', '37', '38', '39', '40'], ordersCount: 3400, evaluateRate: 4.6 },
  ],
  accessories: [
    { name: 'SHEIN Crossbody Mini Bag', brand: 'SHEIN', price: 59, originalPrice: 99, currency: 'ILS', img: '', category: 'accessories', availableSizes: [], ordersCount: 5200, evaluateRate: 4.7 },
    { name: 'SHEIN Oversized Square Sunglasses', brand: 'SHEIN', price: 39, originalPrice: 69, currency: 'ILS', img: '', category: 'accessories', availableSizes: [], ordersCount: 8900, evaluateRate: 4.8 },
    { name: 'SHEIN Gold Layered Necklace Set', brand: 'SHEIN', price: 29, originalPrice: 59, currency: 'ILS', img: '', category: 'accessories', availableSizes: [], ordersCount: 12000, evaluateRate: 4.6 },
  ],
}

function generateMockProducts(category: FeedCategory, gender: Gender, pageSize: number): Product[] {
  const pool = MOCK_SHEIN_PRODUCTS[category] ?? MOCK_SHEIN_PRODUCTS.clothing
  const genderFiltered = gender === 'unisex'
    ? pool
    : pool.filter((p) => {
        if (gender === 'female') return /women|floral|midi|sandals|sunglasses|necklace|bag/i.test(p.name)
        if (gender === 'male') return /men|cargo|button-up/i.test(p.name)
        return true
      })

  return genderFiltered.slice(0, pageSize).map((p) => ({
    ...p,
    platform: 'shein' as const,
    aliexpressUrl: `https://www.shein.com/search?q=${encodeURIComponent(p.name)}`,
    aliexpressSku: `shein-mock-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
    promotionLink: null,
  }))
}

function generateMockQueryProducts(keywords: string, pageSize: number): Product[] {
  const lower = keywords.toLowerCase()
  let category: FeedCategory = 'clothing'
  if (/shoe|sneaker|boot|sandal|heel/i.test(lower)) category = 'shoes'
  else if (/bag|sunglass|necklace|accessory|jewel/i.test(lower)) category = 'accessories'

  const pool = MOCK_SHEIN_PRODUCTS[category] ?? MOCK_SHEIN_PRODUCTS.clothing
  return pool.slice(0, pageSize).map((p) => ({
    ...p,
    platform: 'shein' as const,
    aliexpressUrl: `https://www.shein.com/search?q=${encodeURIComponent(p.name)}`,
    aliexpressSku: `shein-mock-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
    promotionLink: null,
  }))
}

function generateMockDeviceAccessories(deviceName: string, pageSize: number): Product[] {
  const mockAccessories = [
    { name: `SHEIN ${deviceName} Phone Case Minimalist`, brand: 'SHEIN', price: 49, originalPrice: 79, currency: 'ILS', category: 'accessories' },
    { name: `SHEIN ${deviceName} Screen Protector Kit`, brand: 'SHEIN', price: 29, originalPrice: 49, currency: 'ILS', category: 'accessories' },
    { name: `SHEIN ${deviceName} Leather Wallet Strap`, brand: 'SHEIN', price: 59, originalPrice: 99, currency: 'ILS', category: 'accessories' },
  ]
  return mockAccessories.slice(0, pageSize).map((p) => ({
    ...p,
    img: '',
    availableSizes: [],
    ordersCount: 800,
    evaluateRate: 4.3,
    platform: 'shein' as const,
    aliexpressUrl: `https://www.shein.com/search?q=${encodeURIComponent(p.name)}`,
    aliexpressSku: `shein-mock-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
    promotionLink: null,
  }))
}

// ── Keyword builder ───────────────────────────────────────────────────────────

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

// ── Public API (backward-compatible exports) ──────────────────────────────────

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = buildKeywords(category, gender)

  // Try real CJ GraphQL first
  try {
    const products = await callCjGraphQL(keywords, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // CJ not ready — fall through to mock
  }

  // Fallback to structured mock data
  return withSkimlinks(generateMockProducts(category, gender, pageSize))
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  try {
    const products = await callCjGraphQL(keywords, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // fall through
  }

  return withSkimlinks(generateMockQueryProducts(keywords, pageSize))
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
    // fall through
  }

  return withSkimlinks(generateMockDeviceAccessories(deviceName, pageSize))
}

// ── Adapter interface implementation ──────────────────────────────────────────

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
