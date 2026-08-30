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

export interface ScannedSizes {
  sizing: SizingProfile
  style: StyleProfile
  confidence: number
  preview: string
  top: string
  bottom: string
  fit: string
}

export interface AIBodyAnalysis {
  device_profile: {
    detected_brand: string
    exact_model: string
    screen_size_inches: number
    camera_layout_type: string
    confidence_score: number
  }
  sizing_profile: {
    body_metrics: BodyMetrics
    recommended_top_size: string | null
    recommended_bottom_size: string | null
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

async function fileToCompressedBase64(file: File, maxDim: number = 768, quality: number = 0.7): Promise<string> {
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
  const fitMap: Record<string, string> = { 'Slim': 'Slim Fit', 'Regular': 'Regular', 'Loose': 'Relaxed', 'Oversized': 'Relaxed' }
  const fit = fitMap[sp.fit_preference] ?? 'Regular'
  const bodyFrame = sp.body_frame_estimate ?? 'Medium'
  const confidence = Math.round((sp.confidence_score ?? 0.85) * 100)

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

  return {
    sizing,
    style,
    confidence,
    preview,
    top,
    bottom,
    fit,
  }
}

export const TOP_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
export const BOTTOM_SIZES = ['28', '30', '32', '34', '36', '38']
export const FIT_TYPES = ['Slim Fit', 'Regular', 'Relaxed', 'Athletic']

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
  }

  if (!isTracking) _sessionBaseline = result

  return result
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
  img: string
  category: string
}

export const products: Product[] = [
  { name: 'חולצת לינן קיץ', brand: 'ZARA', price: 189, img: 'photo-1713881842156-3d9ef36418cc', category: 'clothing' },
  { name: "ג'קט דנים קלאסי", brand: "Levi's", price: 349, img: 'photo-1542291026-7eec264c27ff', category: 'clothing' },
  { name: 'כיסוי MagSafe', brand: 'Casetify', price: 129, img: 'photo-1511707171634-5f897ff02aa9', category: 'accessories' },
  { name: "ג'ינס סלים", brand: 'H&M', price: 229, img: 'photo-1542272604-787c3835535d', category: 'clothing' },
  { name: 'סניקרס אוורסום', brand: 'Nike', price: 420, img: 'photo-1542291026-7eec264c27ff', category: 'shoes' },
  { name: 'מגן מסך זכוכית', brand: 'Spigen', price: 79, img: 'photo-1580910051074-3eb694886505', category: 'accessories' },
  { name: 'חולצת פולו', brand: 'Ralph Lauren', price: 279, img: 'photo-1523381210434-271e8be1f52b', category: 'clothing' },
  { name: 'נעלי ריצה', brand: 'Adidas', price: 380, img: 'photo-1542291026-7eec264c27ff', category: 'shoes' },
]

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

export const GALLERY_LAST_SCANNED = 'היום בשעה 08:14'
export const GALLERY_NEXT_SCAN    = 'בעוד 6 ימים (יום ב׳)'

export const scanHistory = [
  {
    date: 'היום', time: '08:14', top: 'M', bottom: '32', fit: 'Slim Fit', confidence: 97,
    thumb: 'photo-1507003211169-0a1dd7228f2d',
    source: 'סריקת גלריה שבועית',
    isWeekly: true, delta: null as Record<string, string> | null,
  },
  {
    date: 'לפני 7 ימים', time: '09:15', top: 'M', bottom: '32', fit: 'Regular', confidence: 94,
    thumb: 'photo-1500648767791-00dcc994a43e',
    source: 'סריקת גלריה שבועית',
    isWeekly: true, delta: null as Record<string, string> | null,
  },
  {
    date: 'לפני חודש', time: '18:44', top: 'L', bottom: '34', fit: 'Slim Fit', confidence: 89,
    thumb: 'photo-1506794778202-cad84cf45f1d',
    source: 'העלאה ידנית',
    isWeekly: false, delta: { top: 'L → M', bottom: '34 → 32' } as Record<string, string>,
  },
]
