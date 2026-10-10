import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { wrapWithSkimlinks } from '../utils/skimlinks'
export { searchVisualMatch as searchExactVisualMatch } from './imageSearch'

// Temu adapter — visual matching via Google Lens only (no affiliate API key needed).
// Products from Temu are discovered through the visual-search edge function,
// not through a Temu affiliate API. These feed/search functions return empty
// since there's no Temu product API to query; real Temu offers surface as
// secondary "שווה בדיקה" results in the product detail modal.

const TEMU_CATEGORIES: Record<FeedCategory, string> = {
  all: 'fashion',
  clothing: 'clothing',
  shoes: 'shoes',
  accessories: 'accessories',
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

export async function searchProductsByCategory(
  _category: FeedCategory,
  _gender: Gender,
  _pageNo: number,
  _pageSize: number,
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  return []
}

export async function searchProducts(_keywords: string, _pageNo = 1, _pageSize = 50): Promise<Product[]> {
  return []
}

export async function searchDeviceAccessories(
  _deviceName: string,
  _pageNo = 1,
  _pageSize = 50,
  _gender?: Gender,
): Promise<Product[]> {
  return []
}

export const temuAdapter: AffiliateAdapter = {
  platform: 'temu',
  isConfigured: false,

  async searchByCategory(_params: AdapterSearchParams): Promise<Product[]> {
    return []
  },

  async searchByQuery(_params: AdapterQueryParams): Promise<Product[]> {
    return []
  },

  async searchDeviceAccessories(_params: AdapterDeviceParams): Promise<Product[]> {
    return []
  },
}
