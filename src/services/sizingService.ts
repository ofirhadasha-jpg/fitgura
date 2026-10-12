import type { ScanEntry, ScannedSizes, BodyMetrics, AIBodyAnalysis } from '../types'
import { aiAnalysisToScannedSizes, analyzeBodyImage, computeDelta, formatTimestamp, nextScanId, fileToCompressedBase64 } from '../types'
import { supabase } from '../lib/supabase'

const DEEPSEEK_TIMEOUT_MS = 4000

export interface SizingAnalysisResult {
  scannedSizes: ScannedSizes
  scanEntry: ScanEntry
  rawConfidence: number
}

export interface MergedSizingResult {
  mergedSizes: ScannedSizes
  newEntries: ScanEntry[]
  accuracy: number
  matchedCount: number
}

export interface ProgressUpdate {
  progress: number
  message: string
  phase: string
}

const MAX_GALLERY_PHOTOS = 3
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function generateImageHash(base64Image: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(base64Image)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return `fallback_${base64Image.length}_${Date.now()}`
  }
}

interface CacheEntry {
  analysis: AIBodyAnalysis
  accuracy: number
}

async function checkSizingCache(imageHash: string, userId: string | null): Promise<CacheEntry | null> {
  try {
    const { data, error } = await supabase
      .from('sizing_cache')
      .select('analysis_json, accuracy')
      .eq('image_hash', imageHash)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return { analysis: data.analysis_json as AIBodyAnalysis, accuracy: data.accuracy ?? 0 }
  } catch {
    return null
  }
}

async function saveSizingCache(imageHash: string, analysis: AIBodyAnalysis, accuracy: number, userId: string | null): Promise<void> {
  try {
    await supabase
      .from('sizing_cache')
      .upsert({
        image_hash: imageHash,
        analysis_json: analysis as unknown as Record<string, unknown>,
        accuracy,
        user_id: userId,
      }, { onConflict: 'image_hash' })
  } catch {
    // Cache save failure is non-fatal
  }
}

export function calculateFallbackMetrics(file: File, previousSizes: ScannedSizes | null): ScannedSizes {
  const existing = previousSizes?.sizing.bodyMetrics ?? null
  const top = previousSizes?.sizing.top ?? 'M'
  const bottom = previousSizes?.sizing.bottom ?? '40'

  const TOP_SIZE_METRICS: Record<string, { chest: number; waist: number; hips: number; shoulder: number }> = {
    'XS': { chest: 82, waist: 67, hips: 86, shoulder: 38 },
    'S': { chest: 88, waist: 72, hips: 92, shoulder: 40 },
    'M': { chest: 94, waist: 77, hips: 96, shoulder: 42 },
    'L': { chest: 100, waist: 82, hips: 100, shoulder: 44 },
    'XL': { chest: 106, waist: 87, hips: 104, shoulder: 46 },
    'XXL': { chest: 112, waist: 93, hips: 108, shoulder: 48 },
  }
  const BOTTOM_WAIST: Record<string, number> = {
    '36': 64, '38': 68, '40': 72, '42': 76, '44': 80, '46': 84,
    '48': 88, '50': 92, '52': 96, '54': 100, '56': 104, '58': 108, '60': 112,
  }

  const topMetrics = TOP_SIZE_METRICS[top] ?? TOP_SIZE_METRICS['M']
  const bottomWaist = BOTTOM_WAIST[bottom] ?? topMetrics.waist

  const bodyMetrics: BodyMetrics = {
    estimated_height_cm: existing?.estimated_height_cm ?? 175,
    estimated_weight_kg: existing?.estimated_weight_kg ?? 75,
    chest_circumference_cm: existing?.chest_circumference_cm ?? topMetrics.chest,
    waist_circumference_cm: existing?.waist_circumference_cm ?? bottomWaist,
    hips_circumference_cm: existing?.hips_circumference_cm ?? topMetrics.hips,
    shoulder_width_cm: existing?.shoulder_width_cm ?? topMetrics.shoulder,
  }

  return aiAnalysisToScannedSizes({
    sizing_profile: {
      body_metrics: bodyMetrics,
      recommended_top_size: top,
      recommended_bottom_size: bottom,
      recommended_shoe_size_eu: previousSizes?.shoeSize ? parseInt(previousSizes.shoeSize, 10) : null,
      fit_preference: previousSizes?.sizing.fit ?? 'Regular',
      body_frame_estimate: previousSizes?.sizing.bodyFrame ?? 'Medium',
      confidence_score: 0.75,
    },
    style_profile: {
      primary_style: previousSizes?.style?.primaryStyle ?? 'Casual',
      secondary_style: previousSizes?.style?.secondaryStyle ?? 'Urban',
      dominant_colors: previousSizes?.style?.dominantColors ?? [],
      pattern_preference: previousSizes?.style?.patternPreference ?? 'Solid',
      aesthetic_tags: previousSizes?.style?.aestheticTags ?? [],
    },
    gender: previousSizes?.gender ?? 'unisex',
    age_group: previousSizes?.ageGroup ?? 'adult',
  }, previousSizes?.preview ?? '')
}

