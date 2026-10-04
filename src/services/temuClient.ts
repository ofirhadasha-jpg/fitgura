import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams, TemuCredentials } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import { getFallbackImage } from '../utils/productImages'

// Temu adapter — structured for direct Temu affiliate API integration.
// While the Temu affiliate program credentials are pending, returns
// structured mock data so the feed stays populated.
// Once credentials are configured, the edge function will call Temu's
// affiliate product search API directly.

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

// ── Structured mock data ──────────────────────────────────────────────────────

const TEMU_IMG = {
  topset:   'https://images.pexels.com/photos/14564843/pexels-photo-14564843.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  joggers:  'https://images.pexels.com/photos/6439226/pexels-photo-6439226.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  skirt:    'https://images.pexels.com/photos/39873869/pexels-photo-39873869.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  tshirt:   'https://images.pexels.com/photos/14564843/pexels-photo-14564843.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  pants:    'https://images.pexels.com/photos/6439226/pexels-photo-6439226.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  sneakers: 'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  running:  'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  sandals:  'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  bag:      'https://images.pexels.com/photos/19869755/pexels-photo-19869755.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  sunglasses: 'https://images.pexels.com/photos/19869755/pexels-photo-19869755.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  ring:     'https://images.pexels.com/photos/19869755/pexels-photo-19869755.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
}

