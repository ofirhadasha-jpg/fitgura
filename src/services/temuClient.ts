import type { Product } from '../types'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { fetchAliExpressProducts } from '../lib/aliexpress'

// Temu client — routes through the AliExpress Affiliate API (same edge function).
// Many AliExpress sellers also list on Temu, so we query AliExpress with Temu-oriented
// keywords and tag results as "temu" platform. All results are real products with real images.

const TEMU_CATEGORY_IDS_CLOTHING = '200000783,200000782'
const TEMU_CATEGORY_IDS_SHOES = '200000835,200000832,200000831'
const TEMU_CATEGORY_IDS_ACCESSORIES = '5090301,509'

function categoryIdsFor(category: FeedCategory): string | undefined {
  if (category === 'clothing') return TEMU_CATEGORY_IDS_CLOTHING
  if (category === 'shoes') return TEMU_CATEGORY_IDS_SHOES
  if (category === 'accessories') return TEMU_CATEGORY_IDS_ACCESSORIES
  return undefined
}

function keywordsForCategory(category: FeedCategory, gender: Gender): string {
  const genderWord = gender === 'male' ? 'men' : gender === 'female' ? 'women' : ''
  const categoryWord = category === 'clothing' ? 'clothing fashion' : category === 'shoes' ? 'shoes sneakers' : category === 'accessories' ? 'accessories' : 'fashion'
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
  return products.map((p) => ({ ...p, platform: 'temu' as const }))
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  const products = await fetchAliExpressProducts(keywords, pageNo, Math.min(pageSize, 40), undefined, undefined, 'VOLUME_DOWN')
  return products.map((p) => ({ ...p, platform: 'temu' as const }))
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  gender?: Gender,
): Promise<Product[]> {
  const products = await fetchAliExpressProducts(`${deviceName} accessories case cover`, pageNo, Math.min(pageSize, 40), gender, TEMU_CATEGORY_IDS_ACCESSORIES, 'VOLUME_DOWN')
  return products.map((p) => ({ ...p, platform: 'temu' as const }))
}
