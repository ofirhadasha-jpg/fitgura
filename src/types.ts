export type Screen = 'splash' | 'onboarding' | 'device' | 'feed' | 'events' | 'profile' | 'wishlist'

export interface FitEvent {
  id: number
  name: string
  emoji: string
  date: string
  platforms: string[]
  color: string
  bgColor: string
}

export interface Platform {
  name: string
  daysIL: number
  logo: string
  color: string
  note: string
}

export interface User {
  name: string
  email: string
  avatar: string
}

export const PLATFORMS: Platform[] = [
  { name: 'AliExpress', daysIL: 60, logo: '🟠', color: '#E84B35', note: '60 יום לישראל' },
  { name: 'Temu',       daysIL: 45, logo: '🔵', color: '#2563EB', note: '45 יום לישראל' },
  { name: 'Shein',      daysIL: 30, logo: '⬛', color: '#111827', note: '30 יום לישראל' },
  { name: 'Amazon',     daysIL: 7,  logo: '📦', color: '#F59E0B', note: '7 ימים לישראל' },
  { name: 'ASOS',       daysIL: 14, logo: '🛍️', color: '#7C3AED', note: '14 יום לישראל' },
  { name: 'ZARA',       daysIL: 5,  logo: '🟫', color: '#78716C', note: '5 ימים לישראל' },
  { name: 'H&M',        daysIL: 7,  logo: '🔴', color: '#DC2626', note: '7 ימים לישראל' },
  { name: 'Nike',       daysIL: 10, logo: '✔️', color: '#374151', note: '10 ימים לישראל' },
]

export const PRESET_EVENTS = [
  { name: 'יום האהבה', emoji: '💝', month: '02', day: '14', color: '#FF6B6B', bgColor: '#FFF0F0' },
  { name: 'יום הולדת', emoji: '🎂', month: '', day: '', color: '#2E5BFF', bgColor: '#EEF2FF' },
  { name: 'יום נישואין', emoji: '💍', month: '', day: '', color: '#FF6B6B', bgColor: '#FFF5F0' },
  { name: 'ראש השנה', emoji: '🍎', month: '09', day: '22', color: '#2ED573', bgColor: '#F0FFF6' },
  { name: 'חנוכה', emoji: '🕎', month: '12', day: '25', color: '#2E5BFF', bgColor: '#EEF2FF' },
  { name: 'פסח', emoji: '✡️', month: '04', day: '12', color: '#F59E0B', bgColor: '#FFFBEB' },
  { name: 'יום האב', emoji: '👨', month: '06', day: '16', color: '#7C3AED', bgColor: '#F5F3FF' },
  { name: 'יום האם', emoji: '💐', month: '05', day: '11', color: '#EC4899', bgColor: '#FDF2F8' },
]

export let _nextEventId = 10
export function nextEventId() { return _nextEventId++ }

export function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

export type MeasurementDelta = Record<string, string>

export interface BodyMetrics {
  estimated_height_cm: number | null
  estimated_weight_kg: number | null
  chest_circumference_cm: number | null
  waist_circumference_cm: number | null
  hips_circumference_cm: number | null
  shoulder_width_cm: number | null
}

export interface SizingProfile {
  top: string
  bottom: string
  fit: string
  bodyFrame: string
  confidence: number
  baselineMatched: boolean
  isWeeklyUpdate: boolean
  measurementDelta: MeasurementDelta | null
  bodyMetrics: BodyMetrics | null
}

export interface StyleProfile {
  primaryStyle: string
  secondaryStyle: string
  dominantColors: string[]
  patternPreference: string
  aestheticTags: string[]
}

export interface ScannedProductProfile {
  identificationType: string | null
  brand: string | null
  productName: string | null
  exactSku: string | null
  category: string | null
  compatibleAccessories: string[]
  confidenceScore: number
}

export interface DeviceIdentificationResult {
  device_type: string
  brand: string
  model: string
  screen_size_inches: number | null
  chip: string | null
  year: string | null
  extra: string
  compatible_accessories: string[]
  confidence_score: number
}

