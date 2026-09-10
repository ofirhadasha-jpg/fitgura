import type { Product } from '../types'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from './config'
import { supabase } from './supabase'

async function invokeEdgeFunction(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { data: { session } } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
    apikey: EDGE_FUNCTION_ANON_KEY,
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/aliexpress-search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`AliExpress request failed (${response.status}): ${errText.slice(0, 200)}`)
  }

  const result = await response.json() as Record<string, unknown> | null
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