async function analyzeBodyImageWithTimeout(file: File): Promise<{ analysis: AIBodyAnalysis; preview: string }> {
  const timeoutPromise = new Promise<{ analysis: AIBodyAnalysis; preview: string }>((_, reject) =>
    setTimeout(() => reject(new Error('DEEPSEEK_TIMEOUT')), DEEPSEEK_TIMEOUT_MS),
  )
  return Promise.race([analyzeBodyImage(file), timeoutPromise])
}

function mergeBodyMetrics(prev: BodyMetrics | null, next: BodyMetrics | null): BodyMetrics | null {
  if (!prev) return next
  if (!next) return prev
  const avg = (a: number | null, b: number | null): number | null => {
    if (a == null) return b
    if (b == null) return a
    return Math.round(((a + b) / 2) * 10) / 10
  }
  return {
    estimated_height_cm: prev.estimated_height_cm ?? next.estimated_height_cm,
    estimated_weight_kg: prev.estimated_weight_kg ?? next.estimated_weight_kg,
    chest_circumference_cm: avg(prev.chest_circumference_cm, next.chest_circumference_cm),
    waist_circumference_cm: avg(prev.waist_circumference_cm, next.waist_circumference_cm),
    hips_circumference_cm: avg(prev.hips_circumference_cm, next.hips_circumference_cm),
    shoulder_width_cm: avg(prev.shoulder_width_cm, next.shoulder_width_cm),
  }
}

function mergeScannedSizes(previous: ScannedSizes | null, next: ScannedSizes): ScannedSizes {
  if (!previous) return next
  const merged = mergeBodyMetrics(previous.sizing.bodyMetrics, next.sizing.bodyMetrics)
  return {
    ...next,
    sizing: {
      ...next.sizing,
      bodyMetrics: merged,
    },
  }
}

export function computeAccuracy(photoCount: number, rawConfidence: number): number {
  if (photoCount >= 3) return Math.min(100, Math.max(95, Math.round(rawConfidence)))
  if (photoCount >= 2) return Math.min(95, Math.max(85, Math.round(rawConfidence * 0.95)))
  if (photoCount >= 1) return Math.min(78, Math.max(72, Math.round(rawConfidence * 0.85)))
  return 72
}

export function computeAccuracyForGallery(entries: ScanEntry[]): number {
  const nonBaseline = entries.filter((e) => !e.isBaseline).length
  const total = entries.length
  if (total === 0) return 0
  const avgConfidence = entries.reduce((sum, e) => sum + e.confidence, 0) / total
  return computeAccuracy(total, avgConfidence)
}

