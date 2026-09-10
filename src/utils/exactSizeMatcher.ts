import type { ScannedSizes, BodyMetrics } from '../types'

export interface SellerSizeEntry {
  label: string
  chest_cm?: [number, number]
  waist_cm?: [number, number]
  hips_cm?: [number, number]
  foot_length_cm?: [number, number]
}

export interface SizeMatchResult {
  sizeLabel: string
  reason: string
  confidence: number
  source: 'seller_chart' | 'asian_conversion' | 'fallback'
}

function getUserMetrics(scannedSizes: ScannedSizes | null): BodyMetrics | null {
  return scannedSizes?.sizing?.bodyMetrics ?? null
}

function getFootLengthCm(shoeSizeEu: string | null): number | null {
  if (!shoeSizeEu) return null
  const eu = parseInt(shoeSizeEu, 10)
  if (isNaN(eu)) return null
  return Math.round((eu * 0.667 + 1.5) * 10) / 10
}

function inRange(value: number, range: [number, number]): boolean {
  return value >= range[0] && value <= range[1]
}

function formatRange(range: [number, number]): string {
  return `${range[0]}-${range[1]}`
}

export function getRecommendedSize(
  userSizes: ScannedSizes | null,
  sellerSizeChart: SellerSizeEntry[],
  category: string = 'clothing',
): SizeMatchResult | null {
  if (!userSizes) return null

  if (category === 'accessories') return null

  const metrics = getUserMetrics(userSizes)

  if (category === 'shoes') {
    const footLength = getFootLengthCm(userSizes.shoeSize)
    if (footLength != null && sellerSizeChart.length > 0) {
      const match = sellerSizeChart.find((e) => e.foot_length_cm && inRange(footLength, e.foot_length_cm))
      if (match) {
        return {
          sizeLabel: match.label,
          reason: `אורך כף רגל ${footLength} ס"מ מותאם לטווח ${formatRange(match.foot_length_cm!)} ס"מ של המוכר`,
          confidence: 0.95,
          source: 'seller_chart',
        }
      }
    }
    if (userSizes.shoeSize) {
      return {
        sizeLabel: `EU ${userSizes.shoeSize}`,
        reason: `מידת נעל מומלצת EU ${userSizes.shoeSize} לפי סריקת AI`,
        confidence: 0.8,
        source: 'fallback',
      }
    }
    return null
  }

  if (sellerSizeChart.length > 0 && metrics) {
    const chest = metrics.chest_circumference_cm
    const waist = metrics.waist_circumference_cm
    const hips = metrics.hips_circumference_cm

    let bestMatch: SellerSizeEntry | null = null
    let bestScore = -1
    let matchReason = ''

    for (const entry of sellerSizeChart) {
      let score = 0
      let totalChecks = 0
      const reasons: string[] = []

      if (entry.chest_cm) {
        totalChecks++
        if (inRange(chest, entry.chest_cm)) {
          score++
          reasons.push(`היקף חזה ${chest} ס"מ מותאם לטווח ${formatRange(entry.chest_cm)} ס"מ של המוכר`)
        }
      }
      if (entry.waist_cm) {
        totalChecks++
        if (inRange(waist, entry.waist_cm)) {
          score++
          if (reasons.length === 0) reasons.push(`היקף מותן ${waist} ס"מ מותאם לטווח ${formatRange(entry.waist_cm)} ס"מ של המוכר`)
        }
      }
      if (entry.hips_cm) {
        totalChecks++
        if (inRange(hips, entry.hips_cm)) {
          score++
          if (reasons.length === 0) reasons.push(`היקף ירכיים ${hips} ס"מ מותאם לטווח ${formatRange(entry.hips_cm)} ס"מ של המוכר`)
        }
      }

      if (totalChecks === 0) continue
      const ratio = score / totalChecks
      if (ratio > bestScore) {
        bestScore = ratio
        bestMatch = entry
        matchReason = reasons[0] ?? ''
      }
    }

    if (bestMatch && bestScore > 0) {
      return {
        sizeLabel: bestMatch.label,
        reason: matchReason,
        confidence: Math.min(0.99, 0.7 + bestScore * 0.3),
        source: 'seller_chart',
      }
    }
  }

  if (metrics) {
    const asianMap: Record<string, string> = { 'XS': 'M', 'S': 'L', 'M': 'XL', 'L': 'XXL', 'XL': '3XL', 'XXL': '4XL' }
    const userTop = userSizes.sizing.top
    const asianSize = asianMap[userTop] ?? userTop
    return {
      sizeLabel: asianSize,
      reason: `אין טבלת מידות בס"מ מהמוכר — הומר מידה ${userTop} למידה אסייתית ${asianSize}`,
      confidence: 0.65,
      source: 'asian_conversion',
    }
  }

  return {
    sizeLabel: userSizes.sizing.top,
    reason: `המלצה לפי סריקת AI: חולצה ${userSizes.sizing.top}`,
    confidence: 0.5,
    source: 'fallback',
  }
}
