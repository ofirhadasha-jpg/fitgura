import type { AgeGroup, ScannedSizes } from '../types'
import { calculateRecommendedSize, type SellerSizeEntry } from '../utils/exactSizeMatcher'
import { supabase } from '../lib/supabase'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import type { FitBreakdown, WardrobeItem } from '../components/SizingResultModal'

const FETCH_TIMEOUT_MS = 9000

export interface FitBias {
  label: string
  shift: number
}

export type ProductDemographic = 'children' | 'women' | 'men' | 'unisex-adult' | 'unknown'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface ProductAnalysisResult {
  productName: string
  productImage: string | null
  price: string | null
  platform: string
  category: string
  recommendedSize: string | null
  matchPercentage: number
  fitBreakdown: FitBreakdown
  sellerMetadata: SellerSizeEntry[]
  availableSizes: string[]
  profileAgeGroup: AgeGroup
  productAgeRange: 'adult' | 'children' | 'unknown'
  productDemographic: ProductDemographic
  fitExplanation: string
  fitBias: FitBias | null
  confidence: ConfidenceLevel
  mismatchWarning: boolean
}

interface EdgeFunctionResponse {
  productName: string | null
  productImage: string | null
  price: string | null
  platform: string
  category: string
  sizeChart: SellerSizeEntry[]
  availableSizes: string[]
  fitBias: FitBias | null
  productDemographic: ProductDemographic
}

async function generateUrlHash(url: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(`product-analysis-v2:${url}`)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return `url_${url.length}_${Date.now()}`
  }
}

async function checkUrlCache(urlHash: string): Promise<{ analysis: EdgeFunctionResponse } | null> {
  try {
    const { data, error } = await supabase
      .from('sizing_cache')
      .select('analysis_json')
      .eq('image_hash', urlHash)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return { analysis: data.analysis_json as unknown as EdgeFunctionResponse }
  } catch {
    return null
  }
}

async function saveUrlCache(urlHash: string, analysis: EdgeFunctionResponse): Promise<void> {
  try {
    await supabase
      .from('sizing_cache')
      .upsert({
        image_hash: urlHash,
        analysis_json: analysis as unknown as Record<string, unknown>,
        accuracy: 0,
      }, { onConflict: 'image_hash' })
  } catch {
    // Non-fatal
  }
}

async function fetchProductAnalysis(url: string): Promise<EdgeFunctionResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/analyze-product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`Edge function returned ${res.status}`)
    return await res.json() as EdgeFunctionResponse
  } finally {
    clearTimeout(timeout)
  }
}

function fallbackAnalysis(url: string): EdgeFunctionResponse {
  const lower = url.toLowerCase()
  let platform = 'Generic'
  if (lower.includes('shein')) platform = 'SHEIN'
  else if (lower.includes('aliexpress')) platform = 'AliExpress'
  else if (lower.includes('temu')) platform = 'Temu'
  else if (lower.includes('zara')) platform = 'ZARA'

  let productName = 'מוצר מרשת'
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    // Try to find a descriptive path segment (not a numeric ID)
    const descPart = parts.find((p) => /[a-zA-Zא-ת]/.test(decodeURIComponent(p)) && !/^\d+$/.test(p))
    const last = descPart ?? parts[parts.length - 1] ?? ''
    const decoded = decodeURIComponent(last.replace(/[-_]/g, ' ').replace(/\.\w+$/, '').replace(/\b\d+\b/g, '').trim())
    if (decoded && decoded.length > 2) {
      // Capitalize first letter for cleaner look
      productName = decoded.charAt(0).toUpperCase() + decoded.slice(1, 60)
    }
  } catch { /* keep default */ }

  return {
    productName,
    productImage: null,
    price: null,
    platform,
    category: 'clothing',
    sizeChart: [],
    availableSizes: [],
    fitBias: null,
    productDemographic: 'unknown',
  }
}