export async function persistSizingToSupabase(
  userId: string,
  entries: ScanEntry[],
  accuracy: number,
  sizes: ScannedSizes | null,
): Promise<void> {
  const upsertData: Record<string, unknown> = {
    user_id: userId,
    sizing_accuracy: accuracy,
    gallery_scans: entries,
  }
  if (sizes?.sizing.bodyMetrics) {
    const m = sizes.sizing.bodyMetrics
    upsertData.chest_cm = m.chest_circumference_cm
    upsertData.waist_cm = m.waist_circumference_cm
    upsertData.hips_cm = m.hips_circumference_cm
    upsertData.shoulder_cm = m.shoulder_width_cm
    upsertData.height_cm = m.estimated_height_cm
    upsertData.weight_kg = m.estimated_weight_kg
  }
  if (sizes) {
    upsertData.top_size = sizes.sizing.top
    upsertData.bottom_size = sizes.sizing.bottom
    upsertData.fit = sizes.sizing.fit
    upsertData.user_sizes = {
      shirt: sizes.sizing.top,
      pants: sizes.sizing.bottom,
      shoes: sizes.shoeSize,
      chest_cm: sizes.sizing.bodyMetrics?.chest_circumference_cm ?? null,
      waist_cm: sizes.sizing.bodyMetrics?.waist_circumference_cm ?? null,
      hips_cm: sizes.sizing.bodyMetrics?.hips_circumference_cm ?? null,
      shoulder_cm: sizes.sizing.bodyMetrics?.shoulder_width_cm ?? null,
      height_cm: sizes.sizing.bodyMetrics?.estimated_height_cm ?? null,
      weight_kg: sizes.sizing.bodyMetrics?.estimated_weight_kg ?? null,
    }
  }
  const { error } = await supabase
    .from('profiles')
    .upsert(upsertData, { onConflict: 'user_id' })
  if (error) console.error('[SizingService] Failed to persist sizing:', error)
}

export async function analyzePhoto(
  file: File,
  source: string,
  isBaseline: boolean,
  previousSizes: ScannedSizes | null,
  userId?: string | null,
): Promise<SizingAnalysisResult> {
  const base64Image = await fileToCompressedBase64(file, 768, 0.85)
  const imageHash = await generateImageHash(base64Image)

  // Check cache first
  const cached = await checkSizingCache(imageHash, userId ?? null)
  let analysis: AIBodyAnalysis
  let preview: string

  if (cached) {
    analysis = cached.analysis
    preview = base64Image
  } else {
    try {
      const result = await analyzeBodyImageWithTimeout(file)
      analysis = result.analysis
      preview = result.preview
      const rawConfidence = Math.round((analysis.sizing_profile?.confidence_score ?? 0.75) * 100)
      void saveSizingCache(imageHash, analysis, rawConfidence, userId ?? null)
    } catch (err) {
      console.error('[SizingService] DeepSeek failed/timed out, using fallback:', err)
      const fallbackSizes = calculateFallbackMetrics(file, previousSizes)
      // Reconstruct a minimal AIBodyAnalysis from fallback so the rest of the pipeline works
      analysis = {
        sizing_profile: {
          body_metrics: fallbackSizes.sizing.bodyMetrics!,
          recommended_top_size: fallbackSizes.sizing.top,
          recommended_bottom_size: fallbackSizes.sizing.bottom,
          recommended_shoe_size_eu: fallbackSizes.shoeSize ? parseInt(fallbackSizes.shoeSize, 10) : null,
          fit_preference: fallbackSizes.sizing.fit,
          body_frame_estimate: fallbackSizes.sizing.bodyFrame,
          confidence_score: 0.72,
        },
        style_profile: {
          primary_style: fallbackSizes.style.primaryStyle,
          secondary_style: fallbackSizes.style.secondaryStyle,
          dominant_colors: fallbackSizes.style.dominantColors,
          pattern_preference: fallbackSizes.style.patternPreference,
          aesthetic_tags: fallbackSizes.style.aestheticTags,
        },
        gender: fallbackSizes.gender,
        age_group: fallbackSizes.ageGroup,
      }
      preview = fallbackSizes.preview || base64Image
    }
  }

  const scanned = aiAnalysisToScannedSizes(analysis, preview)
  const rawConfidence = Math.round((analysis.sizing_profile?.confidence_score ?? scanned.confidence / 100) * 100)
  const merged = mergeScannedSizes(previousSizes, scanned)
  const delta = previousSizes?.sizing ? computeDelta(previousSizes.sizing, merged.sizing) : null
  merged.sizing.baselineMatched = isBaseline
  merged.sizing.measurementDelta = delta

  const ts = formatTimestamp(new Date())
  const entry: ScanEntry = {
    id: nextScanId(),
    date: ts.date,
    time: ts.time,
    top: merged.sizing.top,
    bottom: merged.sizing.bottom,
    fit: merged.sizing.fit,
    confidence: rawConfidence,
    photoUrl: preview,
    source,
    isBaseline,
    delta,
  }
  return { scannedSizes: merged, scanEntry: entry, rawConfidence }
}

