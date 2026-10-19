import type { AgeGroup, ScannedSizes } from '../types'
import { calculateRecommendedSize, type SellerSizeEntry } from '../utils/exactSizeMatcher'
import { supabase } from '../lib/supabase'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import type { FitBreakdown, WardrobeItem } from '../components/SizingResultModal'

const FETCH_TIMEOUT_MS = 9000

export interface ProductAnalysisResult {
  productName: string
  productImage: string | null
  price: string | null
  platform: string
  category: string
  recommendedSize: string
  matchPercentage: number
  fitBreakdown: FitBreakdown
  sellerMetadata: SellerSizeEntry[]
  availableSizes: string[]
  profileAgeGroup: AgeGroup
  productAgeRange: 'adult' | 'children' | 'unknown'
  fitExplanation: string
}

interface EdgeFunctionResponse {
  productName: string | null
  productImage: string | null
  price: string | null
  platform: string
  category: string
  sizeChart: SellerSizeEntry[]
  availableSizes: string[]
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

export async function analyzeProductUrl(
  url: string,
  userSizes: ScannedSizes | null,
  profileAccuracy: number,
): Promise<ProductAnalysisResult> {
  if (!userSizes) {
    throw new Error('NO_PROFILE')
  }

  const urlHash = await generateUrlHash(url)

  // Check cache first
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

  const matchedSize = calculateRecommendedSize(
    userSizes,
    analysis.sizeChart,
    analysis.category,
    analysis.productName,
    analysis.availableSizes,
  )
  const recommendedSize = matchedSize ?? analysis.availableSizes[0] ?? 'לא נמצאה מידה'
  const productAgeRange = inferProductAgeRange(analysis.availableSizes, analysis.sizeChart)
  const height = userSizes.sizing.bodyMetrics?.estimated_height_cm
  const profileSize = userSizes.sizing.top || userSizes.sizing.bottom
  const fitExplanation = height != null
    ? `מידה מומלצת: ${recommendedSize} (מותאם לגובה ${height} ס"מ ומידה ${profileSize})`
    : `מידה מומלצת: ${recommendedSize} (מותאם למידה ${profileSize})`

  const fitBreakdown = computeFitBreakdown(userSizes, analysis.sizeChart, recommendedSize)
  const matchPercentage = computeMatchPercentage(fitBreakdown, profileAccuracy)

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
    fitExplanation,
  }
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
