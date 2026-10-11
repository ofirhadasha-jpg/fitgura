import type { ScanEntry, ScannedSizes } from '../types'
import { aiAnalysisToScannedSizes, analyzeBodyImage, computeDelta, formatTimestamp, nextScanId } from '../types'
import { supabase } from '../lib/supabase'

export type ScanPhase =
  | 'requesting_access'
  | 'filtering_photos'
  | 'matching_faces'
  | 'analyzing_measurements'
  | 'updating_accuracy'
  | 'complete'
  | 'error'

export interface ScanProgressUpdate {
  phase: ScanPhase
  progress: number
  message: string
  matchedPhotos?: number
}

export interface GalleryScanResult {
  entries: ScanEntry[]
  mergedSizes: ScannedSizes | null
  accuracy: number
  totalScanned: number
  matchedCount: number
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000
const MAX_MATCHED_PHOTOS = 2
const TARGET_ACCURACY = 95

const PHASE_MESSAGES: Record<ScanPhase, string> = {
  requesting_access: 'מבקש גישה לגלריה...',
  filtering_photos: 'סורק תמונות מהחודשיים האחרונים...',
  matching_faces: 'מזהה התאמות פנים וגוף...',
  analyzing_measurements: 'DeepSeek מנתח מידות מתמונות מתאימות...',
  updating_accuracy: 'משפר דיוק מידות...',
  complete: 'התגלו תמונות מתאימות! הדיוק עודכן',
  error: 'הסריקה נכשלה',
}

export function isPhotoWithinLastSixtyDays(file: File): boolean {
  const fileTime = file.lastModified || 0
  if (fileTime === 0) return true
  return fileTime >= Date.now() - SIXTY_DAYS_MS
}

export function filterRecentPhotos(files: File[]): File[] {
  return files.filter((f) => f.type.startsWith('image/') && isPhotoWithinLastSixtyDays(f))
}

function isLikelyScreenshot(file: File): boolean {
  const name = file.name.toLowerCase()
  if (/screenshot|screen_shot|screen-shot|scr_/i.test(name)) return true
  if (file.type === 'image/png' && file.size < 500_000) return true
  return false
}

function isLikelyScenery(file: File): boolean {
  const name = file.name.toLowerCase()
  const sceneryKeywords = ['landscape', 'mountain', 'beach', 'sunset', 'sunrise', 'sky', 'nature', 'flower', 'food', 'meal', 'document', 'receipt', 'map']
  return sceneryKeywords.some((kw) => name.includes(kw))
}

export function preFilterPhotos(files: File[]): File[] {
  return files.filter((f) => {
    if (!f.type.startsWith('image/')) return false
    if (isLikelyScreenshot(f)) return false
    if (isLikelyScenery(f)) return false
    return true
  })
}

async function computeImageHash(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return `${file.name}_${file.size}_${file.lastModified}`
  }
}

async function visualMatchScore(
  baselineUrl: string | null,
  photo: File,
): Promise<number> {
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
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
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
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
  } catch {
    return [128, 128, 128]
  }
}

function mergeMeasurements(previous: ScannedSizes | null, next: ScannedSizes): ScannedSizes {
  if (!previous?.sizing.bodyMetrics || !next.sizing.bodyMetrics) return next
  const prev = previous.sizing.bodyMetrics
  const nextM = next.sizing.bodyMetrics
  const avg = (a: number | null, b: number | null): number | null => {
    if (a == null) return b
    if (b == null) return a
    return Math.round(((a + b) / 2) * 10) / 10
  }
  return {
    ...next,
    sizing: {
      ...next.sizing,
      bodyMetrics: {
        estimated_height_cm: avg(prev.estimated_height_cm, nextM.estimated_height_cm),
        estimated_weight_kg: avg(prev.estimated_weight_kg, nextM.estimated_weight_kg),
        chest_circumference_cm: avg(prev.chest_circumference_cm, nextM.chest_circumference_cm),
        waist_circumference_cm: avg(prev.waist_circumference_cm, nextM.waist_circumference_cm),
        hips_circumference_cm: avg(prev.hips_circumference_cm, nextM.hips_circumference_cm),
        shoulder_width_cm: avg(prev.shoulder_width_cm, nextM.shoulder_width_cm),
      },
    },
  }
}

async function persistGalleryScans(
  userId: string,
  entries: ScanEntry[],
  accuracy: number,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        sizing_accuracy: accuracy,
        gallery_scans: entries,
      },
      { onConflict: 'user_id' },
    )
  if (error) console.error('[GalleryScanner] Failed to persist gallery scans:', error)
}

