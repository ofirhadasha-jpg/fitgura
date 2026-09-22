import type { Product } from '../types'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '@/lib/config'

// SHEIN client — routes through the CJ Affiliate edge function (server-side proxy).
// CJ hosts real product listings from thousands of advertisers, including SHEIN sellers.
// No fake catalog data — all results are live API responses.

const CJ_ENDPOINT = `${EDGE_FUNCTION_URL}/functions/v1/cj-affiliate`

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
} as const

interface CJRawProduct {
  name: string
  brand: string
  advertiserName: string
  price: number
  currency: string
  img: string
  category: string
  aliexpressUrl: string
  aliexpressSku: string
  availableSizes: string[]
  platform: 'cj'
  promotionLink: string | null
}

function toProduct(raw: CJRawProduct): Product {
  return {
    name: raw.name,
    brand: raw.advertiserName || raw.brand || 'SHEIN',
    price: raw.price,
    currency: raw.currency,
    img: raw.img,
    category: raw.category || 'clothing',
    aliexpressUrl: raw.aliexpressUrl,
    aliexpressSku: raw.aliexpressSku,
    availableSizes: raw.availableSizes,
    platform: 'shein',
    promotionLink: raw.promotionLink,
  } as Product
}

async function fetchCJ(keywords: string): Promise<Product[]> {
  try {
    const response = await fetch(CJ_ENDPOINT, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ action: 'search', keywords }),
    })

    if (!response.ok) {
      console.error('[SHEIN Client] HTTP error:', response.status)
      return []
    }

    const result: unknown = await response.json().catch(() => null)
    if (typeof result !== 'object' || result === null || !('products' in result) || !Array.isArray(result.products)) {
      return []
    }

    return (result.products as CJRawProduct[]).map(toProduct)
  } catch (err) {
    console.error('[SHEIN Client] Fetch failed:', err instanceof Error ? err.message : err)
    return []
  }
}

function keywordsForCategory(category: FeedCategory, gender: Gender): string {
  const genderWord = gender === 'male' ? 'men' : gender === 'female' ? 'women' : ''
  const categoryWord = category === 'clothing' ? 'fashion clothing shein' : category === 'shoes' ? 'shoes shein' : category === 'accessories' ? 'accessories shein' : 'shein fashion'
  return [genderWord, categoryWord].filter(Boolean).join(' ')
}

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  _pageNo: number,
  _pageSize: number,
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  return fetchCJ(keywordsForCategory(category, gender))
}

export async function searchProducts(keywords: string, _pageNo = 1, _pageSize = 50): Promise<Product[]> {
  return fetchCJ(keywords)
}

export async function searchDeviceAccessories(
  deviceName: string,
  _pageNo = 1,
  _pageSize = 50,
  _gender?: Gender,
): Promise<Product[]> {
  return fetchCJ(`${deviceName} accessories case cover`)
}