const MOCK_TEMU_PRODUCTS: Record<string, Omit<Product, 'platform'>[]> = {
  clothing: [
    { name: 'Temu Women Ribbed Crop Top Set', brand: 'Temu', price: 69, originalPrice: 119, currency: 'ILS', img: TEMU_IMG.topset, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L'], ordersCount: 6500, evaluateRate: 4.5 },
    { name: 'Temu Men Loose Fit Cargo Joggers', brand: 'Temu', price: 79, originalPrice: 139, currency: 'ILS', img: TEMU_IMG.joggers, category: 'clothing', availableSizes: ['38', '40', '42', '44', '46'], ordersCount: 3200, evaluateRate: 4.3 },
    { name: 'Temu Women Pleated Tennis Skirt', brand: 'Temu', price: 59, originalPrice: 99, currency: 'ILS', img: TEMU_IMG.skirt, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L'], ordersCount: 8900, evaluateRate: 4.7 },
    { name: 'Temu Men Quick-Dry Sports T-Shirt', brand: 'Temu', price: 49, originalPrice: 89, currency: 'ILS', img: TEMU_IMG.tshirt, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], ordersCount: 4100, evaluateRate: 4.4 },
    { name: 'Temu Women Cargo Parachute Pants', brand: 'Temu', price: 89, originalPrice: 149, currency: 'ILS', img: TEMU_IMG.pants, category: 'clothing', availableSizes: ['36', '38', '40', '42'], ordersCount: 7200, evaluateRate: 4.6 },
  ],
  shoes: [
    { name: 'Temu Women Slip-On Canvas Sneakers', brand: 'Temu', price: 89, originalPrice: 149, currency: 'ILS', img: TEMU_IMG.sneakers, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40'], ordersCount: 5600, evaluateRate: 4.5 },
    { name: 'Temu Men Lightweight Running Shoes', brand: 'Temu', price: 99, originalPrice: 169, currency: 'ILS', img: TEMU_IMG.running, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], ordersCount: 3800, evaluateRate: 4.4 },
    { name: 'Temu Women Platform Sandals', brand: 'Temu', price: 69, originalPrice: 119, currency: 'ILS', img: TEMU_IMG.sandals, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40'], ordersCount: 6700, evaluateRate: 4.6 },
  ],
  accessories: [
    { name: 'Temu Clear Phone Crossbody Chain Bag', brand: 'Temu', price: 39, originalPrice: 69, currency: 'ILS', img: TEMU_IMG.bag, category: 'accessories', availableSizes: [], ordersCount: 11000, evaluateRate: 4.7 },
    { name: 'Temu Retro Cat-Eye Sunglasses', brand: 'Temu', price: 29, originalPrice: 49, currency: 'ILS', img: TEMU_IMG.sunglasses, category: 'accessories', availableSizes: [], ordersCount: 15000, evaluateRate: 4.8 },
    { name: 'Temu Stackable Ring Set 12pcs', brand: 'Temu', price: 25, originalPrice: 49, currency: 'ILS', img: TEMU_IMG.ring, category: 'accessories', availableSizes: [], ordersCount: 22000, evaluateRate: 4.6 },
  ],
}

function generateMockProducts(category: FeedCategory, gender: Gender, pageSize: number): Product[] {
  const pool = MOCK_TEMU_PRODUCTS[category] ?? MOCK_TEMU_PRODUCTS.clothing
  const genderFiltered = gender === 'unisex'
    ? pool
    : pool.filter((p) => {
        if (gender === 'female') return /women|tennis|skirt|sandals|sunglasses|ring|bag/i.test(p.name)
        if (gender === 'male') return /men|cargo|sports|running/i.test(p.name)
        return true
      })

  return genderFiltered.slice(0, pageSize).map((p) => ({
    ...p,
    platform: 'temu' as const,
    aliexpressUrl: `https://www.temu.com/search?q=${encodeURIComponent(p.name)}`,
    aliexpressSku: `temu-mock-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
    promotionLink: null,
  }))
}

function generateMockQueryProducts(keywords: string, pageSize: number): Product[] {
  const lower = keywords.toLowerCase()
  let category: FeedCategory = 'clothing'
  if (/shoe|sneaker|boot|sandal|running/i.test(lower)) category = 'shoes'
  else if (/bag|sunglass|ring|accessory|jewel/i.test(lower)) category = 'accessories'

  const pool = MOCK_TEMU_PRODUCTS[category] ?? MOCK_TEMU_PRODUCTS.clothing
  return pool.slice(0, pageSize).map((p) => ({
    ...p,
    platform: 'temu' as const,
    aliexpressUrl: `https://www.temu.com/search?q=${encodeURIComponent(p.name)}`,
    aliexpressSku: `temu-mock-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
    promotionLink: null,
  }))
}

function generateMockDeviceAccessories(deviceName: string, pageSize: number): Product[] {
  const mockAccessories = [
    { name: `Temu ${deviceName} Soft Silicone Case`, brand: 'Temu', price: 19, originalPrice: 39, currency: 'ILS', category: 'accessories' },
    { name: `Temu ${deviceName} Tempered Glass 2-Pack`, brand: 'Temu', price: 15, originalPrice: 29, currency: 'ILS', category: 'accessories' },
    { name: `Temu ${deviceName} Magnetic Phone Grip Stand`, brand: 'Temu', price: 25, originalPrice: 49, currency: 'ILS', category: 'accessories' },
  ]
  return mockAccessories.slice(0, pageSize).map((p) => ({
    ...p,
    img: getFallbackImage('accessories', p.name),
    availableSizes: [],
    ordersCount: 1200,
    evaluateRate: 4.2,
    platform: 'temu' as const,
    aliexpressUrl: `https://www.temu.com/search?q=${encodeURIComponent(p.name)}`,
    aliexpressSku: `temu-mock-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
    promotionLink: null,
  }))
}

// ── Keyword builder ───────────────────────────────────────────────────────────

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

  try {
    return withSkimlinks(generateMockProducts(category, gender, pageSize))
  } catch {
    return []
  }
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  try {
    const products = await callTemuApi(keywords, pageNo, Math.min(pageSize, 40))
    if (products.length > 0) return withSkimlinks(products)
  } catch {
    // fall through
  }

  try {
    return withSkimlinks(generateMockQueryProducts(keywords, pageSize))
  } catch {
    return []
  }
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

  try {
    return withSkimlinks(generateMockDeviceAccessories(deviceName, pageSize))
  } catch {
    return []
  }
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