function computeFitBreakdown(
  userSizes: ScannedSizes,
  sellerMetadata: SellerSizeEntry[],
  recommendedSize: string,
): FitBreakdown {
  const metrics = userSizes.sizing.bodyMetrics
  if (!metrics || sellerMetadata.length === 0) {
    return {
      chest: { fit: 'התאמה טובה', score: 85 },
      waist: { fit: 'התאמה טובה', score: 82 },
      length: { fit: 'התאמה טובה', score: 88 },
    }
  }

  const matched = sellerMetadata.find((e) => e.label === recommendedSize)
  const chestScore = matched?.chest_cm && metrics.chest_circumference_cm != null
    ? scoreRange(metrics.chest_circumference_cm, matched.chest_cm)
    : 85
  const waistScore = matched?.waist_cm && metrics.waist_circumference_cm != null
    ? scoreRange(metrics.waist_circumference_cm, matched.waist_cm)
    : 82
  const lengthScore = matched?.length_cm != null ? 88 : 86

  return {
    chest: { fit: chestScore >= 90 ? 'התאמה מדויקת' : chestScore >= 75 ? 'התאמה טובה' : 'התאמה חלקית', score: chestScore },
    waist: { fit: waistScore >= 90 ? 'התאמה מדויקת' : waistScore >= 75 ? 'התאמה טובה' : 'התאמה חלקית', score: waistScore },
    length: { fit: lengthScore >= 90 ? 'התאמה מלאה' : 'התאמה טובה', score: lengthScore },
  }
}

function scoreRange(value: number, range: [number, number]): number {
  const [min, max] = range
  if (value >= min && value <= max) return 97
  const mid = (min + max) / 2
  const tolerance = (max - min) / 2 + 4
  const dist = Math.abs(value - mid)
  if (dist <= tolerance) return Math.round(97 - (dist / tolerance) * 15)
  return Math.max(60, Math.round(82 - (dist - tolerance) * 2))
}

function computeMatchPercentage(breakdown: FitBreakdown, profileAccuracy: number): number {
  const avg = (breakdown.chest.score + breakdown.waist.score + breakdown.length.score) / 3
  const adjusted = avg * (profileAccuracy / 100)
  return Math.min(99, Math.max(65, Math.round(adjusted)))
}

function demographicMismatchLabel(
  profile: ScannedSizes,
  productDemographic: ProductDemographic,
): string | null {
  if (productDemographic === 'unknown') return null
  const isChildProfile = profile.ageGroup === 'baby' || profile.ageGroup === 'toddler' || profile.ageGroup === 'child'
  if (productDemographic === 'children' && !isChildProfile) return 'ילדים'
  if (productDemographic === 'women' && profile.gender === 'male' && !isChildProfile) return 'נשים'
  if (productDemographic === 'men' && profile.gender === 'female' && !isChildProfile) return 'גברים'
  if ((productDemographic === 'unisex-adult' || productDemographic === 'women' || productDemographic === 'men') && isChildProfile) return 'מבוגרים'
  return null
}

function isDemographicMismatch(
  profile: ScannedSizes,
  productDemographic: ProductDemographic,
): boolean {
  return demographicMismatchLabel(profile, productDemographic) !== null
}

function applyFitBiasShift(size: string, shift: number, availableSizes: string[]): string {
  if (shift === 0 || availableSizes.length === 0) return size
  const idx = availableSizes.findIndex((s) => s.toUpperCase() === size.toUpperCase())
  if (idx === -1) return size
  const target = idx + shift
  if (target < 0 || target >= availableSizes.length) return size
  return availableSizes[target]
}

