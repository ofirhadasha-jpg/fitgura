import { fetchAliExpressProducts, fetchProductDetails, generateAffiliateLink as fetchAffiliateLink } from '../lib/aliexpress'
import type { Product } from '../types'

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  return fetchAliExpressProducts(keywords, pageNo, pageSize)
}

export async function getProductDetails(productIds: string[]): Promise<unknown> {
  return fetchProductDetails(productIds)
}

export async function generateAffiliateLink(sourceUrl: string): Promise<string | null> {
  return fetchAffiliateLink(sourceUrl)
}
