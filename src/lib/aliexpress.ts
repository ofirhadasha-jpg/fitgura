import type { Product } from '../types'
import { supabase } from './supabase'

/**
 * Invokes the aliexpress-search edge function.
 * The edge function ALWAYS returns HTTP 200 — errors are embedded in the JSON body as { error: string }.
 * This wrapper extracts the body-level error and converts it to a thrown Error so callers can handle it uniformly.
 */
async function invokeEdgeFunction(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.functions.invoke('aliexpress-search', { body })

  if (error) {
    throw new Error(error.message || 'AliExpress request failed')
  }

  const result = data as Record<string, unknown> | null
  if (result?.error) {
    throw new Error(String(result.error))
  }

  return result
}

export async function fetchAliExpressProducts(
  keywords: string,
  pageNo = 1,
  pageSize = 50,
  gender?: 'male' | 'female' | 'unisex',
  categoryIds?: string,
  sort?: string,
): Promise<Product[]> {
  try {
    const result = await invokeEdgeFunction({
      action: 'search',
      keywords,
      pageNo,
      pageSize,
      gender,
      categoryIds,
      sort,
    })

    const products = result?.products
    if (!Array.isArray(products)) {
      return []
    }

    return products as Product[]
  } catch (err) {
    console.error('[aliexpress] fetchAliExpressProducts failed:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function fetchProductDetails(productIds: string[]): Promise<unknown> {
  try {
    const result = await invokeEdgeFunction({
      action: 'details',
      productIds,
    })
    return result?.details ?? null
  } catch (err) {
    console.error('[aliexpress] fetchProductDetails failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function generateAffiliateLink(sourceUrl: string): Promise<string | null> {
  try {
    const result = await invokeEdgeFunction({
      action: 'affiliate-link',
      sourceUrl,
    })

    const links = result?.links as { promotion_link?: string }[] | null | undefined
    return links?.[0]?.promotion_link ?? null
  } catch (err) {
    console.error('[aliexpress] generateAffiliateLink failed:', err instanceof Error ? err.message : err)
    return null
  }
}