export async function identifyDevice(file: File): Promise<DeviceIdentificationResult> {
  const base64Image = await fileToCompressedBase64(file)

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/identify-device`
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ image: base64Image }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(`Device scan failed (${response.status}): ${errBody.slice(0, 200)}`)
  }

  const result = await response.json()

  if (result.error) {
    throw new Error(result.error)
  }

  const typeMap: Record<string, string> = {
    'phone': 'טלפון',
    'tablet': 'טאבלט',
    'laptop': 'לפטופ',
    'headphones': 'אוזניות',
    'smartwatch': 'שעון',
    'other': 'אחר',
  }

  return {
    device_type: typeMap[result.device_type?.toLowerCase()] ?? 'אחר',
    brand: result.brand ?? 'Unknown',
    model: result.model ?? 'Unknown Device',
    screen_size_inches: result.screen_size_inches ?? null,
    chip: result.chip ?? null,
    year: result.year ?? null,
    extra: result.extra ?? '',
    compatible_accessories: result.compatible_accessories ?? [],
    confidence_score: result.confidence_score ?? 0.5,
  }
}

export interface ScannedSizes {
  sizing: SizingProfile
  style: StyleProfile
  confidence: number
  preview: string
  top: string
  bottom: string
  fit: string
  gender: 'male' | 'female' | 'unisex'
  personBounds: PersonBounds
  shoeSize: string | null
}

export interface PersonBounds {
  top: number
  left: number
  width: number
  height: number
}

export interface AIBodyAnalysis {
  face_detected?: boolean
  gender?: 'male' | 'female' | 'unisex'
  device_profile: {
    detected_brand: string
    exact_model: string
    screen_size_inches: number
    camera_layout_type: string
    confidence_score: number
  }
  person_bounds?: PersonBounds
  sizing_profile: {
    body_metrics: BodyMetrics
    recommended_top_size: string | null
    recommended_bottom_size: string | null
    recommended_shoe_size_eu: number | null
    fit_preference: string
    body_frame_estimate: string
    confidence_score: number
  }
  style_profile: {
    primary_style: string
    secondary_style: string
    dominant_colors: string[]
    pattern_preference: string
    aesthetic_tags: string[]
  }
}

export interface VendorSizeChartEntry {
  vendor_size_label: string
  chest_range_cm?: [number, number]
  waist_range_cm?: [number, number]
  length_cm?: number
  sku_id: string
}

export interface SkuMatchResult {
  matched_vendor_size: string
  target_sku_id: string
  match_confidence: number
  recommendation_note: string
}

export async function fileToCompressedBase64(file: File, maxDim: number = 768, quality: number = 0.7): Promise<string> {
  const dataUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = dataUrl
    })

    let { width, height } = img
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, width, height)

    const compressed = canvas.toDataURL('image/jpeg', quality)
    return compressed
  } finally {
    URL.revokeObjectURL(dataUrl)
  }
}

export async function analyzeBodyImage(file: File): Promise<{ analysis: AIBodyAnalysis; preview: string }> {
  const preview = URL.createObjectURL(file)

  const base64Image = await fileToCompressedBase64(file)

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-body`
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      image: base64Image,
      userAgent: navigator.userAgent,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(`Analysis failed (${response.status}): ${errBody.slice(0, 200)}`)
  }

  const result = await response.json()

  if (result.error) {
    throw new Error(result.error)
  }

  const analysis: AIBodyAnalysis = result
  return { analysis, preview }
}

export function aiAnalysisToScannedSizes(analysis: AIBodyAnalysis, preview: string): ScannedSizes {
  const sp = analysis.sizing_profile
  const st = analysis.style_profile

  const top = sp.recommended_top_size ?? 'M'
  const bottom = sp.recommended_bottom_size ?? '32'
  const shoeSize = sp.recommended_shoe_size_eu != null ? String(sp.recommended_shoe_size_eu) : null
  const fitMap: Record<string, string> = { 'Slim': 'Slim Fit', 'Regular': 'Regular', 'Loose': 'Relaxed', 'Oversized': 'Relaxed' }
  const fit = fitMap[sp.fit_preference] ?? 'Regular'
  const bodyFrame = sp.body_frame_estimate ?? 'Medium'
  const confidence = Math.round((sp.confidence_score ?? 0.85) * 100)
  const gender = analysis.gender ?? 'unisex'

  const sizing: SizingProfile = {
    top,
    bottom,
    fit,
    bodyFrame,
    confidence,
    baselineMatched: false,
    isWeeklyUpdate: false,
    measurementDelta: null,
    bodyMetrics: sp.body_metrics,
  }

  const style: StyleProfile = {
    primaryStyle: st.primary_style ?? 'Casual',
    secondaryStyle: st.secondary_style ?? 'Urban',
    dominantColors: st.dominant_colors ?? [],
    patternPreference: st.pattern_preference ?? 'Solid',
    aestheticTags: st.aesthetic_tags ?? [],
  }

  const personBounds: PersonBounds = analysis.person_bounds ?? { top: 2, left: 10, width: 80, height: 96 }

  return {
    sizing,
    style,
    confidence,
    preview,
    top,
    bottom,
    fit,
    gender,
    personBounds,
    shoeSize,
  }
}

