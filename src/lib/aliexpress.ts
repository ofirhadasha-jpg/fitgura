import type { Product } from '../types'

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aliexpress-search`

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
} as const

export async function fetchAliExpressProducts(keywords: string, pageNo = 1, pageSize = 20, gender?: 'male' | 'female' | 'unisex'): Promise<Product[]> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ action: 'search', keywords, pageNo, pageSize, gender }),
  })

  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result
      ? String(result.error)
      : `AliExpress request failed (${response.status})`
    throw new Error(message)
  }

  if (typeof result !== 'object' || result === null || !('products' in result) || !Array.isArray(result.products)) {
    throw new Error('AliExpress returned an invalid product list')
  }

  return result.products as Product[]
}

export async function fetchProductDetails(productIds: string[]): Promise<unknown> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ action: 'details', productIds }),
  })

  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result
      ? String(result.error)
      : `AliExpress request failed (${response.status})`
    throw new Error(message)
  }

  return result
}

export async function generateAffiliateLink(sourceUrl: string): Promise<string | null> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ action: 'affiliate-link', sourceUrl }),
  })

  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) return null

  if (typeof result === 'object' && result !== null && 'links' in result) {
    const links = (result as { links: { promotion_link?: string }[] | null }).links
    return links?.[0]?.promotion_link ?? null
  }

  return null
}