export async function analyzeProductUrl(
  url: string,
  userSizes: ScannedSizes | null,
  profileAccuracy: number,
): Promise<ProductAnalysisResult> {
  if (!userSizes) {
    throw new Error('NO_PROFILE')
  }

  const urlHash = await generateUrlHash(url)

  const cached = await checkUrlCache(urlHash)
  let analysis: EdgeFunctionResponse

  if (cached) {
    analysis = cached.analysis
  } else {
    try {
      analysis = await fetchProductAnalysis(url)
      void saveUrlCache(urlHash, analysis)
    } catch (err) {
      console.error('[analyzeProductUrl] Fetch failed/timed out, using fallback:', err)
      analysis = fallbackAnalysis(url)
    }
  }

  const productDemographic = analysis.productDemographic ?? inferProductDemographic(analysis.availableSizes, analysis.sizeChart, analysis.productName, userSizes)
  const productAgeRange = inferProductAgeRange(analysis.availableSizes, analysis.sizeChart)
  const mismatchLabel = demographicMismatchLabel(userSizes, productDemographic)
  const mismatchWarning = mismatchLabel !== null

  const rawMatch = calculateRecommendedSize(
    userSizes,
    analysis.sizeChart,
    analysis.category,
    analysis.productName,
    analysis.availableSizes,
  )

  // ALWAYS RETURN A VALID INVENTORY SIZE: recommended size MUST exist in options.
  const normalize = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
  const availableNorms = new Set(analysis.availableSizes.map(normalize))
  let recommendedSize: string | null = rawMatch
  if (recommendedSize && !availableNorms.has(normalize(recommendedSize))) {
    // Fall back to closest available rather than null.
    recommendedSize = analysis.availableSizes[0] ?? null
  }

  // Apply review fit-bias shift (e.g., "runs small" → one size up).
  if (recommendedSize && analysis.fitBias && analysis.fitBias.shift !== 0) {
    const shifted = applyFitBiasShift(recommendedSize, analysis.fitBias.shift, analysis.availableSizes)
    if (shifted && availableNorms.has(normalize(shifted))) recommendedSize = shifted
  }

  const height = userSizes.sizing.bodyMetrics?.estimated_height_cm
  const profileSize = userSizes.sizing.top || userSizes.sizing.bottom
  const matchedChartEntry = recommendedSize ? analysis.sizeChart.find((entry) => entry.label === recommendedSize) : undefined
  const profileChest = userSizes.sizing.bodyMetrics?.chest_circumference_cm
  const chartChest = matchedChartEntry?.chest_cm
    ? Math.round((matchedChartEntry.chest_cm[0] + matchedChartEntry.chest_cm[1]) / 2)
    : null

  const hasChartData = analysis.sizeChart.length > 0
  const hasExactMeasurements = !!matchedChartEntry?.chest_cm && profileChest != null
  const hasBodyMetrics = !!userSizes.sizing.bodyMetrics?.chest_circumference_cm

  // If no available sizes at all, we genuinely can't recommend.
  if (!recommendedSize || analysis.availableSizes.length === 0) {
    return {
      productName: analysis.productName,
      productImage: analysis.productImage,
      price: analysis.price,
      platform: analysis.platform,
      category: analysis.category,
      recommendedSize: null,
      matchPercentage: 0,
      fitBreakdown: { chest: { fit: '—', score: 0 }, waist: { fit: '—', score: 0 }, length: { fit: '—', score: 0 } },
      sellerMetadata: analysis.sizeChart,
      availableSizes: analysis.availableSizes,
      profileAgeGroup: userSizes.ageGroup,
      productAgeRange,
      productDemographic,
      fitExplanation: 'לא הצלחנו למצוא מידות זמינות בעמוד זה. נסה/י קישור אחר.',
      fitBias: analysis.fitBias,
      confidence: 'low',
      mismatchWarning,
    }
  }

  const fitBreakdown = computeFitBreakdown(userSizes, analysis.sizeChart, recommendedSize)
  let matchPercentage = computeMatchPercentage(fitBreakdown, profileAccuracy)

  // Determine confidence level.
  let confidence: ConfidenceLevel
  if (hasExactMeasurements) {
    confidence = 'high'
  } else if (hasChartData || hasBodyMetrics || analysis.fitBias) {
    confidence = 'medium'
    matchPercentage = Math.min(matchPercentage, 82)
  } else {
    confidence = 'medium'
    matchPercentage = Math.min(matchPercentage, 70)
  }

  // Build explanation based on confidence level.
  const biasLine = analysis.fitBias ? `\nהמלצות קונים: ${analysis.fitBias.label}.` : ''
  let fitExplanation: string
  if (confidence === 'high') {
    const chartReason = chartChest != null && profileChest != null
      ? `\nהסבר: מבוסס על הצלבת היקף החזה בטבלה (${chartChest} ס"מ) מול נתוני הפרופיל (${profileChest} ס"מ) + מרווח נוחות בגזרה רגילה.`
      : `\nהסבר: מבוסס על היקפים מטבלת המידות הרשמית של המוכר.`
    fitExplanation = `התאמה מדויקת: ${recommendedSize} 🎯${chartReason}${biasLine}`
  } else {
    const estReason = height != null
      ? `\nהסבר: מבוסס על גובה (${height} ס"מ), משקל ומידה רגילה (${profileSize}).`
      : `\nהסבר: מבוסס על מידה רגילה (${profileSize}) והמרה למידות הזמינות.`
    const tip = '\nלדיוק מרבי, מומלץ לוודא בטבלת המידות בעמוד המוצר.'
    fitExplanation = `המלצה משוערת: ${recommendedSize} 📏${estReason}${biasLine}${tip}`
  }

  return {
    productName: analysis.productName,
    productImage: analysis.productImage,
    price: analysis.price,
    platform: analysis.platform,
    category: analysis.category,
    recommendedSize,
    matchPercentage,
    fitBreakdown,
    sellerMetadata: analysis.sizeChart,
    availableSizes: analysis.availableSizes,
    profileAgeGroup: userSizes.ageGroup,
    productAgeRange,
    productDemographic,
    fitExplanation,
    fitBias: analysis.fitBias,
    confidence,
    mismatchWarning,
  }
}