export const TOP_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
// EU pants sizes — unified range starting from EU 36
export const BOTTOM_SIZES_EU = ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60']
// Kept for backward compatibility — now maps to EU sizes
export const BOTTOM_SIZES = BOTTOM_SIZES_EU

// Returns the correct EU pants size list based on gender (same unified range for all)
export function getBottomSizesForGender(_gender: 'male' | 'female' | 'unisex' | undefined): string[] {
  return BOTTOM_SIZES_EU
}

// Convert between EU pants size and US waist inches. EU = US + 10 (approx)
export function convertPantsSize(value: string, target: 'EU' | 'US'): string {
  const num = parseInt(value, 10)
  if (isNaN(num)) return value
  if (target === 'EU') return String(num + 10)
  return String(num - 10)
}
export const FIT_TYPES = ['Slim Fit', 'Regular', 'Relaxed', 'Athletic']
export const SHOE_SIZES_EU = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48']

export const BODY_FRAMES    = ['Small', 'Medium', 'Large', 'Athletic']
export const PRIMARY_STYLES = ['Casual', 'Streetwear', 'Classic', 'Minimalist', 'Smart Casual', 'Athletic']
export const SEC_STYLES     = ['Boho', 'Urban', 'Preppy', 'Techwear', 'Resort', 'Business Casual']
export const PATTERNS       = ['Solid', 'Patterned', 'Graphic']
export const COLOR_PALETTE  = [
  ['#1E293B', '#F1F5F9', '#2E5BFF'],
  ['#7C3AED', '#F5F3FF', '#DDD6FE'],
  ['#DC2626', '#FFF0F0', '#1E293B'],
  ['#D97706', '#FFFBEB', '#78716C'],
  ['#16A34A', '#F0FFF6', '#1E293B'],
  ['#0891B2', '#E0F2FE', '#F1F5F9'],
]
export const AESTHETIC_TAGS = [
  ['minimalist', 'monochrome', 'clean lines'],
  ['bold colors', 'statement pieces', 'maximalist'],
  ['streetwear', 'urban', 'oversized'],
  ['classic', 'timeless', 'tailored'],
  ['sporty', 'functional', 'performance'],
  ['eclectic', 'layered', 'textured'],
]

export function weightedPick(seed: number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0)
  const r = seed % total
  let acc = 0
  for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (r < acc) return i }
  return weights.length - 1
}

let _sessionBaseline: ScannedSizes | null = null