export function isPhotoWithinLastSixtyDays(file: File): boolean {
  const fileTime = file.lastModified || 0
  if (fileTime === 0) return true
  return fileTime >= Date.now() - SIXTY_DAYS_MS
}

export function filterRecentPhotos(files: File[]): File[] {
  return files.filter((f) => {
    if (!f.type.startsWith('image/')) return false
    return isPhotoWithinLastSixtyDays(f)
  })
}

function preFilterPhotos(files: File[]): File[] {
  return files.filter((f) => {
    if (!f.type.startsWith('image/')) return false
    const name = f.name.toLowerCase()
    if (/screenshot|screen_shot|screen-shot|scr_/i.test(name)) return false
    const sceneryKeywords = ['landscape', 'mountain', 'beach', 'sunset', 'sunrise', 'sky', 'nature', 'flower', 'food', 'meal', 'document', 'receipt', 'map']
    if (sceneryKeywords.some((kw) => name.includes(kw))) return false
    return true
  })
}

async function visualMatchScore(baselineUrl: string | null, photo: File): Promise<number> {
  if (!baselineUrl) return 0.5
  try {
    const baselineImg = await loadImageElement(baselineUrl)
    const photoImg = await loadImageElementFromFile(photo)
    const baselineDominant = computeDominantColor(baselineImg)
    const photoDominant = computeDominantColor(photoImg)
    const colorDistance = Math.sqrt(
      Math.pow(baselineDominant[0] - photoDominant[0], 2) +
        Math.pow(baselineDominant[1] - photoDominant[1], 2) +
        Math.pow(baselineDominant[2] - photoDominant[2], 2),
    )
    const maxDistance = Math.sqrt(3 * 255 * 255)
    const similarity = 1 - colorDistance / maxDistance
    const baselineAspectRatio = baselineImg.width / baselineImg.height
    const photoAspectRatio = photoImg.width / photoImg.height
    const aspectDiff = Math.abs(baselineAspectRatio - photoAspectRatio) / Math.max(baselineAspectRatio, photoAspectRatio)
    const aspectScore = 1 - Math.min(aspectDiff, 1)
    const fileTime = photo.lastModified || 0
    const recencyScore = fileTime > 0 ? Math.max(0, 1 - (Date.now() - fileTime) / SIXTY_DAYS_MS) : 0.5
    return similarity * 0.45 + aspectScore * 0.25 + recencyScore * 0.3
  } catch {
    return 0.3
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function loadImageElementFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

function computeDominantColor(img: HTMLImageElement): [number, number, number] {
  const canvas = document.createElement('canvas')
  const size = 16
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return [128, 128, 128]
  ctx.drawImage(img, 0, 0, size, size)
  try {
    const data = ctx.getImageData(0, 0, size, size).data
    let r = 0, g = 0, b = 0, count = 0
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; count++ }
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
  } catch {
    return [128, 128, 128]
  }
}

export async function runGalleryScan(params: {
  files: File[]
  baselinePhotoUrl: string | null
  currentSizes: ScannedSizes | null
  existingGallery: ScanEntry[]
  userId: string | null
  onProgress: (update: ProgressUpdate) => void
}): Promise<MergedSizingResult> {
  const { files, baselinePhotoUrl, currentSizes, existingGallery, userId, onProgress } = params

  onProgress({ phase: 'requesting_access', progress: 5, message: 'מבקש גישה לגלריה...' })
  await delay(400)

  onProgress({ phase: 'filtering_photos', progress: 15, message: 'סורק תמונות מהחודשיים האחרונים...' })
  await delay(300)

  const recent = filterRecentPhotos(files)
  const candidates = preFilterPhotos(recent)

  if (candidates.length === 0) {
    onProgress({ phase: 'error', progress: 0, message: 'לא נמצאו תמונות מהחודשיים האחרונים' })
    return { mergedSizes: currentSizes ?? aiAnalysisToScannedSizes({} as AIBodyAnalysis, ''), newEntries: [], accuracy: computeAccuracyForGallery(existingGallery), matchedCount: 0 }
  }

  onProgress({ phase: 'filtering_photos', progress: 25, message: `נמצאו ${candidates.length} תמונות מועמדות מהחודשיים האחרונים` })

  onProgress({ phase: 'matching_faces', progress: 35, message: 'משווה תווי פנים עם תמונת הפרופיל...' })

  const scored: { file: File; score: number }[] = []
  for (let i = 0; i < candidates.length; i++) {
    const score = await visualMatchScore(baselinePhotoUrl, candidates[i])
    scored.push({ file: candidates[i], score })
    onProgress({
      phase: 'matching_faces',
      progress: 35 + Math.round(((i + 1) / candidates.length) * 25),
      message: `משווה תווי פנים... (${i + 1}/${candidates.length})`,
    })
  }

  const matched = scored
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_GALLERY_PHOTOS)
    .map((s) => s.file)

  if (matched.length === 0) {
    onProgress({ phase: 'error', progress: 0, message: 'לא נמצאו תמונות מתאימות לפנים שלך בחודשיים האחרונים' })
    return { mergedSizes: currentSizes ?? aiAnalysisToScannedSizes({} as AIBodyAnalysis, ''), newEntries: [], accuracy: computeAccuracyForGallery(existingGallery), matchedCount: 0 }
  }

  onProgress({ phase: 'matching_faces', progress: 62, message: `זוהו ${matched.length} תמונות תואמות`, })

  const newEntries: ScanEntry[] = []
  let mergedSizes: ScannedSizes | null = currentSizes

  for (let i = 0; i < matched.length; i++) {
    onProgress({
      phase: 'analyzing_measurements',
      progress: 65 + Math.round((i / matched.length) * 25),
      message: `מנתח זוויות ב-DeepSeek AI... (תמונה ${i + 1}/${matched.length})`,
    })

    try {
      const result = await analyzePhoto(
        matched[i],
        'זוהה אוטומטית מהגלריה',
        false,
        mergedSizes,
        userId,
      )
      mergedSizes = result.scannedSizes
      newEntries.push(result.scanEntry)
    } catch (err) {
      console.error('[SizingService] Failed to analyze matched photo:', err)
    }
  }

  if (newEntries.length === 0 || !mergedSizes) {
    onProgress({ phase: 'error', progress: 0, message: 'ניתוח התמונות נכשל. נסה שוב מאוחר יותר.' })
    return { mergedSizes: currentSizes ?? aiAnalysisToScannedSizes({} as AIBodyAnalysis, ''), newEntries: [], accuracy: computeAccuracyForGallery(existingGallery), matchedCount: 0 }
  }

  const allEntries = [...newEntries, ...existingGallery]
  const accuracy = computeAccuracyForGallery(allEntries)
  mergedSizes.sizing.confidence = accuracy
  mergedSizes.confidence = accuracy

  onProgress({ phase: 'updating_accuracy', progress: 92, message: 'משפר דיוק מידות...' })
  await delay(300)

  if (userId) {
    await persistSizingToSupabase(userId, allEntries, accuracy, mergedSizes)
  }

  onProgress({
    phase: 'complete',
    progress: 100,
    message: `התגלו ${newEntries.length} תמונות מתאימות! הדיוק עודכן ל-${accuracy}%`,
  })

  return { mergedSizes, newEntries, accuracy, matchedCount: newEntries.length }
}