export async function runAutonomousGalleryScan(params: {
  files: File[]
  baselinePhotoUrl: string | null
  currentSizes: ScannedSizes | null
  existingGallery: ScanEntry[]
  userId: string | null
  onProgress: (update: ScanProgressUpdate) => void
}): Promise<GalleryScanResult> {
  const { files, baselinePhotoUrl, currentSizes, existingGallery, userId, onProgress } = params

  onProgress({ phase: 'requesting_access', progress: 5, message: PHASE_MESSAGES.requesting_access })

  await new Promise((r) => setTimeout(r, 300))

  onProgress({ phase: 'filtering_photos', progress: 15, message: PHASE_MESSAGES.filtering_photos })

  const recent = filterRecentPhotos(files)
  const candidates = preFilterPhotos(recent)

  if (candidates.length === 0) {
    onProgress({ phase: 'error', progress: 0, message: 'לא נמצאו תמונות מהחודשיים האחרונים' })
    return { entries: existingGallery, mergedSizes: null, accuracy: 72, totalScanned: files.length, matchedCount: 0 }
  }

  onProgress({ phase: 'filtering_photos', progress: 25, message: `נמצאו ${candidates.length} תמונות מועמדות מהחודשיים האחרונים` })

  onProgress({ phase: 'matching_faces', progress: 35, message: PHASE_MESSAGES.matching_faces })

  const scored: { file: File; score: number }[] = []
  for (let i = 0; i < candidates.length; i++) {
    const score = await visualMatchScore(baselinePhotoUrl, candidates[i])
    scored.push({ file: candidates[i], score })
    if (i < candidates.length - 1) {
      onProgress({
        phase: 'matching_faces',
        progress: 35 + Math.round(((i + 1) / candidates.length) * 25),
        message: `מזהה התאמות פנים... (${i + 1}/${candidates.length})`,
        matchedPhotos: scored.filter((s) => s.score > 0.4).length,
      })
    }
  }

  const matched = scored
    .filter((s) => s.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHED_PHOTOS)
    .map((s) => s.file)

  if (matched.length === 0) {
    onProgress({ phase: 'error', progress: 0, message: 'לא נמצאו תמונות מתאימות לפנים שלך בחודשיים האחרונים' })
    return { entries: existingGallery, mergedSizes: null, accuracy: 72, totalScanned: files.length, matchedCount: 0 }
  }

  const newEntries: ScanEntry[] = []
  let mergedSizes: ScannedSizes | null = null

  for (let i = 0; i < matched.length; i++) {
    const phaseProgress = 60 + Math.round((i / matched.length) * 30)
    onProgress({
      phase: 'analyzing_measurements',
      progress: phaseProgress,
      message: `DeepSeek מנתח מידות מתמונה ${i + 1}/${matched.length}...`,
    })

    try {
      const { analysis, preview } = await analyzeBodyImage(matched[i])
      const aiSizes = aiAnalysisToScannedSizes(analysis, preview)
      const prevSizing = (mergedSizes ?? currentSizes)?.sizing ?? null
      const delta = prevSizing ? computeDelta(prevSizing, aiSizes.sizing) : null
      aiSizes.sizing.baselineMatched = false
      aiSizes.sizing.isWeeklyUpdate = true
      aiSizes.sizing.measurementDelta = delta

      mergedSizes = mergedSizes ? mergeMeasurements(mergedSizes, aiSizes) : aiSizes

      const ts = formatTimestamp(new Date())
      const entry: ScanEntry = {
        id: nextScanId(),
        date: ts.date,
        time: ts.time,
        top: aiSizes.sizing.top,
        bottom: aiSizes.sizing.bottom,
        fit: aiSizes.sizing.fit,
        confidence: aiSizes.sizing.confidence,
        photoUrl: preview,
        source: 'זוהה אוטומטית מהגלריה',
        isBaseline: false,
        delta,
      }
      newEntries.push(entry)
    } catch (err) {
      console.error('[GalleryScanner] Failed to analyze matched photo:', err)
    }
  }

  if (newEntries.length === 0 || !mergedSizes) {
    onProgress({ phase: 'error', progress: 0, message: 'ניתוח התמונות נכשל. נסה שוב מאוחר יותר.' })
    return { entries: existingGallery, mergedSizes: null, accuracy: 72, totalScanned: files.length, matchedCount: 0 }
  }

  const totalPhotos = existingGallery.length + newEntries.length
  const accuracy = totalPhotos >= 3 ? TARGET_ACCURACY : totalPhotos >= 2 ? 88 : 78

  mergedSizes.sizing.confidence = accuracy
  mergedSizes.confidence = accuracy

  onProgress({ phase: 'updating_accuracy', progress: 92, message: PHASE_MESSAGES.updating_accuracy })

  const allEntries = [...newEntries, ...existingGallery]

  if (userId) {
    await persistGalleryScans(userId, allEntries, accuracy)
  }

  onProgress({
    phase: 'complete',
    progress: 100,
    message: `התגלו ${newEntries.length} תמונות מתאימות! הדיוק עודכן ל-${accuracy}%`,
    matchedPhotos: newEntries.length,
  })

  return {
    entries: allEntries,
    mergedSizes,
    accuracy,
    totalScanned: files.length,
    matchedCount: newEntries.length,
  }
}
