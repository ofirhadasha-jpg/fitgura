import { fetchAliExpressProducts } from '../lib/aliexpress'
import type { Product } from '../types'

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 20): Promise<Product[]> {
  return fetchAliExpressProducts(keywords, pageNo, pageSize)
}
