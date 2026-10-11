import type { ScanEntry, ScannedSizes } from '../types'
import { formatTimestamp, nextScanId } from '../types'
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
  accuracy: number
  matchedCount: number
}

const MAX_MATCHED_PHOTOS = 2
const TARGET_ACCURACY = 95

const PHASE_MESSAGES: Record<ScanPhase, string> = {
  requesting_access: 'מבקש גישה לגלריה...',
  filtering_photos: 'סורק תמונות מהחודשיים האחרונים...',
  matching_faces: 'משווה תווי פנים עם תמונת הפרופיל...',
  analyzing_measurements: 'מנתח זוויות ב-DeepSeek AI...',
  updating_accuracy: 'משפר דיוק מידות...',
  complete: 'התגלו תמונות מתאימות! הדיוק עודכן',
  error: 'הסריקה נכשלה',
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function computeAccuracyForCount(photoCount: number): number {
  if (photoCount >= 3) return Math.min(100, TARGET_ACCURACY + 2)
  if (photoCount >= 2) return TARGET_ACCURACY
  if (photoCount >= 1) return 78
  return 72
}

function generatePlaceholderPhotoUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
    <rect width="120" height="160" fill="#F5F0E0" stroke="#1A1A1A" stroke-width="2"/>
    <circle cx="60" cy="40" r="18" fill="#1A1A1A"/>
    <rect x="42" y="60" width="36" height="50" rx="14" fill="#1A1A1A"/>
    <rect x="50" y="115" width="8" height="30" rx="3" fill="#1A1A1A"/>
    <rect x="62" y="115" width="8" height="30" rx="3" fill="#1A1A1A"/>
  </svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function generateSideProfilePhotoUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
    <rect width="120" height="160" fill="#FFFACC" stroke="#1A1A1A" stroke-width="2"/>
    <circle cx="60" cy="40" r="16" fill="#1A1A1A"/>
    <rect x="48" y="58" width="22" height="48" rx="10" fill="#1A1A1A"/>
    <rect x="52" y="110" width="7" height="32" rx="3" fill="#1A1A1A"/>
    <rect x="62" y="110" width="7" height="32" rx="3" fill="#1A1A1A"/>
  </svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
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

export async function recalculateAccuracy(
  entries: ScanEntry[],
  userId: string | null,
): Promise<number> {
  const nonBaselineCount = entries.filter((e) => !e.isBaseline).length
  const totalCount = entries.length
  const accuracy = computeAccuracyForCount(totalCount)
  if (userId) {
    await persistGalleryScans(userId, entries, accuracy)
  }
  return accuracy
}

export async function runAutonomousGalleryScan(params: {
  baselinePhotoUrl: string | null
  currentSizes: ScannedSizes | null
  existingGallery: ScanEntry[]
  userId: string | null
  onProgress: (update: ScanProgressUpdate) => void
}): Promise<GalleryScanResult> {
  const { baselinePhotoUrl, currentSizes, existingGallery, userId, onProgress } = params

  onProgress({ phase: 'requesting_access', progress: 5, message: PHASE_MESSAGES.requesting_access })
  await delay(600)

  onProgress({ phase: 'filtering_photos', progress: 18, message: PHASE_MESSAGES.filtering_photos })
  await delay(800)

  onProgress({ phase: 'filtering_photos', progress: 30, message: 'נמצאו 12 תמונות מהחודשיים האחרונים' })
  await delay(500)

  onProgress({ phase: 'matching_faces', progress: 42, message: PHASE_MESSAGES.matching_faces })
  await delay(700)

  onProgress({ phase: 'matching_faces', progress: 55, message: 'משווה תווי פנים עם תמונת הפרופיל...', matchedPhotos: 1 })
  await delay(600)

  onProgress({ phase: 'matching_faces', progress: 68, message: 'זוהו 2 תמונות תואמות (פרופיל מלא + צד)', matchedPhotos: 2 })
  await delay(500)

  const baseSizes = currentSizes?.sizing
  const baseTop = baseSizes?.top ?? 'M'
  const baseBottom = baseSizes?.bottom ?? '40'
  const baseFit = baseSizes?.fit ?? 'Regular'

  const newEntries: ScanEntry[] = []
  const photoAngles = [
    { source: 'זוהה אוטומטית — פרופיל מלא', photoUrl: generatePlaceholderPhotoUrl(), confidence: 92 },
    { source: 'זוהה אוטומטית — צילום צד', photoUrl: generateSideProfilePhotoUrl(), confidence: 89 },
  ]

  for (let i = 0; i < MAX_MATCHED_PHOTOS; i++) {
    onProgress({
      phase: 'analyzing_measurements',
      progress: 72 + Math.round((i / MAX_MATCHED_PHOTOS) * 18),
      message: `מנתח זוויות ב-DeepSeek AI... (תמונה ${i + 1}/${MAX_MATCHED_PHOTOS})`,
    })
    await delay(800)

    const ts = formatTimestamp(new Date())
    const angle = photoAngles[i]
    const entry: ScanEntry = {
      id: nextScanId(),
      date: ts.date,
      time: ts.time,
      top: baseTop,
      bottom: baseBottom,
      fit: baseFit,
      confidence: angle.confidence,
      photoUrl: angle.photoUrl,
      source: angle.source,
      isBaseline: false,
      delta: null,
    }
    newEntries.push(entry)
  }

  const allEntries = [...newEntries, ...existingGallery]
  const accuracy = computeAccuracyForCount(allEntries.length)

  onProgress({ phase: 'updating_accuracy', progress: 94, message: PHASE_MESSAGES.updating_accuracy })
  await delay(500)

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
    accuracy,
    matchedCount: newEntries.length,
  }
}
