import type { Product } from '../types'

export async function fetchAliExpressProducts(keywords: string): Promise<Product[]> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aliexpress-search`
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ keywords }),
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