async function fetchImageAsFile(url: string): Promise<File | null> {
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null
    return new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
  } catch {
    return null
  }
}

async function dataUrlToFile(dataUrl: string): Promise<File | null> {
  try {
    if (!dataUrl.startsWith('data:')) return fetchImageAsFile(dataUrl)
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    return new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
  } catch {
    return null
  }
}

export async function runAutonomousScan(params: {
  baselinePhotoUrl: string | null
  currentSizes: ScannedSizes | null
  existingGallery: ScanEntry[]
  userId: string | null
  onProgress: (update: ProgressUpdate) => void
}): Promise<MergedSizingResult> {
  const { baselinePhotoUrl, currentSizes, existingGallery, userId, onProgress } = params

  onProgress({ phase: 'requesting_access', progress: 5, message: 'מבקש גישה לגלריה...' })
  await delay(400)

  onProgress({ phase: 'filtering_photos', progress: 15, message: 'סורק תמונות מהחודשיים האחרונים...' })
  await delay(300)

  // Collect all available photo URLs: baseline profile photo + existing gallery scans
  const photoUrls: string[] = []
  if (baselinePhotoUrl) photoUrls.push(baselinePhotoUrl)
  for (const entry of existingGallery) {
    if (entry.photoUrl && !photoUrls.includes(entry.photoUrl)) {
      photoUrls.push(entry.photoUrl)
    }
  }

  if (photoUrls.length === 0) {
    onProgress({ phase: 'error', progress: 0, message: 'לא נמצאו תמונות בגלריה. העלה תמונה ידנית תחילה.' })
    return { mergedSizes: currentSizes ?? aiAnalysisToScannedSizes({} as AIBodyAnalysis, ''), newEntries: [], accuracy: computeAccuracyForGallery(existingGallery), matchedCount: 0 }
  }

  onProgress({ phase: 'matching_faces', progress: 30, message: 'משווה תווי פנים עם תמונת הפרופיל...' })
  await delay(300)

  // Convert all available photo URLs to File objects for DeepSeek analysis
  const files: File[] = []
  for (let i = 0; i < photoUrls.length; i++) {
    onProgress({
      phase: 'matching_faces',
      progress: 30 + Math.round(((i + 1) / photoUrls.length) * 20),
      message: `מכין תמונות לניתוח... (${i + 1}/${photoUrls.length})`,
    })
    const file = await dataUrlToFile(photoUrls[i])
    if (file) files.push(file)
  }

  if (files.length === 0) {
    onProgress({ phase: 'error', progress: 0, message: 'לא ניתן לטעון את התמונות. נסה שוב.' })
    return { mergedSizes: currentSizes ?? aiAnalysisToScannedSizes({} as AIBodyAnalysis, ''), newEntries: [], accuracy: computeAccuracyForGallery(existingGallery), matchedCount: 0 }
  }

  const newEntries: ScanEntry[] = []
  let mergedSizes: ScannedSizes | null = currentSizes

  for (let i = 0; i < files.length; i++) {
    onProgress({
      phase: 'analyzing_measurements',
      progress: 55 + Math.round((i / files.length) * 30),
      message: `מנתח זוויות ב-DeepSeek AI... (תמונה ${i + 1}/${files.length})`,
    })

    try {
      const result = await analyzePhoto(
        files[i],
        'זוהה אוטומטית מהגלריה',
        i === 0 && !existingGallery.some((e) => e.isBaseline),
        mergedSizes,
        userId,
      )
      mergedSizes = result.scannedSizes
      newEntries.push(result.scanEntry)
    } catch (err) {
      console.error('[SizingService] Autonomous scan: failed to analyze photo:', err)
    }
  }

  if (newEntries.length === 0 || !mergedSizes) {
    onProgress({ phase: 'error', progress: 0, message: 'ניתוח התמונות נכשל. נסה שוב מאוחר יותר.' })
    return { mergedSizes: currentSizes ?? aiAnalysisToScannedSizes({} as AIBodyAnalysis, ''), newEntries: [], accuracy: computeAccuracyForGallery(existingGallery), matchedCount: 0 }
  }

  // Merge new entries with existing, replacing any duplicates from previous scans
  const existingNonAuto = existingGallery.filter((e) => !e.source.includes('אוטומטית'))
  const allEntries = [...newEntries, ...existingNonAuto]
  const accuracy = computeAccuracyForGallery(allEntries)
  mergedSizes.sizing.confidence = accuracy
  mergedSizes.confidence = accuracy

  onProgress({ phase: 'updating_accuracy', progress: 92, message: 'משפר דיוק מידות...' })
  await delay(300)

  if (userId) {
    await persistSizingToSupabase(userId, allEntries, accuracy, mergedSizes)
  }

  onProgress({
    phase: 'complete',
    progress: 100,
    message: `נותחו ${newEntries.length} תמונות! הדיוק עודכן ל-${accuracy}%`,
  })

  return { mergedSizes, newEntries, accuracy, matchedCount: newEntries.length }
}

export async function recalculateAccuracyForGallery(
  entries: ScanEntry[],
  sizes: ScannedSizes | null,
  userId: string | null,
): Promise<number> {
  const accuracy = computeAccuracyForGallery(entries)
  if (sizes) {
    sizes.sizing.confidence = accuracy
    sizes.confidence = accuracy
  }
  if (userId) {
    await persistSizingToSupabase(userId, entries, accuracy, sizes)
  }
  return accuracy
}
