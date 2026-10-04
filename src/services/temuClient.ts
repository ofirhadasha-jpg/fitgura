import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams, TemuCredentials } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import { getImagesForKeyword } from '../utils/productImages'

// Temu adapter — structured for direct Temu affiliate API integration.
// While credentials are pending, returns keyword-dynamic mock data with real
// product images. Once configured, the edge function calls Temu's API directly.

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

// ── Direct Temu affiliate API call (via edge function) ────────────────────────

async function callTemuApi(keywords: string, pageNo: number, pageSize: number): Promise<Product[]> {
  if (!TEMU_CREDENTIALS.affiliateKey) return []

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
    category: String(p.category ?? ''),
    aliexpressUrl: String(p.url ?? p.productUrl ?? ''),
    aliexpressSku: String(p.sku ?? p.productId ?? ''),
    availableSizes: (p.sizes as string[]) ?? [],
    ordersCount: Number(p.sales ?? 0) || undefined,
    evaluateRate: Number(p.rating ?? 0) || undefined,
    platform: 'temu' as const,
    promotionLink: (p.promotionLink ?? null) as string | null,
  })) as Product[]
}

// ── Dynamic mock product generation ───────────────────────────────────────────

let mockIdCounter = 200000

function nextTemuId(): string {
  return String(++mockIdCounter)
}

function detectCategoryFromKeywords(keywords: string): FeedCategory {
  const lower = keywords.toLowerCase()
  if (/shoe|sneaker|boot|sandal|heel|footwear|running/i.test(lower)) return 'shoes'
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
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Budget Pick`.trim(), basePrice: 49, discount: 89, sizes: ['XS', 'S', 'M', 'L'], orders: 6500, rating: 4.5 },
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Value Pack`.trim(), basePrice: 59, discount: 99, sizes: ['S', 'M', 'L', 'XL'], orders: 8900, rating: 4.7 },
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Everyday Wear`.trim(), basePrice: 39, discount: 69, sizes: ['XS', 'S', 'M', 'L'], orders: 12000, rating: 4.4 },
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Trending Now`.trim(), basePrice: 69, discount: 119, sizes: ['S', 'M', 'L', 'XL', 'XXL'], orders: 4100, rating: 4.4 },
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Best Value`.trim(), basePrice: 35, discount: 59, sizes: ['36', '38', '40', '42'], orders: 7200, rating: 4.6 },
  ],
  shoes: [
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Lightweight`.trim(), basePrice: 69, discount: 119, sizes: g === 'male' ? ['40', '41', '42', '43', '44', '45'] : ['36', '37', '38', '39', '40'], orders: 5600, rating: 4.5 },
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Comfort Pro`.trim(), basePrice: 89, discount: 149, sizes: g === 'male' ? ['40', '41', '42', '43', '44'] : ['36', '37', '38', '39', '40'], orders: 3800, rating: 4.4 },
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw} Budget`.trim(), basePrice: 49, discount: 89, sizes: g === 'male' ? ['41', '42', '43', '44'] : ['36', '37', '38', '39'], orders: 6700, rating: 4.6 },
  ],
  accessories: [
    { name: (kw) => `Temu ${kw} Super Value`.trim(), basePrice: 25, discount: 49, sizes: [], orders: 15000, rating: 4.7 },
    { name: (kw) => `Temu ${kw} Best Seller`.trim(), basePrice: 35, discount: 69, sizes: [], orders: 11000, rating: 4.8 },
    { name: (kw) => `Temu ${kw} Hot Pick`.trim(), basePrice: 19, discount: 39, sizes: [], orders: 22000, rating: 4.6 },
  ],
  all: [
    { name: (kw, g) => `Temu ${g === 'male' ? 'Men' : g === 'female' ? 'Women' : ''} ${kw}`.trim(), basePrice: 49, discount: 89, sizes: ['S', 'M', 'L'], orders: 5500, rating: 4.5 },
  ],
}

function temuProductUrl(name: string, id: string): string {
  return `https://www.temu.com/goods-${id}.html`
}

function generateMockProducts(category: FeedCategory, gender: Gender, pageSize: number, keywords?: string): Product[] {
  const searchKw = keywords ?? TEMU_CATEGORIES[category] ?? 'fashion'
  const effectiveGender = gender === 'unisex' ? (inferGenderFromKeywords(searchKw) ?? 'unisex') : gender
  const templates = MOCK_TEMPLATES[category] ?? MOCK_TEMPLATES.clothing
  const images = getImagesForKeyword(searchKw, templates.length)
  const count = Math.min(pageSize, templates.length)

  return Array.from({ length: count }, (_, i) => {
    const tpl = templates[i % templates.length]
    const id = nextTemuId()
    const name = tpl.name(searchKw, effectiveGender)
    return {
      name,
      brand: 'Temu',
      price: tpl.basePrice,
      originalPrice: tpl.discount,
      currency: 'ILS',
      img: images[i % images.length],
      category,
      aliexpressUrl: temuProductUrl(name, id),
      aliexpressSku: `temu-${id}`,
      availableSizes: tpl.sizes,
      ordersCount: tpl.orders,
      evaluateRate: tpl.rating,
      platform: 'temu' as const,
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
    { name: `Temu ${deviceName} Soft Silicone Case`, basePrice: 19, discount: 39 },
    { name: `Temu ${deviceName} Tempered Glass 2-Pack`, basePrice: 15, discount: 29 },
    { name: `Temu ${deviceName} Magnetic Grip Stand`, basePrice: 25, discount: 49 },
  ]
  return mockAccessories.slice(0, pageSize).map((p, i) => {
    const id = nextTemuId()
    return {
      name: p.name,
      brand: 'Temu',
      price: p.basePrice,
      originalPrice: p.discount,
      currency: 'ILS',
      img: images[i % images.length],
      category: 'accessories',
      aliexpressUrl: temuProductUrl(p.name, id),
      aliexpressSku: `temu-${id}`,
      availableSizes: [],
      ordersCount: 1200,
      evaluateRate: 4.2,
      platform: 'temu' as const,
      promotionLink: null,
    } as Product
  })
}

// ── Keyword builder ───────────────────────────────────────────────────────────

function buildKeywords(category: FeedCategory, gender: Gender, extraKeywords?: string): string {
  const parts = [gender === 'male' ? 'men' : gender === 'female' ? 'women' : '', TEMU_CATEGORIES[category] ?? 'fashion', extraKeywords]
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
    const products = await callTemuApi(keywords, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // Temu not ready — fall through to mock
  }

  return withSkimlinks(generateMockProducts(category, gender, pageSize, extraKeywords))
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  try {
    const products = await callTemuApi(keywords, pageNo, Math.min(pageSize, 40))
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
    const products = await callTemuApi(`${deviceName} accessories`, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // fall through
  }

  return withSkimlinks(generateMockDeviceAccessories(deviceName, pageSize))
}

// ── Adapter interface implementation ──────────────────────────────────────────

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
