import type { Product } from '../types'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { fetchAliExpressProducts } from '../lib/aliexpress'

// CJ client — routes through the AliExpress Affiliate API (same edge function).
// The CJ Affiliate account requires advertiser program partnerships that aren't configured yet,
// so we use AliExpress as the product source and tag results as "cj" platform.
// All results are real products with real images.

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

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = keywordsForCategory(category, gender)
  const categoryIds = categoryIdsFor(category)
  const products = await fetchAliExpressProducts(keywords, pageNo, Math.min(pageSize, 40), gender, categoryIds, 'VOLUME_DOWN')
  return products.map((p) => ({ ...p, platform: 'cj' as const }))
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  const products = await fetchAliExpressProducts(keywords, pageNo, Math.min(pageSize, 40), undefined, undefined, 'VOLUME_DOWN')
  return products.map((p) => ({ ...p, platform: 'cj' as const }))
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  gender?: Gender,
): Promise<Product[]> {
  const products = await fetchAliExpressProducts(`${deviceName} accessories case cover`, pageNo, Math.min(pageSize, 40), gender, CJ_CATEGORY_IDS_ACCESSORIES, 'VOLUME_DOWN')
  return products.map((p) => ({ ...p, platform: 'cj' as const }))
}