export function deriveScannedSizes(file: File): ScannedSizes {
  let hash = file.size
  for (let i = 0; i < file.name.length; i++) hash = (hash * 31 + file.name.charCodeAt(i)) >>> 0

  const topWeights = [4, 10, 24, 30, 22, 10]
  const topIdx = weightedPick(hash, topWeights)

  const botVariation = ((hash >> 8) % 3) - 1
  const botIdx = Math.min(BOTTOM_SIZES.length - 1, Math.max(0, topIdx + botVariation))

  const fitWeightsBySize: number[][] = [
    [45, 35, 0, 20],
    [45, 35, 0, 20],
    [25, 35, 20, 20],
    [0, 40, 30, 30],
    [0, 30, 50, 20],
    [0, 30, 50, 20],
  ]
  const fitIdx = weightedPick((hash >> 4), fitWeightsBySize[topIdx])

  const frameMap = [0, 0, 1, 2, 3, 2]
  const bodyFrameIdx = frameMap[topIdx]

  const sizingConf = 88 + ((hash >> 16) % 10)

  const styleIdx    = (hash >> 20) % PRIMARY_STYLES.length
  const secStyleIdx = ((hash >> 24) + styleIdx + 1) % SEC_STYLES.length
  const colorIdx    = (hash >> 12) % COLOR_PALETTE.length
  const patternIdx  = weightedPick((hash >> 6), [60, 25, 15])
  const tagIdx      = (hash >> 18) % AESTHETIC_TAGS.length

  const isTracking = _sessionBaseline !== null
  const prev = _sessionBaseline?.sizing

  let measurementDelta: MeasurementDelta | null = null
  if (isTracking && prev) {
    const newTop = TOP_SIZES[topIdx], newBot = BOTTOM_SIZES[botIdx]
    const newFit = FIT_TYPES[fitIdx], newFrame = BODY_FRAMES[bodyFrameIdx]
    const changes: string[] = []
    const topChange    = prev.top    !== newTop    ? `${prev.top} → ${newTop}`       : null
    const bottomChange = prev.bottom !== newBot    ? `${prev.bottom} → ${newBot}`    : null
    const fitChange    = prev.fit    !== newFit    ? `${prev.fit} → ${newFit}`       : null
    const frameChange  = prev.bodyFrame !== newFrame ? `${prev.bodyFrame} → ${newFrame}` : null
    if (topChange)    changes.push(`חולצה: ${topChange}`)
    if (bottomChange) changes.push(`מכנסיים: ${bottomChange}`)
    if (fitChange)    changes.push(`גזרה: ${fitChange}`)
    if (frameChange)  changes.push(`מסגרת: ${frameChange}`)
    measurementDelta = {
      ...(topChange    && { top:    topChange }),
      ...(bottomChange && { bottom: bottomChange }),
      ...(fitChange    && { fit:    fitChange }),
      ...(frameChange  && { frame:  frameChange }),
      summary: changes.length > 0 ? `זוהו שינויים: ${changes.join(' | ')}` : 'לא זוהו שינויים מהסריקה הקודמת.',
    }
  }

  const sizing: SizingProfile = {
    top: TOP_SIZES[topIdx],
    bottom: BOTTOM_SIZES[botIdx],
    fit: FIT_TYPES[fitIdx],
    bodyFrame: BODY_FRAMES[bodyFrameIdx],
    confidence: sizingConf,
    baselineMatched: isTracking,
    isWeeklyUpdate: false,
    measurementDelta,
    bodyMetrics: null,
  }

  const style: StyleProfile = {
    primaryStyle: PRIMARY_STYLES[styleIdx],
    secondaryStyle: SEC_STYLES[secStyleIdx],
    dominantColors: COLOR_PALETTE[colorIdx] ?? [],
    patternPreference: PATTERNS[patternIdx],
    aestheticTags: AESTHETIC_TAGS[tagIdx] ?? [],
  }

  const result: ScannedSizes = {
    sizing,
    style,
    confidence: sizingConf,
    preview: URL.createObjectURL(file),
    top: sizing.top,
    bottom: sizing.bottom,
    fit: sizing.fit,
    personBounds: { top: 2, left: 10, width: 80, height: 96 },
  }

  if (!isTracking) _sessionBaseline = result

  return result
}

export interface DetectedDevice {
  brand: string
  model: string
  chip: string
  year: string
  name: string
  screen_size_inches: number | null
  camera_layout: string | null
  confidence: number
}

