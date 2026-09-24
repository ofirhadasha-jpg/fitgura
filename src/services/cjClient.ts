import type { Product } from '../types'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { fetchAliExpressProducts } from '../lib/aliexpress'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'

// CJ client — calls the real CJ Affiliate edge function (supabase/functions/cj-affiliate).
// If CJ returns an error (e.g. 403 not authorized), falls back to AliExpress products
// tagged as "cj" so the feed still has results.

const CJ_CATEGORY_IDS_CLOTHING = '200000783,200000782'
const CJ_CATEGORY_IDS_SHOES = '200000835,200000832,200000831'
const CJ_CATEGORY_IDS_ACCESSORIES = '5090301,509'

function categoryIdsFor(category: FeedCategory): string | undefined {
  if (category === 'clothing') return CJ_CATEGORY_IDS_CLOTHING
  if (category === 'shoes') return CJ_CATEGORY_IDS_SHOES
  if (category === 'accessories') return CJ_CATEGORY_IDS_ACCESSORIES
  return undefined
}

function keywordsForCategory(category: FeedCategory, gender: Gender): string {
  const genderWord = gender === 'male' ? 'men' : gender === 'female' ? 'women' : ''
  const categoryWord = category === 'clothing' ? 'apparel clothing' : category === 'shoes' ? 'shoes footwear' : category === 'accessories' ? 'accessories' : 'fashion'
  return [genderWord, categoryWord].filter(Boolean).join(' ')
}

async function callCjEdgeFunction(keywords: string): Promise<Product[]> {
  const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/cj-affiliate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
    },
    body: JSON.stringify({ action: 'search', keywords }),
  })

  if (!response.ok) return []

  const result = await response.json() as { products?: Record<string, unknown>[]; error?: string }
  if (result.error) return []

  const raw = result.products ?? []
  return raw.map((p) => ({
    name: String(p.name ?? ''),
    brand: String(p.brand ?? 'CJ'),
    price: Number(p.price ?? 0),
    originalPrice: null,
    currency: String(p.currency ?? 'USD'),
    img: String(p.img ?? ''),
    category: '',
    aliexpressUrl: String(p.aliexpressUrl ?? ''),
    aliexpressSku: String(p.aliexpressSku ?? ''),
    availableSizes: (p.availableSizes as string[]) ?? [],
    platform: 'cj' as const,
    promotionLink: null,
  })) as Product[]
}

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = keywordsForCategory(category, gender)

  // Try real CJ Affiliate API first
  try {
    const cjProducts = await callCjEdgeFunction(keywords)
    if (cjProducts.length > 0) return cjProducts
  } catch {
    // CJ failed — fall through to AliExpress fallback
  }

  // Fallback: query AliExpress and tag as CJ
  const categoryIds = categoryIdsFor(category)
  const products = await fetchAliExpressProducts(keywords, pageNo, Math.min(pageSize, 40), gender, categoryIds, 'VOLUME_DOWN')
  return products.map((p) => ({ ...p, platform: 'cj' as const }))
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  try {
    const cjProducts = await callCjEdgeFunction(keywords)
    if (cjProducts.length > 0) return cjProducts
  } catch {
    // fall through
  }

  const products = await fetchAliExpressProducts(keywords, pageNo, Math.min(pageSize, 40), undefined, undefined, 'VOLUME_DOWN')
  return products.map((p) => ({ ...p, platform: 'cj' as const }))
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  gender?: Gender,
): Promise<Product[]> {
  try {
    const cjProducts = await callCjEdgeFunction(`${deviceName} accessories case cover`)
    if (cjProducts.length > 0) return cjProducts
  } catch {
    // fall through
  }

  const products = await fetchAliExpressProducts(`${deviceName} accessories case cover`, pageNo, Math.min(pageSize, 40), gender, CJ_CATEGORY_IDS_ACCESSORIES, 'VOLUME_DOWN')
  return products.map((p) => ({ ...p, platform: 'cj' as const }))
}
