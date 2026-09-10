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
  source: 'seller_chart' | 'body_metrics' | 'asian_conversion' | 'fallback'
}

// ── Standard garment size charts (cm) ────────────────────────────────────
// These represent typical industry measurements for each size label.
// Used when the seller doesn't provide a size chart — we match the user's
// body measurements against these standard ranges.

interface StandardSizeEntry {
  label: string
  chest: [number, number]
  waist: [number, number]
  hips: [number, number]
}

const STANDARD_CLOTHING_SIZES: StandardSizeEntry[] = [
  { label: 'XS',  chest: [80, 86],  waist: [64, 70],  hips: [86, 92] },
  { label: 'S',   chest: [86, 94],  waist: [70, 78],  hips: [92, 98] },
  { label: 'M',   chest: [94, 102], waist: [78, 86],  hips: [98, 106] },
  { label: 'L',   chest: [102, 110], waist: [86, 94], hips: [106, 114] },
  { label: 'XL',  chest: [110, 118], waist: [94, 102], hips: [114, 122] },
  { label: 'XXL', chest: [118, 128], waist: [102, 110], hips: [122, 130] },
  { label: '3XL', chest: [128, 138], waist: [110, 120], hips: [130, 140] },
  { label: '4XL', chest: [138, 148], waist: [120, 130], hips: [140, 150] },
]

// Asian sizes run ~1 size smaller than Western — a Western S fits like an Asian M
const ASIAN_SIZE_MAP: Record<string, string> = {
  'XS': 'M', 'S': 'L', 'M': 'XL', 'L': 'XXL', 'XL': '3XL', 'XXL': '4XL',
}

// ── Standard shoe size chart (foot length cm → EU size) ─────────────────────
const SHOE_SIZE_TABLE: { eu: number; footLengthMin: number; footLengthMax: number }[] = [
  { eu: 35, footLengthMin: 21.6, footLengthMax: 22.3 },
  { eu: 36, footLengthMin: 22.3, footLengthMax: 23.0 },
  { eu: 37, footLengthMin: 23.0, footLengthMax: 23.7 },
  { eu: 38, footLengthMin: 23.7, footLengthMax: 24.4 },
  { eu: 39, footLengthMin: 24.4, footLengthMax: 25.1 },
  { eu: 40, footLengthMin: 25.1, footLengthMax: 25.8 },
  { eu: 41, footLengthMin: 25.8, footLengthMax: 26.5 },
  { eu: 42, footLengthMin: 26.5, footLengthMax: 27.2 },
  { eu: 43, footLengthMin: 27.2, footLengthMax: 27.9 },
  { eu: 44, footLengthMin: 27.9, footLengthMax: 28.6 },
  { eu: 45, footLengthMin: 28.6, footLengthMax: 29.3 },
  { eu: 46, footLengthMin: 29.3, footLengthMax: 30.0 },
  { eu: 47, footLengthMin: 30.0, footLengthMax: 30.7 },
]

// ── Helpers ────────────────────────────────────────────────────────────────

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

// Fit preference adjustments: slim fit → pick smaller size, loose → pick larger
function adjustForFit(baseLabel: string, fitPreference: string | undefined): string {
  if (!fitPreference) return baseLabel
  const labels = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']
  const idx = labels.indexOf(baseLabel)
  if (idx === -1) return baseLabel

  const lower = fitPreference.toLowerCase()
  if (lower.includes('slim') || lower.includes('tight') || lower.includes('צמוד')) {
    return labels[Math.max(0, idx - 1)] ?? baseLabel
  }
  if (lower.includes('loose') || lower.includes('oversize') || lower.includes('רחב') || lower.includes('גדול')) {
    return labels[Math.min(labels.length - 1, idx + 1)] ?? baseLabel
  }
  return baseLabel
}

// Match body metrics against standard size chart, scoring by how many measurements fall in range
function matchBodyMetricsToStandard(
  metrics: BodyMetrics,
  fitPreference: string | undefined,
): SizeMatchResult {
  const chest = metrics.chest_circumference_cm
  const waist = metrics.waist_circumference_cm
  const hips = metrics.hips_circumference_cm

  let bestEntry: StandardSizeEntry | null = null
  let bestScore = -1
  let bestReason = ''

  for (const entry of STANDARD_CLOTHING_SIZES) {
    let score = 0
    let totalChecks = 0
    const reasons: string[] = []

    if (chest != null) {
      totalChecks++
      if (inRange(chest, entry.chest)) {
        score++
        reasons.push(`היקף חזה ${chest} ס"מ מתאים למידה ${entry.label} (${formatRange(entry.chest)} ס"מ)`)
      }
    }
    if (waist != null) {
      totalChecks++
      if (inRange(waist, entry.waist)) {
        score++
        if (reasons.length === 0) reasons.push(`היקף מותן ${waist} ס"מ מתאים למידה ${entry.label} (${formatRange(entry.waist)} ס"מ)`)
      }
    }
    if (hips != null) {
      totalChecks++
      if (inRange(hips, entry.hips)) {
        score++
        if (reasons.length === 0) reasons.push(`היקף ירכיים ${hips} ס"מ מתאים למידה ${entry.label} (${formatRange(entry.hips)} ס"מ)`)
      }
    }

    if (totalChecks === 0) continue

    // Bonus: if measurement is close to range boundary (within 2cm), give partial credit
    let partialBonus = 0
    if (chest != null && !inRange(chest, entry.chest)) {
      const dist = Math.min(Math.abs(chest - entry.chest[0]), Math.abs(chest - entry.chest[1]))
      if (dist <= 2) partialBonus += 0.5
    }
    if (waist != null && !inRange(waist, entry.waist)) {
      const dist = Math.min(Math.abs(waist - entry.waist[0]), Math.abs(waist - entry.waist[1]))
      if (dist <= 2) partialBonus += 0.5
    }

    const ratio = (score + partialBonus) / totalChecks
    if (ratio > bestScore) {
      bestScore = ratio
      bestEntry = entry
      bestReason = reasons[0] ?? ''
    }
  }

  if (bestEntry && bestScore > 0) {
    // Apply fit preference adjustment
    const adjustedLabel = adjustForFit(bestEntry.label, fitPreference)
    const fitNote = adjustedLabel !== bestEntry.label
      ? ` (מותאם להעדפת פיט ${fitPreference}: ${adjustedLabel})`
      : ''
    return {
      sizeLabel: adjustedLabel,
      reason: bestReason + fitNote,
      confidence: Math.min(0.9, 0.55 + bestScore * 0.35),
      source: 'body_metrics',
    }
  }

  // Fallback: use registration sizes with Asian conversion
  return { ...asianConversionFallback(null, null) }
}

