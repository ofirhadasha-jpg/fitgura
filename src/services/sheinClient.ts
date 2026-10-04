import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams, CJCredentials } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import { getImagesForKeyword } from '../utils/productImages'

// SHEIN adapter — routes through CJ Affiliate's GraphQL API (SHEIN is a CJ advertiser).
// While CJ approval is pending, returns keyword-dynamic mock data with real product
// images so the feed shows realistic results. Once CJ credentials are configured,
// real CJ GraphQL queries will return live SHEIN products.

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

// ── Dynamic mock product generation ───────────────────────────────────────────

let mockIdCounter = 100000

function nextSheinId(): string {
  return String(++mockIdCounter)
}

function detectCategoryFromKeywords(keywords: string): FeedCategory {
  const lower = keywords.toLowerCase()
  if (/shoe|sneaker|boot|sandal|heel|footwear/i.test(lower)) return 'shoes'
  if (/bag|sunglass|necklace|accessory|jewel|ring|watch/i.test(lower)) return 'accessories'
  return 'clothing'
}

function inferGenderFromKeywords(keywords: string): Gender | null {
  const lower = keywords.toLowerCase()
  if (/women|woman|female|girl|ladies/i.test(lower)) return 'female'
  if (/men|man|male|boy/i.test(lower)) return 'male'
  return null
}

interface MockTemplate {
  name: (kw: string, gender: Gender) => string
  basePrice: number
  discount: number
  sizes: string[]
  orders: number
  rating: number
}

const MOCK_TEMPLATES: Record<FeedCategory, MockTemplate[]> = {
  clothing: [
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Casual Top`.trim(), basePrice: 79, discount: 139, sizes: ['XS', 'S', 'M', 'L', 'XL'], orders: 3200, rating: 4.5 },
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Slim Fit`.trim(), basePrice: 69, discount: 119, sizes: ['S', 'M', 'L', 'XL'], orders: 2100, rating: 4.3 },
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} Premium ${kw}`.trim(), basePrice: 99, discount: 169, sizes: ['XS', 'S', 'M', 'L', 'XL'], orders: 5400, rating: 4.7 },
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Oversized`.trim(), basePrice: 89, discount: 149, sizes: ['S', 'M', 'L', 'XL', 'XXL'], orders: 4100, rating: 4.5 },
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Basic Essential`.trim(), basePrice: 59, discount: 99, sizes: ['XS', 'S', 'M', 'L'], orders: 8900, rating: 4.6 },
  ],
  shoes: [
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Sneakers`.trim(), basePrice: 129, discount: 199, sizes: g === 'male' ? ['40', '41', '42', '43', '44', '45'] : ['36', '37', '38', '39', '40', '41'], orders: 2800, rating: 4.5 },
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Casual Shoes`.trim(), basePrice: 99, discount: 169, sizes: g === 'male' ? ['40', '41', '42', '43', '44'] : ['36', '37', '38', '39', '40'], orders: 1600, rating: 4.4 },
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Comfort`.trim(), basePrice: 89, discount: 149, sizes: g === 'male' ? ['41', '42', '43', '44'] : ['36', '37', '38', '39'], orders: 3400, rating: 4.6 },
  ],
  accessories: [
    { name: (kw) => `SHEIN ${kw} Premium Quality`.trim(), basePrice: 59, discount: 99, sizes: [], orders: 5200, rating: 4.7 },
    { name: (kw) => `SHEIN ${kw} Minimalist Design`.trim(), basePrice: 39, discount: 69, sizes: [], orders: 8900, rating: 4.8 },
    { name: (kw) => `SHEIN ${kw} Trending Style`.trim(), basePrice: 29, discount: 59, sizes: [], orders: 12000, rating: 4.6 },
  ],
  all: [
    { name: (kw, g) => `SHEIN ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw}`.trim(), basePrice: 79, discount: 129, sizes: ['S', 'M', 'L'], orders: 3500, rating: 4.5 },
  ],
}

function sheinProductUrl(name: string, id: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `https://www.shein.com/${slug}-p-${id}.html`
}

function generateMockProducts(category: FeedCategory, gender: Gender, pageSize: number, keywords?: string): Product[] {
  const searchKw = keywords ?? SHEIN_CATEGORIES[category] ?? 'fashion'
  const effectiveGender = gender === 'unisex' ? (inferGenderFromKeywords(searchKw) ?? 'unisex') : gender
  const templates = MOCK_TEMPLATES[category] ?? MOCK_TEMPLATES.clothing
  const images = getImagesForKeyword(searchKw, templates.length)
  const count = Math.min(pageSize, templates.length)

  return Array.from({ length: count }, (_, i) => {
    const tpl = templates[i % templates.length]
    const id = nextSheinId()
    const name = tpl.name(searchKw, effectiveGender)
    return {
      name,
      brand: 'SHEIN',
      price: tpl.basePrice,
      originalPrice: tpl.discount,
      currency: 'ILS',
      img: images[i % images.length],
      category,
      aliexpressUrl: sheinProductUrl(name, id),
      aliexpressSku: `shein-${id}`,
      availableSizes: tpl.sizes,
      ordersCount: tpl.orders,
      evaluateRate: tpl.rating,
      platform: 'shein' as const,
      promotionLink: null,
    } as Product
  })
}

function generateMockQueryProducts(keywords: string, pageSize: number): Product[] {
  const category = detectCategoryFromKeywords(keywords)
  const gender = inferGenderFromKeywords(keywords) ?? 'unisex'
  return generateMockProducts(category, gender, pageSize, keywords)
}

function generateMockDeviceAccessories(deviceName: string, pageSize: number): Product[] {
  const searchKw = `${deviceName} case`
  const images = getImagesForKeyword(searchKw, 3)
  const mockAccessories = [
    { name: `SHEIN ${deviceName} Premium Phone Case`, basePrice: 49, discount: 79 },
    { name: `SHEIN ${deviceName} Screen Protector Kit`, basePrice: 29, discount: 49 },
    { name: `SHEIN ${deviceName} Leather Wallet Strap`, basePrice: 59, discount: 99 },
  ]
  return mockAccessories.slice(0, pageSize).map((p, i) => {
    const id = nextSheinId()
    return {
      name: p.name,
      brand: 'SHEIN',
      price: p.basePrice,
      originalPrice: p.discount,
      currency: 'ILS',
      img: images[i % images.length],
      category: 'accessories',
      aliexpressUrl: sheinProductUrl(p.name, id),
      aliexpressSku: `shein-${id}`,
      availableSizes: [],
      ordersCount: 800,
      evaluateRate: 4.3,
      platform: 'shein' as const,
      promotionLink: null,
    } as Product
  })
}

// ── Keyword builder ───────────────────────────────────────────────────────────

function buildKeywords(category: FeedCategory, gender: Gender, extraKeywords?: string): string {
  const parts = [gender === 'male' ? 'men' : gender === 'female' ? 'women' : '', SHEIN_CATEGORIES[category] ?? 'Fashion', extraKeywords]
  return parts.filter(Boolean).join(' ')
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
  extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = buildKeywords(category, gender, extraKeywords)

  try {
    const products = await callCjGraphQL(keywords, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // CJ not ready — fall through to mock
  }

  return withSkimlinks(generateMockProducts(category, gender, pageSize, extraKeywords))
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
