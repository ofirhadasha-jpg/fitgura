import type { ScanEntry, ScannedSizes, BodyMetrics, AIBodyAnalysis } from '../types'
import { aiAnalysisToScannedSizes, analyzeBodyImage, computeDelta, formatTimestamp, nextScanId } from '../types'
import { supabase } from '../lib/supabase'

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

function mergeBodyMetrics(prev: BodyMetrics | null, next: BodyMetrics | null): BodyMetrics | null {
  if (!prev) return next
  if (!next) return prev
  const avg = (a: number | null, b: number | null): number | null => {
    if (a == null) return b
    if (b == null) return a
    return Math.round(((a + b) / 2) * 10) / 10
  }
  return {
    estimated_height_cm: avg(prev.estimated_height_cm, next.estimated_height_cm),
    estimated_weight_kg: avg(prev.estimated_weight_kg, next.estimated_weight_kg),
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
): Promise<SizingAnalysisResult> {
  const { analysis, preview } = await analyzeBodyImage(file)
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
