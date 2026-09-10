import type { ScannedSizes, BodyMetrics } from '../types'

export interface SellerSizeEntry {
  label: string
  chest_cm?: [number, number]
  waist_cm?: [number, number]
  hips_cm?: [number, number]
  foot_length_cm?: [number, number]
}

type SubCategory = 'tops' | 'dresses' | 'suits' | 'pants' | 'shoes' | 'accessories'

const SUIT_RE = /\b(suit|blazer set|two.?piece|tracksuit|set|חליפה|סט|סט חליפה)\b/i
const SHIRT_RE = /\b(shirt|t-?shirt|hoodie|sweater|jacket|coat|polo|tank|top|blouse|חולצה|ג'?קט|מעיל|סוודר|בגד עליון)\b/i
const PANTS_RE = /\b(pants|jeans|trousers|shorts|leggings|jogger|מכנסיים|מכנס)\b/i
const DRESS_RE = /\b(dress|gown|frock|שמלה|שמלות)\b/i
const FOOTWEAR_RE = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|slipper|slippers|footwear|pump|pumps|loafer|loafers|wedge|wedges|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i
const DEVICE_RE = /\b(phone|mobile|tablet|ipad|iphone|android|laptop|desktop|computer|watch|case|cover|protector|charger|charging|cable|adapter|strap|band|holder|stand|dock|keyboard|mouse|screen)\b/i

function detectSubCategory(productName: string, category: string): SubCategory {
  const name = productName ?? ''
  if (category === 'shoes' || FOOTWEAR_RE.test(name)) return 'shoes'
  if (category === 'accessories' || DEVICE_RE.test(name)) return 'accessories'
  if (DRESS_RE.test(name)) return 'dresses'
  if (SUIT_RE.test(name)) return 'suits'
  if (PANTS_RE.test(name) && !SHIRT_RE.test(name)) return 'pants'
  if (SHIRT_RE.test(name) && !PANTS_RE.test(name)) return 'tops'
  return 'tops'
}

// AliExpress Asian-size charts use BODY measurements (not garment flat measurements).
// These ranges represent the wearer's actual body circumference per size label.
const ALI_TOPS_SIZES: { label: string; chest: [number, number] }[] = [
  { label: 'S',   chest: [0, 86] },
  { label: 'M',   chest: [87, 92] },
  { label: 'L',   chest: [93, 98] },
  { label: 'XL',  chest: [99, 104] },
  { label: '2XL', chest: [105, 110] },
  { label: '3XL', chest: [111, 999] },
]

const ALI_PANTS_SIZES: { label: string; waist: [number, number] }[] = [
  { label: 'S',   waist: [0, 68] },
  { label: 'M',   waist: [69, 74] },
  { label: 'L',   waist: [75, 80] },
  { label: 'XL',  waist: [81, 86] },
  { label: '2XL', waist: [87, 92] },
  { label: '3XL', waist: [93, 999] },
]

const ALI_SHOE_SIZES: { label: string; footMin: number; footMax: number }[] = [
  { label: '35', footMin: 0,    footMax: 22.0 },
  { label: '36', footMin: 22.1, footMax: 22.7 },
  { label: '37', footMin: 22.8, footMax: 23.4 },
  { label: '38', footMin: 23.5, footMax: 24.0 },
  { label: '39', footMin: 24.1, footMax: 24.7 },
  { label: '40', footMin: 24.8, footMax: 25.3 },
  { label: '41', footMin: 25.4, footMax: 26.0 },
  { label: '42', footMin: 26.1, footMax: 26.7 },
  { label: '43', footMin: 26.8, footMax: 27.3 },
  { label: '44', footMin: 27.4, footMax: 28.0 },
  { label: '45', footMin: 28.1, footMax: 28.7 },
  { label: '46', footMin: 28.8, footMax: 999 },
]

function getMetrics(sizes: ScannedSizes | null): BodyMetrics | null {
  return sizes?.sizing?.bodyMetrics ?? null
}

// EU shoe size → foot length in cm.
// Formula: foot_cm = EU * 2/3 - 1.5  (Paris point system, minus typical insole allowance)
function footLengthCm(shoeSizeEu: string | null): number | null {
  if (!shoeSizeEu) return null
  const eu = parseInt(shoeSizeEu, 10)
  if (isNaN(eu)) return null
  return Math.round((eu * 0.667 - 1.5) * 10) / 10
}

function inRange(value: number, range: [number, number]): boolean {
  return value >= range[0] && value <= range[1]
}

const TOPS_ORDER = ['S', 'M', 'L', 'XL', '2XL', '3XL']

function adjustForFit(baseLabel: string, fit: string | undefined): string {
  if (!fit) return baseLabel
  const lower = fit.toLowerCase()
  const idx = TOPS_ORDER.indexOf(baseLabel)
  if (idx === -1) return baseLabel
  if (lower.includes('slim') || lower.includes('tight') || lower.includes('צמוד')) {
    return TOPS_ORDER[Math.max(0, idx - 1)] ?? baseLabel
  }
  if (lower.includes('loose') || lower.includes('relaxed') || lower.includes('oversize') || lower.includes('רחב') || lower.includes('גדול')) {
    return TOPS_ORDER[Math.min(TOPS_ORDER.length - 1, idx + 1)] ?? baseLabel
  }
  return baseLabel
}

// Estimate body measurements from the user's scanned top/bottom sizes.
// These values represent the wearer's BODY circumference (not the garment's flat measurement).
// Garment measurements are typically 6-10cm larger than body measurements;
// the previous code used garment values, causing every recommendation to be 1-2 sizes too big.
function estimateMetrics(sizes: ScannedSizes): BodyMetrics | null {
  const TOP_BODY_CHEST: Record<string, number> = {
    'XS': 82, 'S': 85, 'M': 89, 'L': 95, 'XL': 101, 'XXL': 107,
  }
  const BOTTOM_BODY_WAIST: Record<string, number> = {
    '36': 64, '38': 67, '40': 71, '42': 74, '44': 78, '46': 82,
    '48': 85, '50': 89, '52': 93, '54': 97, '56': 101, '58': 105, '60': 109,
  }
  const chest = TOP_BODY_CHEST[sizes.sizing.top] ?? null
  const waist = BOTTOM_BODY_WAIST[sizes.sizing.bottom] ?? null
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

function matchTopsByWesternSize(westernSize: string, fit: string | undefined): string | null {
  const WESTERN_TO_ASIAN: Record<string, string> = {
    'XS': 'S', 'S': 'M', 'M': 'L', 'L': 'XL', 'XL': '2XL', 'XXL': '3XL',
  }
  const label = WESTERN_TO_ASIAN[westernSize]
  return label ? adjustForFit(label, fit) : null
}

function matchPantsByEuSize(euSize: string, fit: string | undefined): string | null {
  const EU_TO_ASIAN: Record<string, string> = {
    '36': 'S', '38': 'M', '40': 'L', '42': 'XL', '44': '2XL',
    '46': '3XL', '48': '3XL', '50': '3XL', '52': '3XL',
  }
  const label = EU_TO_ASIAN[euSize]
  return label ? adjustForFit(label, fit) : null
}

function matchShoes(footLength: number): string {
  for (const e of ALI_SHOE_SIZES) {
    if (footLength >= e.footMin && footLength <= e.footMax) return e.label
  }
  return '42'
}

export function calculateRecommendedSize(
  userSizes: ScannedSizes | null,
  sellerMetadata: SellerSizeEntry[] = [],
  category: string = 'clothing',
  productName: string = '',
): string | null {
  if (!userSizes) return null

  const sub = detectSubCategory(productName ?? '', category)
  if (sub === 'accessories') return null

  const fit = userSizes.sizing.fit

  // Shoes: convert EU shoe size → foot length → match against seller chart or AliExpress table
  if (sub === 'shoes') {
    const foot = footLengthCm(userSizes.shoeSize)
    if (foot != null && sellerMetadata.length > 0) {
      const m = sellerMetadata.find((e) => e.foot_length_cm && inRange(foot, e.foot_length_cm))
      if (m) return m.label
    }
    if (foot != null) return matchShoes(foot)
    return userSizes.shoeSize ?? null
  }

  // Always derive body measurements from the scanned size labels.
  // The AI's raw circumference estimates are unreliable (often garment-level, not body-level),
  // which causes the matcher to jump 2-3 sizes too big.
  const metrics = estimateMetrics(userSizes)

  // If seller provides a size chart, match body metrics against it
  if (sellerMetadata.length > 0 && metrics) {
    const chest = metrics.chest_circumference_cm
    const waist = metrics.waist_circumference_cm
    const hips = metrics.hips_circumference_cm
    let best: SellerSizeEntry | null = null
    let bestScore = -1
    for (const e of sellerMetadata) {
      let score = 0, checks = 0
      if (e.chest_cm && chest != null) { checks++; if (inRange(chest, e.chest_cm)) score++ }
      if (e.waist_cm && waist != null) { checks++; if (inRange(waist, e.waist_cm)) score++ }
      if (e.hips_cm && hips != null) { checks++; if (inRange(hips, e.hips_cm)) score++ }
      if (checks === 0) continue
      if (score / checks > bestScore) { bestScore = score / checks; best = e }
    }
    if (best && bestScore > 0) return adjustForFit(best.label, fit)
  }

  const m = metrics

  if (sub === 'pants') {
    const direct = matchPantsByEuSize(userSizes.sizing.bottom, fit)
    if (direct) return direct
    const waist = m?.waist_circumference_cm
    if (waist != null) {
      for (const e of ALI_PANTS_SIZES) {
        if (inRange(waist, e.waist)) return adjustForFit(e.label, fit)
      }
    }
  }

  // Dresses use chest (bust) as primary measurement
  if (sub === 'dresses') {
    const direct = matchTopsByWesternSize(userSizes.sizing.top, fit)
    if (direct) return direct
    const chest = m?.chest_circumference_cm
    if (chest != null) {
      for (const e of ALI_TOPS_SIZES) {
        if (inRange(chest, e.chest)) return adjustForFit(e.label, fit)
      }
    }
  }

  // Suits use chest as primary measurement
  if (sub === 'suits') {
    const direct = matchTopsByWesternSize(userSizes.sizing.top, fit)
    if (direct) return direct
    const chest = m?.chest_circumference_cm
    if (chest != null) {
      for (const e of ALI_TOPS_SIZES) {
        if (inRange(chest, e.chest)) return adjustForFit(e.label, fit)
      }
    }
  }

  // Default tops path: direct Western→Asian mapping first, then chest-based fallback
  const directTop = matchTopsByWesternSize(userSizes.sizing.top, fit)
  if (directTop) return directTop
  const chest = m?.chest_circumference_cm
  if (chest != null) {
    for (const e of ALI_TOPS_SIZES) {
      if (inRange(chest, e.chest)) return adjustForFit(e.label, fit)
    }
  }

  // Last-resort: map Western sizes to Asian sizes (AliExpress tends to run 1-2 sizes small)
  const asianMap: Record<string, string> = {
    'XS': 'S', 'S': 'M', 'M': 'L', 'L': 'XL', 'XL': '2XL', 'XXL': '3XL',
  }
  return adjustForFit(asianMap[userSizes.sizing.top] ?? 'L', fit)
}