// Asian size conversion fallback when no body metrics available
function asianConversionFallback(
  userSizes: ScannedSizes | null,
  fitPreference: string | undefined,
): SizeMatchResult {
  if (!userSizes) {
    return {
      sizeLabel: 'M',
      reason: 'לא נמצאו מידות גוף — מומלץ מידה M כברירת מחדל',
      confidence: 0.3,
      source: 'fallback',
    }
  }
  const userTop = userSizes.sizing.top
  const asianSize = ASIAN_SIZE_MAP[userTop] ?? userTop
  const adjusted = adjustForFit(asianSize, fitPreference)
  return {
    sizeLabel: adjusted,
    reason: `אין טבלת מידות בס"מ מהמוכר — הומר מידה ${userTop} למידה אסייתית ${adjusted}`,
    confidence: 0.65,
    source: 'asian_conversion',
  }
}

// Match foot length against standard shoe size chart
function matchShoeSizeByFootLength(footLengthCm: number | null, shoeSizeEu: string | null): SizeMatchResult | null {
  if (footLengthCm != null) {
    const match = SHOE_SIZE_TABLE.find((e) => footLengthCm >= e.footLengthMin && footLengthCm < e.footLengthMax)
    if (match) {
      return {
        sizeLabel: `EU ${match.eu}`,
        reason: `אורך כף רגל ${footLengthCm} ס"מ מתאים למידה EU ${match.eu} לפי טבלת מידות סטנדרטית`,
        confidence: 0.82,
        source: 'body_metrics',
      }
    }
  }
  if (shoeSizeEu) {
    return {
      sizeLabel: `EU ${shoeSizeEu}`,
      reason: `מידת נעל מומלצת EU ${shoeSizeEu} לפי סריקת AI`,
      confidence: 0.8,
      source: 'fallback',
    }
  }
  return null
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getRecommendedSize(
  userSizes: ScannedSizes | null,
  sellerSizeChart: SellerSizeEntry[],
  category: string = 'clothing',
): SizeMatchResult | null {
  if (!userSizes) return null
  if (category === 'accessories') return null

  const metrics = getUserMetrics(userSizes)
  const fitPreference = userSizes.sizing.fit

  // ── Shoes ─────────────────────────────────────────────────────────────────
  if (category === 'shoes') {
    const footLength = getFootLengthCm(userSizes.shoeSize)

    // 1. Try seller's size chart with foot length
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

    // 2. Try standard shoe size chart with foot length
    const standardMatch = matchShoeSizeByFootLength(footLength, userSizes.shoeSize)
    if (standardMatch) return standardMatch

    return null
  }

  // ── Clothing ──────────────────────────────────────────────────────────────

  // 1. Try seller's size chart with body metrics
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

      if (entry.chest_cm && chest != null) {
        totalChecks++
        if (inRange(chest, entry.chest_cm)) {
          score++
          reasons.push(`היקף חזה ${chest} ס"מ מותאם לטווח ${formatRange(entry.chest_cm)} ס"מ של המוכר`)
        }
      }
      if (entry.waist_cm && waist != null) {
        totalChecks++
        if (inRange(waist, entry.waist_cm)) {
          score++
          if (reasons.length === 0) reasons.push(`היקף מותן ${waist} ס"מ מותאם לטווח ${formatRange(entry.waist_cm)} ס"מ של המוכר`)
        }
      }
      if (entry.hips_cm && hips != null) {
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
      const adjustedLabel = adjustForFit(bestMatch.label, fitPreference)
      const fitNote = adjustedLabel !== bestMatch.label
        ? ` (מותאם להעדפת פיט ${fitPreference}: ${adjustedLabel})`
        : ''
      return {
        sizeLabel: adjustedLabel,
        reason: matchReason + fitNote,
        confidence: Math.min(0.99, 0.7 + bestScore * 0.3),
        source: 'seller_chart',
      }
    }
  }

  // 2. No seller chart — use body metrics against standard size chart
  if (metrics) {
    return matchBodyMetricsToStandard(metrics, fitPreference)
  }

  // 3. No body metrics — use registration sizes with Asian conversion
  return asianConversionFallback(userSizes, fitPreference)
}
