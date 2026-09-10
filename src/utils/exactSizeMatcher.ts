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

// ── AliExpress sub-category detection ─────────────────────────────────────
// AliExpress Asian sizes run 1-2 sizes smaller than Western sizes.
// We detect the sub-category from the product name to apply the right chart.

export type SubCategory = 'tops' | 'dresses' | 'suits' | 'pants' | 'shoes' | 'accessories'

const SUIT_RE = /\b(suit|blazer set|two.?piece|tracksuit|set|חליפה|סט|סט חליפה)\b/i
const SHIRT_RE = /\b(shirt|t-?shirt|hoodie|sweater|jacket|coat|polo|tank|top|blouse|חולצה|ג'?קט|מעיל|סוודר|בגד עליון)\b/i
const PANTS_RE = /\b(pants|jeans|trousers|shorts|leggings|jogger|מכנסיים|מכנס)\b/i
const DRESS_RE = /\b(dress|gown|frock|שמלה|שמלות)\b/i
const FOOTWEAR_RE = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|slipper|slippers|footwear|pump|pumps|loafer|loafers|wedge|wedges|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i
const DEVICE_RE = /\b(phone|mobile|tablet|ipad|iphone|android|laptop|desktop|computer|watch|case|cover|protector|charger|charging|cable|adapter|strap|band|holder|stand|dock|keyboard|mouse|screen)\b/i

export function detectSubCategory(productName: string, category: string): SubCategory {
  if (category === 'shoes' || FOOTWEAR_RE.test(productName)) return 'shoes'
  if (category === 'accessories' || DEVICE_RE.test(productName)) return 'accessories'
  if (DRESS_RE.test(productName)) return 'dresses'
  if (SUIT_RE.test(productName)) return 'suits'
  if (PANTS_RE.test(productName) && !SHIRT_RE.test(productName)) return 'pants'
  if (SHIRT_RE.test(productName) && !PANTS_RE.test(productName)) return 'tops'
  // Default: treat as tops for size recommendation
  return 'tops'
}

// ── AliExpress fallback size charts (cm) ──────────────────────────────────
// These ranges are specifically calibrated for AliExpress Asian sizing,
// which runs 1-2 sizes smaller than Western/European sizes.

interface AliSizeEntry {
  label: string
  chest?: [number, number]
  waist?: [number, number]
  hips?: [number, number]
}

// Tops / suits / dresses — matched by chest circumference
const ALI_TOPS_SIZES: AliSizeEntry[] = [
  { label: 'M',   chest: [0, 88] },
  { label: 'L',   chest: [89, 93] },
  { label: 'XL',  chest: [94, 98] },
  { label: '2XL', chest: [99, 103] },
  { label: '3XL', chest: [104, 109] },
  { label: '4XL', chest: [110, 999] },
]

// Pants / jeans — matched by waist circumference
const ALI_PANTS_SIZES: AliSizeEntry[] = [
  { label: 'M (29-30)',   waist: [0, 75] },
  { label: 'L (31-32)',   waist: [76, 80] },
  { label: 'XL (33-34)',  waist: [81, 85] },
  { label: '2XL (35-36)', waist: [86, 90] },
  { label: '3XL (37+)',   waist: [91, 999] },
]

// Shoes — matched by foot length cm
const ALI_SHOE_SIZES: { label: string; footMin: number; footMax: number }[] = [
  { label: '36 (230)',     footMin: 0,    footMax: 23.0 },
  { label: '38 (240)',     footMin: 23.1, footMax: 24.0 },
  { label: '39/40 (250)',  footMin: 24.1, footMax: 25.0 },
  { label: '41/42 (260)',  footMin: 25.1, footMax: 26.0 },
  { label: '43 (270)',     footMin: 26.1, footMax: 27.0 },
  { label: '44/45 (280)',  footMin: 27.1, footMax: 28.0 },
  { label: '46+ (290)',    footMin: 28.1, footMax: 999 },
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

// Fit preference adjustments: slim → smaller, loose → larger
function adjustForFit(baseLabel: string, fitPreference: string | undefined): string {
  if (!fitPreference) return baseLabel
  const lower = fitPreference.toLowerCase()
  if (lower.includes('slim') || lower.includes('tight') || lower.includes('צמוד')) {
    // Go one size down — e.g. "XL" → "L", "2XL (35-36)" → "XL (33-34)"
    if (baseLabel.startsWith('4XL')) return '3XL'
    if (baseLabel.startsWith('3XL')) return '2XL'
    if (baseLabel.startsWith('2XL')) return 'XL'
    if (baseLabel.startsWith('XL')) return 'L'
    if (baseLabel === 'L') return 'M'
    // For pants with sizes like "L (31-32)", strip the label part
    const pantsMatch = baseLabel.match(/^([A-Z]+)\s*\(/)
    if (pantsMatch) {
      const sz = pantsMatch[1]
      const downMap: Record<string, string> = { '3XL': '2XL', '2XL': 'XL', 'XL': 'L', 'L': 'M' }
      return downMap[sz] ? `${downMap[sz]} (...)` : baseLabel
    }
  }
  if (lower.includes('loose') || lower.includes('relaxed') || lower.includes('oversize') || lower.includes('רחב') || lower.includes('גדול')) {
    if (baseLabel === 'M') return 'L'
    if (baseLabel === 'L') return 'XL'
    if (baseLabel.startsWith('XL') && !baseLabel.startsWith('2XL') && !baseLabel.startsWith('3XL')) return '2XL'
    if (baseLabel.startsWith('2XL')) return '3XL'
    if (baseLabel.startsWith('3XL')) return '4XL'
  }
  return baseLabel
}

// Estimate body metrics from registration sizes when AI scan metrics are missing
function estimateMetricsFromSizes(sizes: ScannedSizes): BodyMetrics | null {
  const top = sizes.sizing.top
  const bottom = sizes.sizing.bottom
  if (!top && !bottom) return null

  // Rough chest estimate from top size
  const TOP_CHEST: Record<string, number> = {
    'XS': 84, 'S': 92, 'M': 100, 'L': 108, 'XL': 116, 'XXL': 124,
  }
  // Rough waist estimate from EU pants size
  const BOTTOM_WAIST: Record<string, number> = {
    '36': 68, '38': 72, '40': 76, '42': 80, '44': 84, '46': 88,
    '48': 92, '50': 96, '52': 100, '54': 104, '56': 108, '58': 112, '60': 116,
  }

  const chest = TOP_CHEST[top] ?? null
  const waist = BOTTOM_WAIST[bottom] ?? null

  if (chest == null && waist == null) return null

  return {
    estimated_height_cm: null,
    estimated_weight_kg: null,
    chest_circumference_cm: chest,
    waist_circumference_cm: waist,
    hips_circumference_cm: chest != null ? chest - 4 : null,
    shoulder_width_cm: null,
  }
}

// ── AliExpress fallback: match body metrics against AliExpress chart ──────

function matchAliTops(chest: number, fitPreference: string | undefined): SizeMatchResult {
  for (const entry of ALI_TOPS_SIZES) {
    if (entry.chest && inRange(chest, entry.chest)) {
      const adjusted = adjustForFit(entry.label, fitPreference)
      const fitNote = adjusted !== entry.label ? ` (מותאם להעדפת פיט ${fitPreference}: ${adjusted})` : ''
      return {
        sizeLabel: adjusted,
        reason: `היקף חזה ${chest} ס"מ — מומלץ מידה ${entry.label} ב-AliExpress${fitNote}`,
        confidence: 0.78,
        source: 'body_metrics',
      }
    }
  }
  return { sizeLabel: 'L', reason: `היקף חזה ${chest} ס"מ — מומלץ מידה L כברירת מחדל`, confidence: 0.5, source: 'fallback' }
}

function matchAliPants(waist: number, fitPreference: string | undefined): SizeMatchResult {
  for (const entry of ALI_PANTS_SIZES) {
    if (entry.waist && inRange(waist, entry.waist)) {
      const adjusted = adjustForFit(entry.label, fitPreference)
      const fitNote = adjusted !== entry.label ? ` (מותאם להעדפת פיט ${fitPreference}: ${adjusted})` : ''
      return {
        sizeLabel: adjusted,
        reason: `היקף מותניים ${waist} ס"מ — מומלץ מידה ${entry.label} ב-AliExpress${fitNote}`,
        confidence: 0.78,
        source: 'body_metrics',
      }
    }
  }
  return { sizeLabel: 'L (31-32)', reason: `היקף מותניים ${waist} ס"מ — מומלץ מידה L כברירת מחדל`, confidence: 0.5, source: 'fallback' }
}

function matchAliShoes(footLength: number): SizeMatchResult {
  for (const entry of ALI_SHOE_SIZES) {
    if (footLength >= entry.footMin && footLength <= entry.footMax) {
      return {
        sizeLabel: entry.label,
        reason: `אורך כף רגל ${footLength} ס"מ — מומלץ מידה ${entry.label} ב-AliExpress`,
        confidence: 0.82,
        source: 'body_metrics',
      }
    }
  }
  return { sizeLabel: '41/42 (260)', reason: `אורך כף רגל ${footLength} ס"מ — מומלץ מידה 41/42 כברירת מחדל`, confidence: 0.5, source: 'fallback' }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getRecommendedSize(
  userSizes: ScannedSizes | null,
  sellerSizeChart: SellerSizeEntry[],
  category: string = 'clothing',
  productName: string = '',
): SizeMatchResult | null {
  if (!userSizes) return null

  const subCategory = detectSubCategory(productName, category)
  if (subCategory === 'accessories') return null

  const metrics = getUserMetrics(userSizes)
  const fitPreference = userSizes.sizing.fit

  // ── Shoes ─────────────────────────────────────────────────────────────────
  if (subCategory === 'shoes') {
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

    // 2. AliExpress shoe fallback by foot length
    if (footLength != null) {
      return matchAliShoes(footLength)
    }

    // 3. Just return the EU shoe size from scan
    if (userSizes.shoeSize) {
      return {
        sizeLabel: `EU ${userSizes.shoeSize}`,
        reason: `מידת נעל מומלצת EU ${userSizes.shoeSize} לפי סריקת AI`,
        confidence: 0.7,
        source: 'fallback',
      }
    }
    return null
  }

  // ── Clothing (tops, pants, dresses, suits) ────────────────────────────────

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

  // 2. No seller chart — use AliExpress fallback matrix with body metrics
  //    If no AI body metrics, estimate from registration sizes
  const effectiveMetrics = metrics ?? estimateMetricsFromSizes(userSizes)

  if (subCategory === 'pants') {
    const waist = effectiveMetrics?.waist_circumference_cm
    if (waist != null) return matchAliPants(waist, fitPreference)
  }

  // tops, dresses, suits — all matched by chest
  const chest = effectiveMetrics?.chest_circumference_cm
  if (chest != null) return matchAliTops(chest, fitPreference)

  // 3. No metrics at all — use registration top size with Asian upsize
  const userTop = userSizes.sizing.top
  const asianMap: Record<string, string> = { 'XS': 'M', 'S': 'L', 'M': 'XL', 'L': '2XL', 'XL': '3XL', 'XXL': '4XL' }
  const asianSize = asianMap[userTop] ?? 'L'
  const adjusted = adjustForFit(asianSize, fitPreference)
  return {
    sizeLabel: adjusted,
    reason: `אין טבלת מידות מהמוכר — הומר מידה ${userTop} למידה אסייתית ${adjusted} (מידות AliExpress קטנות ב-1-2 מידות)`,
    confidence: 0.65,
    source: 'asian_conversion',
  }
}
