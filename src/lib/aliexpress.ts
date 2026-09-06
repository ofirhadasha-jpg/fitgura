import type { Product } from '../types'
import { supabase } from './supabase'
import { generateMockProducts } from './mockProducts'
import type { Gender, FeedCategory } from '../services/aliexpressClient'

export interface FetchResult {
  products: Product[]
  isFallback: boolean
}

export async function fetchAliExpressProducts(
  keywords: string,
  pageNo = 1,
  pageSize = 50,
  gender?: 'male' | 'female' | 'unisex',
  categoryIds?: string,
  sort?: string,
): Promise<Product[]> {
  const result = await fetchAliExpressProductsWithFlag(keywords, pageNo, pageSize, gender, categoryIds, sort)
  return result.products
}

export async function fetchAliExpressProductsWithFlag(
  keywords: string,
  pageNo = 1,
  pageSize = 50,
  gender?: 'male' | 'female' | 'unisex',
  categoryIds?: string,
  sort?: string,
): Promise<FetchResult> {
  console.log('[aliexpress] Fetching products:', { keywords, pageNo, pageSize, gender, categoryIds, sort })

  try {
    const { data, error } = await supabase.functions.invoke('aliexpress-search', {
      body: { action: 'search', keywords, pageNo, pageSize, gender, categoryIds, sort },
    })

    if (error) {
      console.error('[aliexpress] Error from edge function:', error)
      throw new Error(error.message || 'AliExpress request failed')
    }

    const result = data as { products?: Product[]; isFallback?: boolean } | null
    if (!result || !result.products || !Array.isArray(result.products)) {
      console.error('[aliexpress] Invalid response:', data)
      throw new Error('AliExpress returned an invalid product list')
    }

    console.log('[aliexpress] Received', result.products.length, 'products, fallback:', !!result.isFallback)
    return { products: result.products, isFallback: !!result.isFallback }
  } catch (err) {
    console.error('[aliexpress] Edge function invocation failed, using client-side mock fallback:', err)
    const g: Gender = gender ?? 'unisex'
    const cat: FeedCategory = categoryIds === '5090301,509' || categoryIds === '509'
      ? 'accessories'
      : categoryIds === '200000783,200000782'
        ? 'clothing'
        : 'all'
    const mockProducts = generateMockProducts(cat, g, pageNo, pageSize, keywords)
    return { products: mockProducts, isFallback: true }
  }
}

export async function fetchProductDetails(productIds: string[]): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('aliexpress-search', {
    body: { action: 'details', productIds },
  })

  if (error) {
    throw new Error(error.message || 'AliExpress request failed')
  }

  return data
}

export async function generateAffiliateLink(sourceUrl: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('aliexpress-search', {
    body: { action: 'affiliate-link', sourceUrl },
  })

  if (error || !data) return null

  const result = data as { links?: { promotion_link?: string }[] | null } | null
  return result?.links?.[0]?.promotion_link ?? null
}
