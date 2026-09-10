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
  if (category === 'shoes' || FOOTWEAR_RE.test(productName)) return 'shoes'
  if (category === 'accessories' || DEVICE_RE.test(productName)) return 'accessories'
  if (DRESS_RE.test(productName)) return 'dresses'
  if (SUIT_RE.test(productName)) return 'suits'
  if (PANTS_RE.test(productName) && !SHIRT_RE.test(productName)) return 'pants'
  if (SHIRT_RE.test(productName) && !PANTS_RE.test(productName)) return 'tops'
  return 'tops'
}

interface AliSizeEntry {
  label: string
  chest?: [number, number]
  waist?: [number, number]
}

const ALI_TOPS_SIZES: AliSizeEntry[] = [
  { label: 'M',   chest: [0, 88] },
  { label: 'L',   chest: [89, 93] },
  { label: 'XL',  chest: [94, 98] },
  { label: '2XL', chest: [99, 103] },
  { label: '3XL', chest: [104, 109] },
  { label: '4XL', chest: [110, 999] },
]

const ALI_PANTS_SIZES: AliSizeEntry[] = [
  { label: 'M',   waist: [0, 75] },
  { label: 'L',   waist: [76, 80] },
  { label: 'XL',  waist: [81, 85] },
  { label: '2XL', waist: [86, 90] },
  { label: '3XL', waist: [91, 999] },
]

const ALI_SHOE_SIZES: { label: string; footMin: number; footMax: number }[] = [
  { label: '36',      footMin: 0,    footMax: 23.0 },
  { label: '38',      footMin: 23.1, footMax: 24.0 },
  { label: '40',      footMin: 24.1, footMax: 25.0 },
  { label: '42',      footMin: 25.1, footMax: 26.0 },
  { label: '43',      footMin: 26.1, footMax: 27.0 },
  { label: '45',      footMin: 27.1, footMax: 28.0 },
  { label: '46',      footMin: 28.1, footMax: 999 },
]

function getMetrics(sizes: ScannedSizes | null): BodyMetrics | null {
  return sizes?.sizing?.bodyMetrics ?? null
}

function footLengthCm(shoeSizeEu: string | null): number | null {
  if (!shoeSizeEu) return null
  const eu = parseInt(shoeSizeEu, 10)
  if (isNaN(eu)) return null
  return Math.round((eu * 0.667 + 1.5) * 10) / 10
}

function inRange(value: number, range: [number, number]): boolean {
  return value >= range[0] && value <= range[1]
}

function adjustForFit(baseLabel: string, fit: string | undefined): string {
  if (!fit) return baseLabel
  const lower = fit.toLowerCase()
  const order = ['M', 'L', 'XL', '2XL', '3XL', '4XL']
  const idx = order.indexOf(baseLabel)
  if (idx === -1) return baseLabel
  if (lower.includes('slim') || lower.includes('tight') || lower.includes('צמוד')) {
    return order[Math.max(0, idx - 1)] ?? baseLabel
  }
  if (lower.includes('loose') || lower.includes('relaxed') || lower.includes('oversize') || lower.includes('רחב') || lower.includes('גדול')) {
    return order[Math.min(order.length - 1, idx + 1)] ?? baseLabel
  }
  return baseLabel
}

function estimateMetrics(sizes: ScannedSizes): BodyMetrics | null {
  const TOP_CHEST: Record<string, number> = { 'XS': 84, 'S': 92, 'M': 100, 'L': 108, 'XL': 116, 'XXL': 124 }
  const BOTTOM_WAIST: Record<string, number> = { '36': 68, '38': 72, '40': 76, '42': 80, '44': 84, '46': 88, '48': 92, '50': 96, '52': 100, '54': 104, '56': 108, '58': 112, '60': 116 }
  const chest = TOP_CHEST[sizes.sizing.top] ?? null
  const waist = BOTTOM_WAIST[sizes.sizing.bottom] ?? null
  if (chest == null && waist == null) return null
  return { estimated_height_cm: null, estimated_weight_kg: null, chest_circumference_cm: chest, waist_circumference_cm: waist, hips_circumference_cm: chest != null ? chest - 4 : null, shoulder_width_cm: null }
}

function matchTops(chest: number, fit: string | undefined): string {
  for (const e of ALI_TOPS_SIZES) {
    if (e.chest && inRange(chest, e.chest)) return adjustForFit(e.label, fit)
  }
  return 'L'
}

function matchPants(waist: number, fit: string | undefined): string {
  for (const e of ALI_PANTS_SIZES) {
    if (e.waist && inRange(waist, e.waist)) return adjustForFit(e.label, fit)
  }
  return 'L'
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

  const sub = detectSubCategory(productName, category)
  if (sub === 'accessories') return null

  const metrics = getMetrics(userSizes)
  const fit = userSizes.sizing.fit

  if (sub === 'shoes') {
    const foot = footLengthCm(userSizes.shoeSize)
    if (foot != null && sellerMetadata.length > 0) {
      const m = sellerMetadata.find((e) => e.foot_length_cm && inRange(foot, e.foot_length_cm))
      if (m) return m.label
    }
    if (foot != null) return matchShoes(foot)
    return userSizes.shoeSize ?? null
  }

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

  const m = metrics ?? estimateMetrics(userSizes)

  if (sub === 'pants') {
    const waist = m?.waist_circumference_cm
    if (waist != null) return matchPants(waist, fit)
  }

  const chest = m?.chest_circumference_cm
  if (chest != null) return matchTops(chest, fit)

  const asianMap: Record<string, string> = { 'XS': 'M', 'S': 'L', 'M': 'XL', 'L': '2XL', 'XL': '3XL', 'XXL': '4XL' }
  return adjustForFit(asianMap[userSizes.sizing.top] ?? 'L', fit)
}