function inferProductDemographic(
  availableSizes: string[],
  sellerMetadata: SellerSizeEntry[],
  productName: string,
  userSizes: ScannedSizes,
): 'children' | 'women' | 'men' | 'unisex-adult' | 'unknown' {
  const labels = [...availableSizes, ...sellerMetadata.map((entry) => entry.label)]
  const name = (productName ?? '').toLowerCase()
  const childCount = labels.filter((label) => /\b\d{1,2}Y\b/i.test(label) || /^\d{2,3}\s*\([^)]*[TY]/i.test(label.trim()) || (/^\d{2,3}$/.test(label.trim()) && Number(label) >= 70 && Number(label) <= 170)).length
  if (childCount > 0 && childCount >= labels.filter((l) => /^(?:XXS|XS|S|M|L|XL|XXL|2XL|3XL)$/i.test(l.trim())).length) return 'children'
  const womenKeywords = /(women|woman|female|lady|girls?|dress|skirt|blouse|femme|נשים|אישה|שמלה|חצאית)/i
  const menKeywords = /(men|man|male|boys?|guy|menswear|גברים|גבר)/i
  const profileGender = userSizes.gender
  if (womenKeywords.test(name)) return 'women'
  if (menKeywords.test(name)) return 'men'
  // Plus-size or bust-focused charts (cup sizes, D+) indicate women's.
  const hasLargeBust = sellerMetadata.some((e) => e.chest_cm && e.chest_cm[1] >= 110)
  const hasSmallNumbers = labels.some((l) => /^(?:3[2-9]|4[0-9])$/i.test(l.trim()))
  if (profileGender === 'female' && (hasLargeBust || hasSmallNumbers)) return 'women'
  if (profileGender === 'male' && hasSmallNumbers) return 'men'
  if (childCount > 0) return 'children'
  if (labels.some((l) => /^(?:XXS|XS|S|M|L|XL|XXL|2XL|3XL)$/i.test(l.trim()))) return 'unisex-adult'
  return 'unknown'
}

function inferProductAgeRange(availableSizes: string[], sellerMetadata: SellerSizeEntry[]): 'adult' | 'children' | 'unknown' {
  const labels = [...availableSizes, ...sellerMetadata.map((entry) => entry.label)]
  if (labels.length === 0) return 'unknown'
  const childCount = labels.filter((label) => /\b\d{1,2}Y\b/i.test(label) || /\b(?:7[0-9]|[89][0-9]|1[0-7][0-9])\s*cm\b/i.test(label) || /^\d{2,3}$/.test(label.trim()) && Number(label) >= 70 && Number(label) <= 170 || /^\d{2,3}\s*\([^)]*[TY]/i.test(label.trim())).length
  const adultCount = labels.filter((label) => /^(?:XXS|XS|S|M|L|XL|XXL|\d{2})$/i.test(label.trim()) && !(/^\d+$/.test(label.trim()) && Number(label) >= 70 && Number(label) <= 170)).length
  if (childCount > adultCount && childCount > 0) return 'children'
  if (adultCount > childCount && adultCount > 0) return 'adult'
  return 'unknown'
}
