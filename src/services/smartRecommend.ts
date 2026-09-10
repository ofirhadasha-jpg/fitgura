export interface UserBodyMetrics {
  chestCm?: number
  waistCm?: number
  hipsCm?: number
  shoulderCm?: number
  heightCm?: number
  weightKg?: number
  preferredFit?: 'tight' | 'regular' | 'loose'
}

export interface FitRecommendation {
  productId: string
  title: string
  recommendedSize: string
  selectedSkuId: string
  fitConfidenceScore: number
  fitExplanation: string
  productImageUrl: string
  affiliateUrl: string
  price: string
}

import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '@/lib/config'

const API_URL = `${EDGE_FUNCTION_URL}/functions/v1/smart-recommend`

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
} as const

export async function getSmartProductRecommendation(
  searchQuery: string,
  userMetrics: UserBodyMetrics,
): Promise<FitRecommendation[]> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ searchQuery, userMetrics }),
  })

  const result: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result
      ? String(result.error)
      : `Smart recommendation failed (${response.status})`
    throw new Error(message)
  }

  if (typeof result !== 'object' || result === null || !('recommendations' in result) || !Array.isArray(result.recommendations)) {
    throw new Error('Smart recommendation returned an invalid response')
  }

  return result.recommendations as FitRecommendation[]
}
