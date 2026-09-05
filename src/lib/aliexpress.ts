import type { Product } from '../types'
import { supabase } from './supabase'

export async function fetchAliExpressProducts(keywords: string, pageNo = 1, pageSize = 20, gender?: 'male' | 'female' | 'unisex'): Promise<Product[]> {
  const { data, error } = await supabase.functions.invoke('aliexpress-search', {
    body: { action: 'search', keywords, pageNo, pageSize, gender },
  })

  if (error) {
    throw new Error(error.message || 'AliExpress request failed')
  }

  const result = data as { products?: Product[] } | null
  if (!result || !result.products || !Array.isArray(result.products)) {
    throw new Error('AliExpress returned an invalid product list')
  }

  return result.products
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