export function detectDevice(): DetectedDevice {
  const ua = navigator.userAgent
  const uaLower = ua.toLowerCase()

  let brand = 'Other'
  let model = 'Unknown Device'
  let chip = 'Unknown'
  let year = '2024'
  let screen_size_inches: number | null = null
  let camera_layout: string | null = null
  let confidence = 0.5

  if (/iphone/.test(uaLower)) {
    brand = 'Apple'
    const modelMatch = ua.match(/iPhone(?:OS)?[\s/]?(\d+,\d+)?/i)
    const isPro = /pro/i.test(ua)
    const isMax = /max/i.test(ua)

    if (/iPhone16/.test(ua) || /iPhone15,\d+/.test(ua)) {
      if (isMax) { model = 'iPhone 16 Pro Max'; chip = 'A18 Pro'; year = '2024' }
      else if (isPro) { model = 'iPhone 16 Pro'; chip = 'A18 Pro'; year = '2024' }
      else { model = 'iPhone 16'; chip = 'A18'; year = '2024' }
    } else if (/iPhone15/.test(ua)) {
      if (isMax) { model = 'iPhone 15 Pro Max'; chip = 'A17 Pro'; year = '2023' }
      else if (isPro) { model = 'iPhone 15 Pro'; chip = 'A17 Pro'; year = '2023' }
      else { model = 'iPhone 15'; chip = 'A16 Bionic'; year = '2023' }
    } else if (/iPhone14/.test(ua)) {
      if (isPro) { model = 'iPhone 14 Pro'; chip = 'A16 Bionic'; year = '2022' }
      else { model = 'iPhone 14'; chip = 'A15 Bionic'; year = '2022' }
    } else if (/iPhone13/.test(ua)) {
      model = 'iPhone 13'; chip = 'A15 Bionic'; year = '2021'
    } else if (/iPhone12/.test(ua)) {
      model = 'iPhone 12'; chip = 'A14 Bionic'; year = '2020'
    } else {
      model = 'iPhone (Unknown Model)'; chip = 'Apple Silicon'; year = '2023'
    }
    screen_size_inches = isMax ? 6.9 : isPro ? 6.3 : 6.1
    camera_layout = isPro || isMax ? 'Triple + LiDAR' : 'Dual'
    confidence = 0.85
  } else if (/ipad/.test(uaLower)) {
    brand = 'Apple'
    model = 'iPad'
    chip = 'Apple Silicon'
    year = '2024'
    screen_size_inches = 11
    camera_layout = 'Single'
    confidence = 0.7
  } else if (/samsung|sm-|galaxy/.test(uaLower)) {
    brand = 'Samsung'
    if (/sm-s93/i.test(ua) || /galaxy s25/i.test(uaLower)) {
      if (/ultra/i.test(uaLower)) { model = 'Galaxy S25 Ultra'; chip = 'Snapdragon 8 Elite'; year = '2025' }
      else if (/\+/.test(ua)) { model = 'Galaxy S25+'; chip = 'Snapdragon 8 Elite'; year = '2025' }
      else { model = 'Galaxy S25'; chip = 'Snapdragon 8 Elite'; year = '2025' }
    } else if (/sm-s92/i.test(ua) || /galaxy s24/i.test(uaLower)) {
      if (/ultra/i.test(uaLower)) { model = 'Galaxy S24 Ultra'; chip = 'Snapdragon 8 Gen 3'; year = '2024' }
      else if (/\+/.test(ua)) { model = 'Galaxy S24+'; chip = 'Snapdragon 8 Gen 3'; year = '2024' }
      else { model = 'Galaxy S24'; chip = 'Exynos 2400'; year = '2024' }
    } else if (/sm-s91/i.test(ua) || /galaxy s23/i.test(uaLower)) {
      model = 'Galaxy S23'; chip = 'Snapdragon 8 Gen 2'; year = '2023'
    } else if (/sm-a5/i.test(ua)) {
      model = 'Galaxy A55'; chip = 'Exynos 1480'; year = '2024'
    } else if (/sm-a3/i.test(ua)) {
      model = 'Galaxy A35'; chip = 'Exynos 1380'; year = '2024'
    } else {
      model = 'Samsung Galaxy'; chip = 'Exynos/Snapdragon'; year = '2024'
    }
    screen_size_inches = /ultra/i.test(uaLower) ? 6.8 : 6.2
    camera_layout = /ultra/i.test(uaLower) ? 'Quad' : 'Triple'
    confidence = 0.75
  } else if (/pixel/i.test(uaLower)) {
    brand = 'Google'
    if (/pixel 9 pro/i.test(uaLower)) { model = 'Pixel 9 Pro'; chip = 'Google Tensor G4'; year = '2024'; screen_size_inches = 6.3 }
    else if (/pixel 9/i.test(uaLower)) { model = 'Pixel 9'; chip = 'Google Tensor G4'; year = '2024'; screen_size_inches = 6.2 }
    else if (/pixel 8 pro/i.test(uaLower)) { model = 'Pixel 8 Pro'; chip = 'Google Tensor G3'; year = '2023'; screen_size_inches = 6.7 }
    else if (/pixel 8/i.test(uaLower)) { model = 'Pixel 8'; chip = 'Google Tensor G3'; year = '2023'; screen_size_inches = 6.2 }
    else if (/pixel 7/i.test(uaLower)) { model = 'Pixel 7'; chip = 'Google Tensor G2'; year = '2022'; screen_size_inches = 6.3 }
    else { model = 'Pixel'; chip = 'Google Tensor'; year = '2023'; screen_size_inches = 6.2 }
    camera_layout = 'Triple'
    confidence = 0.8
  } else if (/xiaomi|redmi|mi\s/i.test(uaLower)) {
    brand = 'Xiaomi'
    if (/14 ultra/i.test(uaLower)) { model = 'Xiaomi 14 Ultra'; chip = 'Snapdragon 8 Gen 3'; year = '2024'; screen_size_inches = 6.73 }
    else if (/14\b/i.test(uaLower)) { model = 'Xiaomi 14'; chip = 'Snapdragon 8 Gen 3'; year = '2024'; screen_size_inches = 6.36 }
    else if (/13t pro/i.test(uaLower)) { model = 'Xiaomi 13T Pro'; chip = 'Dimensity 9200+'; year = '2023'; screen_size_inches = 6.67 }
    else if (/redmi note 13 pro/i.test(uaLower)) { model = 'Redmi Note 13 Pro'; chip = 'Snapdragon 7s Gen 2'; year = '2024'; screen_size_inches = 6.67 }
    else { model = 'Xiaomi Device'; chip = 'Snapdragon/Dimensity'; year = '2024'; screen_size_inches = 6.5 }
    camera_layout = 'Triple'
    confidence = 0.7
  } else if (/oneplus/i.test(uaLower)) {
    brand = 'OnePlus'
    if (/12r/i.test(uaLower)) { model = 'OnePlus 12R'; chip = 'Snapdragon 8 Gen 1'; year = '2024'; screen_size_inches = 6.78 }
    else if (/12\b/i.test(uaLower)) { model = 'OnePlus 12'; chip = 'Snapdragon 8 Gen 3'; year = '2024'; screen_size_inches = 6.82 }
    else if (/nord 4/i.test(uaLower)) { model = 'OnePlus Nord 4'; chip = 'Snapdragon 7+ Gen 3'; year = '2024'; screen_size_inches = 6.74 }
    else { model = 'OnePlus Device'; chip = 'Snapdragon'; year = '2024'; screen_size_inches = 6.7 }
    camera_layout = 'Triple'
    confidence = 0.7
  } else if (/oppo|find x/i.test(uaLower)) {
    brand = 'OPPO'
    model = /find x8 pro/i.test(uaLower) ? 'OPPO Find X8 Pro' : 'OPPO Device'
    chip = 'Dimensity 9400'
    year = '2024'
    screen_size_inches = 6.78
    camera_layout = 'Triple'
    confidence = 0.65
  } else if (/motorola|moto/i.test(uaLower)) {
    brand = 'Motorola'
    model = /edge 50 pro/i.test(uaLower) ? 'Motorola Edge 50 Pro' : 'Motorola Device'
    chip = 'Snapdragon 7 Gen 3'
    year = '2024'
    screen_size_inches = 6.7
    camera_layout = 'Triple'
    confidence = 0.65
  } else if (/sony|xperia/i.test(uaLower)) {
    brand = 'Sony'
    model = /xperia 1 vi/i.test(uaLower) ? 'Sony Xperia 1 VI' : 'Sony Xperia'
    chip = 'Snapdragon 8 Gen 3'
    year = '2024'
    screen_size_inches = 6.5
    camera_layout = 'Triple'
    confidence = 0.65
  } else if (/macintosh|mac os|windows|linux/i.test(uaLower)) {
    brand = 'Desktop'
    model = /mac/i.test(uaLower) ? 'Mac' : /windows/i.test(uaLower) ? 'Windows PC' : 'Linux Desktop'
    chip = 'Desktop CPU'
    year = '2024'
    screen_size_inches = null
    camera_layout = null
    confidence = 0.6
  }

  const name = brand === 'Desktop' ? model : model

  return { brand, model, chip, year, name, screen_size_inches, camera_layout, confidence }
}

export const deviceOptions = [
  { name: 'iPhone 16 Pro Max', chip: 'A18 Pro', year: '2024', brand: 'Apple' },
  { name: 'iPhone 16 Pro', chip: 'A18 Pro', year: '2024', brand: 'Apple' },
  { name: 'iPhone 16', chip: 'A18', year: '2024', brand: 'Apple' },
  { name: 'iPhone 15 Pro Max', chip: 'A17 Pro', year: '2023', brand: 'Apple' },
  { name: 'iPhone 15 Pro', chip: 'A17 Pro', year: '2023', brand: 'Apple' },
  { name: 'iPhone 15', chip: 'A16 Bionic', year: '2023', brand: 'Apple' },
  { name: 'iPhone 14 Pro', chip: 'A16 Bionic', year: '2022', brand: 'Apple' },
  { name: 'iPhone 14', chip: 'A15 Bionic', year: '2022', brand: 'Apple' },
  { name: 'iPhone 13', chip: 'A15 Bionic', year: '2021', brand: 'Apple' },
  { name: 'Galaxy S25 Ultra', chip: 'Snapdragon 8 Elite', year: '2025', brand: 'Samsung' },
  { name: 'Galaxy S25+', chip: 'Snapdragon 8 Elite', year: '2025', brand: 'Samsung' },
  { name: 'Galaxy S24 Ultra', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Samsung' },
  { name: 'Galaxy S24+', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Samsung' },
  { name: 'Galaxy S24', chip: 'Exynos 2400', year: '2024', brand: 'Samsung' },
  { name: 'Galaxy S23', chip: 'Snapdragon 8 Gen 2', year: '2023', brand: 'Samsung' },
  { name: 'Galaxy A55', chip: 'Exynos 1480', year: '2024', brand: 'Samsung' },
  { name: 'Galaxy A35', chip: 'Exynos 1380', year: '2024', brand: 'Samsung' },
  { name: 'Pixel 9 Pro', chip: 'Google Tensor G4', year: '2024', brand: 'Google' },
  { name: 'Pixel 9', chip: 'Google Tensor G4', year: '2024', brand: 'Google' },
  { name: 'Pixel 8 Pro', chip: 'Google Tensor G3', year: '2023', brand: 'Google' },
  { name: 'Xiaomi 14 Ultra', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Xiaomi' },
  { name: 'Xiaomi 14', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Xiaomi' },
  { name: 'Xiaomi 13T Pro', chip: 'Dimensity 9200+', year: '2023', brand: 'Xiaomi' },
  { name: 'Redmi Note 13 Pro', chip: 'Snapdragon 7s Gen 2', year: '2024', brand: 'Xiaomi' },
  { name: 'OnePlus 12', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'OnePlus' },
  { name: 'OnePlus 12R', chip: 'Snapdragon 8 Gen 1', year: '2024', brand: 'OnePlus' },
  { name: 'OnePlus Nord 4', chip: 'Snapdragon 7+ Gen 3', year: '2024', brand: 'OnePlus' },
  { name: 'OPPO Find X8 Pro', chip: 'Dimensity 9400', year: '2024', brand: 'OPPO' },
  { name: 'Motorola Edge 50 Pro', chip: 'Snapdragon 7 Gen 3', year: '2024', brand: 'Motorola' },
  { name: 'Sony Xperia 1 VI', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Sony' },
]

export interface Product {
  name: string
  brand: string
  price: number
  originalPrice?: number | null
  currency?: string
  img: string
  category: string
  aliexpressUrl?: string
  aliexpressSku?: string
  matchScore?: number
}

export interface UserDevice {
  id: number
  type: string
  brand: string
  model: string
  extra: string
  emoji: string
  primary?: boolean
}

export let _devId = 10
export function nextDevId() { return _devId++ }

export interface ScanEntry {
  id: number
  date: string
  time: string
  top: string
  bottom: string
  fit: string
  confidence: number
  photoUrl: string
  source: string
  isBaseline: boolean
  delta: Record<string, string> | null
}

export type GalleryAccessState = 'pending' | 'granted' | 'denied'

export interface AutoScanStatus {
  lastScanDate: string
  nextScanDate: string
  photosFound: number
  photosAnalyzed: number
  changesDetected: boolean
}

let _scanId = 0
export function nextScanId() { return _scanId++ }

export function formatNextScanDate(): string {
  const next = new Date()
  next.setDate(next.getDate() + 7)
  return next.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function formatLastScanDate(): string {
  return new Date().toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatTimestamp(d: Date): { date: string; time: string } {
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  let dateLabel: string
  if (diffDays === 0) dateLabel = 'היום'
  else if (diffDays === 1) dateLabel = 'אתמול'
  else dateLabel = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
  const timeLabel = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return { date: dateLabel, time: timeLabel }
}

export function computeDelta(prev: SizingProfile, curr: SizingProfile): Record<string, string> | null {
  const topChange = prev.top !== curr.top ? `${prev.top} → ${curr.top}` : null
  const bottomChange = prev.bottom !== curr.bottom ? `${prev.bottom} → ${curr.bottom}` : null
  const fitChange = prev.fit !== curr.fit ? `${prev.fit} → ${curr.fit}` : null
  const frameChange = prev.bodyFrame !== curr.bodyFrame ? `${prev.bodyFrame} → ${curr.bodyFrame}` : null
  const delta: Record<string, string> = {}
  if (topChange) delta.top = topChange
  if (bottomChange) delta.bottom = bottomChange
  if (fitChange) delta.fit = fitChange
  if (frameChange) delta.frame = frameChange
  const changes: string[] = []
  if (topChange) changes.push(`חולצה: ${topChange}`)
  if (bottomChange) changes.push(`מכנסיים: ${bottomChange}`)
  if (fitChange) changes.push(`גזרה: ${fitChange}`)
  if (frameChange) changes.push(`מסגרת: ${frameChange}`)
  if (changes.length > 0) delta.summary = `זוהו שינויים: ${changes.join(' | ')}`
  else return null
  return delta
}

export const SCAN_NO_NEW_MESSAGE = 'לא נסרקו תמונות חדשות; אין שינוי במידות'

const TOP_SIZE_METRICS: Record<string, { chest: number; waist: number; hips: number; shoulder: number }> = {
  'XS': { chest: 86, waist: 71, hips: 90, shoulder: 38 },
  'S':  { chest: 96, waist: 76, hips: 94, shoulder: 42 },
  'M':  { chest: 104, waist: 81, hips: 98, shoulder: 46 },
  'L':  { chest: 112, waist: 86, hips: 102, shoulder: 48 },
  'XL': { chest: 120, waist: 91, hips: 106, shoulder: 50 },
  'XXL': { chest: 128, waist: 97, hips: 110, shoulder: 52 },
}

const BOTTOM_SIZE_WAIST: Record<string, number> = {
  '44': 71, '46': 76, '48': 81, '50': 86, '52': 91, '54': 97,
}

export function computeBodyMetricsFromSizes(top: string, bottom: string, existing: BodyMetrics | null): BodyMetrics {
  const topMetrics = TOP_SIZE_METRICS[top] ?? TOP_SIZE_METRICS['M']
  const bottomWaist = BOTTOM_SIZE_WAIST[bottom] ?? topMetrics.waist
  return {
    estimated_height_cm: existing?.estimated_height_cm ?? 175,
    estimated_weight_kg: existing?.estimated_weight_kg ?? 75,
    chest_circumference_cm: topMetrics.chest,
    waist_circumference_cm: bottomWaist,
    hips_circumference_cm: topMetrics.hips,
    shoulder_width_cm: topMetrics.shoulder,
  }
}

// Proportional adjustment of body circumferences when weight or height changes.
// +1 kg ≈ +0.8 cm to waist/hips/chest; +1 cm height ≈ +0.3 cm to chest/shoulder
export function computeBodyMetricsFromHeightWeight(
  heightCm: number,
  weightKg: number,
  baseline: BodyMetrics | null,
): BodyMetrics {
  const baseH = baseline?.estimated_height_cm ?? 175
  const baseW = baseline?.estimated_weight_kg ?? 75
  const baseChest = baseline?.chest_circumference_cm ?? 104
  const baseWaist = baseline?.waist_circumference_cm ?? 81
  const baseHips = baseline?.hips_circumference_cm ?? 98
  const baseShoulder = baseline?.shoulder_width_cm ?? 46

  const dWeight = weightKg - baseW
  const dHeight = heightCm - baseH

  return {
    estimated_height_cm: heightCm,
    estimated_weight_kg: weightKg,
    chest_circumference_cm: Math.round((baseChest + dWeight * 0.8 + dHeight * 0.3) * 10) / 10,
    waist_circumference_cm: Math.round((baseWaist + dWeight * 0.8 + dHeight * 0.1) * 10) / 10,
    hips_circumference_cm: Math.round((baseHips + dWeight * 0.8 + dHeight * 0.2) * 10) / 10,
    shoulder_width_cm: Math.round((baseShoulder + dWeight * 0.3 + dHeight * 0.4) * 10) / 10,
  }
}
