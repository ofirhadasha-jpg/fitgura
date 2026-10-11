import React, { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ScanEntry, ScannedSizes, User } from '../types'
import { aiAnalysisToScannedSizes, analyzeBodyImage, computeDelta, formatTimestamp, nextScanId } from '../types'
import { supabase } from '../lib/supabase'

interface SizingAccuracyUpgradeProps {
  user: User | null
  scannedSizes: ScannedSizes | null
  setScannedSizes: (sizes: ScannedSizes) => void
  scanGallery: ScanEntry[]
  setScanGallery: (gallery: ScanEntry[] | ((previous: ScanEntry[]) => ScanEntry[])) => void
  baselinePhotoUrl: string | null
}

const MAX_ACCURACY = 100

function accuracyForPhotoCount(photoCount: number, scannerConfidence: number): number {
  if (photoCount >= 3) return Math.max(98, Math.min(MAX_ACCURACY, scannerConfidence))
  if (photoCount >= 2 && scannerConfidence >= 95) return 98
  if (photoCount >= 2) return 85
  return 72
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

function getFeedback(accuracy: number): string {
  if (accuracy >= 95) return `מדהים! הגעת לדיוק מרבי (${accuracy}%)! אין צורך בתמונות נוספות.`
  if (accuracy >= 80) return 'מצוין! תמונה אחת נוספת ואנחנו ב-100%!'
  return 'בסיס מעולה! הוסף תמונה נוספת כדי להגיע ל-85%+'
}

export default function SizingAccuracyUpgrade({ user, scannedSizes, setScannedSizes, scanGallery, setScanGallery, baselinePhotoUrl }: SizingAccuracyUpgradeProps) {
  const [visible, setVisible] = useState(false)
  const [accuracy, setAccuracy] = useState(72)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showSourceChoice, setShowSourceChoice] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const targetSlotRef = useRef(2)

  const uploadedPhotoCount = Math.min(3, Math.max(1, scanGallery.length || (baselinePhotoUrl ? 1 : 0)))
  const complete = accuracy >= 95
  const nextSlot = complete ? null : uploadedPhotoCount >= 3 ? null : uploadedPhotoCount + 1

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('sizing_accuracy, gallery_scans')
        .eq('user_id', user.id)
        .maybeSingle()
      if (typeof data?.sizing_accuracy === 'number') setAccuracy(Math.max(0, Math.min(100, data.sizing_accuracy)))
      if (Array.isArray(data?.gallery_scans) && data.gallery_scans.length > 0 && scanGallery.length === 0) {
        setScanGallery(data.gallery_scans as ScanEntry[])
      }
    })()
  }, [user?.id])

  useEffect(() => {
    if (scanGallery.length === 0 && baselinePhotoUrl) setAccuracy((current) => current < 72 ? 72 : current)
  }, [scanGallery.length, baselinePhotoUrl])

  const slots = useMemo(() => [
    { slot: 1, title: 'תמונה 1: חזית מלאה', description: 'תמונת גוף מלאה וברורה', complete: uploadedPhotoCount >= 1 },
    { slot: 2, title: 'תמונה 2: צילום צד', description: 'צילום פרופיל בעמידה טבעית', complete: uploadedPhotoCount >= 2 },
    { slot: 3, title: 'תמונה 3: צילום צד + חפץ ייחוס', description: 'למשל כרטיס אשראי — אופציונלי', complete: uploadedPhotoCount >= 3 },
  ], [uploadedPhotoCount])

  async function persistProgress(nextAccuracy: number, nextGallery: ScanEntry[]) {
    if (!user) return
    const { error: updateError } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, sizing_accuracy: nextAccuracy, gallery_scans: nextGallery }, { onConflict: 'user_id' })
    if (updateError) console.error('[SizingAccuracyUpgrade] Failed to save sizing progress:', updateError)
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || uploading || !nextSlot) return
    setError(null)
    setUploading(true)
    setProgress(8)
    const timer = setInterval(() => setProgress((value) => Math.min(92, value + 4)), 120)

    try {
      const { analysis, preview } = await analyzeBodyImage(file)
      const scanned = aiAnalysisToScannedSizes(analysis, preview)
      const merged = mergeMeasurements(scannedSizes, scanned)
      const confidence = Math.round((analysis.sizing_profile?.confidence_score ?? scanned.confidence / 100) * 100)
      const nextAccuracy = accuracyForPhotoCount(nextSlot, confidence)
      const previousSizing = scannedSizes?.sizing ?? null
      const delta = previousSizing ? computeDelta(previousSizing, merged.sizing) : null
      merged.sizing.baselineMatched = true
      merged.sizing.measurementDelta = delta
      merged.sizing.confidence = nextAccuracy
      merged.confidence = nextAccuracy
      setScannedSizes(merged)
      const timestamp = formatTimestamp(new Date())
      const entry: ScanEntry = {
        id: nextScanId(),
        date: timestamp.date,
        time: timestamp.time,
        top: merged.sizing.top,
        bottom: merged.sizing.bottom,
        fit: merged.sizing.fit,
        confidence: nextAccuracy,
        photoUrl: preview,
        source: nextSlot === 2 ? 'שדרוג דיוק — צילום צד' : 'שדרוג דיוק — חפץ ייחוס',
        isBaseline: false,
        delta,
      }
      const nextGallery = [entry, ...scanGallery]
      setScanGallery(nextGallery)
      setAccuracy(nextAccuracy)
      await persistProgress(nextAccuracy, nextGallery)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'הסריקה נכשלה. נסה שוב.')
    } finally {
      clearInterval(timer)
      setProgress(100)
      setTimeout(() => {
        setUploading(false)
        setProgress(0)
      }, 450)
    }
  }

  function openUpload(slot: number) {
    if (complete || uploading) return
    targetSlotRef.current = slot
    setShowSourceChoice(true)
  }

  function chooseCamera() {
    setShowSourceChoice(false)
    cameraInputRef.current?.click()
  }

  function chooseGallery() {
    setShowSourceChoice(false)
    galleryInputRef.current?.click()
  }

  return (
    <>
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.mascot}><Text style={styles.mascotFace}>FIT</Text><View style={styles.mascotPulse} /></View>
          <View style={styles.summaryText}>
            <Text style={styles.title}>שדרג את המידות שלך לדיוק מוחלט!</Text>
            <Text style={styles.subtitle}>{getFeedback(accuracy)}</Text>
          </View>
        </View>
        <View style={styles.gaugeRow}>
          <View style={styles.gaugeWrap}>
            <View style={styles.gaugeTrack}>
              <View style={[styles.gaugeFill, { width: `${accuracy}%` }]} />
            </View>
            <Text style={styles.gaugeValue}>{accuracy}%</Text>
            <Text style={styles.gaugeLabel}>דיוק נוכחי</Text>
          </View>
          <View style={styles.progressSide}>
            <Text style={styles.progressText}>{complete ? 'דיוק מרבי הושג!' : `${uploadedPhotoCount}/3 תמונות`}</Text>
            <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${accuracy}%` }]} /></View>
            <Text style={styles.progressHint}>חזה · מותן · ירכיים · כתפיים</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setVisible(true)}
          disabled={complete}
          activeOpacity={0.8}
          style={[styles.openButton, complete && styles.completeButton]}
        >
          <Text style={styles.openButtonText}>{complete ? '✓ הדיוק המרבי הושג' : 'שדרוג דיוק המידות'}</Text>
        </TouchableOpacity>
      </View>

      {visible && (
        <View style={styles.overlay}>
          <TouchableOpacity onPress={() => !uploading && setVisible(false)} activeOpacity={1} style={styles.backdrop} />
          <View style={styles.panel}>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleUpload} />
            <input ref={galleryInputRef} type="file" accept="image/*" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleUpload} />
            {showSourceChoice && (
              <View style={styles.sourceChoiceOverlay}>
                <TouchableOpacity onPress={() => setShowSourceChoice(false)} activeOpacity={1} style={styles.sourceChoiceBackdrop} />
                <View style={styles.sourceChoiceBox}>
                  <View style={styles.sourceChoiceHeader}>
                    <Text style={{ fontSize: 20 }}>📷</Text>
                    <Text style={styles.sourceChoiceTitle}>בחר מקור תמונה</Text>
                  </View>
                  <View style={styles.sourceChoiceRow}>
                    <TouchableOpacity onPress={chooseCamera} activeOpacity={0.7} style={styles.sourceChoiceBtn}>
                      <Text style={{ fontSize: 26 }}>📸</Text>
                      <Text style={styles.sourceChoiceLabel}>מצלמה</Text>
                      <Text style={styles.sourceChoiceSub}>צלם עכשיו</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={chooseGallery} activeOpacity={0.7} style={[styles.sourceChoiceBtn, { borderLeftWidth: 1, borderLeftColor: '#1A1A1A' }]}>
                      <Text style={{ fontSize: 26 }}>🖼️</Text>
                      <Text style={styles.sourceChoiceLabel}>הקבצים שלי</Text>
                      <Text style={styles.sourceChoiceSub}>בחר תמונה</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>שדרוג דיוק המידות</Text>
                <Text style={styles.panelSub}>כל תמונה מוסיפה ביטחון למדידה המשולבת</Text>
              </View>
              <TouchableOpacity onPress={() => !uploading && setVisible(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></TouchableOpacity>
            </View>
            <View style={styles.modalAccuracy}><Text style={styles.modalAccuracyLabel}>דיוק נוכחי</Text><Text style={styles.modalAccuracyValue}>{accuracy}%</Text><View style={styles.modalBar}><View style={[styles.progressFill, { width: `${accuracy}%` }]} /></View></View>
            {uploading && <View style={styles.uploadingBox}><Text style={styles.uploadingTitle}>DeepSeek מנתח ומצליב נקודות גוף...</Text><View style={styles.modalBar}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><Text style={styles.uploadingPct}>{progress}%</Text></View>}
            {error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.slots}>
              {slots.map((item) => (
                <View key={item.slot} style={[styles.slotCard, item.complete && styles.slotComplete, item.slot === nextSlot && styles.slotActive]}>
                  <View style={styles.silhouetteBox}>
                    <View style={styles.silhouetteHead} />
                    <View style={[styles.silhouetteBody, item.slot === 2 && styles.silhouetteBodySide]} />
                    <View style={styles.silhouetteLegs}>
                      <View style={styles.silhouetteLeg} />
                      <View style={styles.silhouetteLeg} />
                    </View>
                  </View>
                  <View style={styles.slotDetails}>
                    <Text style={styles.slotTitle}>{item.title}</Text>
                    <Text style={styles.slotDescription}>{item.description}</Text>
                    {item.complete ? <View style={styles.doneBadge}><Text style={styles.doneText}>✓ הושלם!</Text></View> : item.slot === nextSlot ? <TouchableOpacity onPress={() => openUpload(item.slot)} disabled={uploading} style={styles.uploadButton}><Text style={styles.uploadButtonText}>העלאת תמונה</Text></TouchableOpacity> : <Text style={styles.waitingText}>ממתין לשלב הקודם</Text>}
                  </View>
                </View>
              ))}
            </View>
            {complete && <View style={styles.successBox}><Text style={styles.successTitle}>דיוק מרבי הושג! {accuracy}%</Text><Text style={styles.successSub}>המידות שלך משולבות מתמונות חזית, צד וחפץ ייחוס.</Text></View>}
          </View>
        </View>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  summaryCard: { backgroundColor: '#FFFACC', borderRadius: 12 as any, padding: 16, gap: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', textAlign: 'right', fontFamily: "'Permanent Marker', cursive" },
  subtitle: { fontSize: 12, color: '#2D2D2D', lineHeight: 18, marginTop: 4, textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  mascot: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFE566', borderWidth: 1.5, borderColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 #1A1A1A' as any },
  mascotFace: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', letterSpacing: 1 },
  mascotPulse: { position: 'absolute', width: 8, height: 8, borderRadius: 4, right: 7, top: 7, backgroundColor: '#00FF66', borderWidth: 1, borderColor: '#1A1A1A' },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gaugeWrap: { width: 122, alignItems: 'center' },
  gaugeTrack: { width: 122, height: 18, borderRadius: 12, backgroundColor: '#F5F0E0', overflow: 'hidden', borderWidth: 1.5, borderColor: '#1A1A1A' },
  gaugeFill: { height: '100%', backgroundColor: '#00CC52' },
  gaugeValue: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', marginTop: 3, fontFamily: "'Permanent Marker', cursive" },
  gaugeLabel: { fontSize: 11, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  progressSide: { flex: 1, gap: 7 },
  progressText: { fontSize: 13, fontWeight: '700', color: '#00CC52', textAlign: 'right', fontFamily: "'Permanent Marker', cursive" },
  progressBar: { height: 9, borderRadius: 5, overflow: 'hidden', backgroundColor: '#F5F0E0', borderWidth: 1, borderColor: '#1A1A1A' },
  progressFill: { height: '100%', backgroundColor: '#00FF66', borderRadius: 5 },
  progressHint: { fontSize: 10, color: '#4A4A4A', textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  openButton: { backgroundColor: '#1A1A1A', borderRadius: 9 as any, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFE566' as any },
  completeButton: { backgroundColor: '#00CC52', boxShadow: '2px 2px 0 #1A1A1A' as any },
  openButtonText: { color: '#FFE566', fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 350, justifyContent: 'center', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.62)' },
  panel: { backgroundColor: '#FFFEF5', borderRadius: 24, padding: 18, width: '92%', maxHeight: '88%', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any } as any,
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  panelTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', textAlign: 'right', fontFamily: "'Permanent Marker', cursive" },
  panelSub: { fontSize: 12, color: '#4A4A4A', marginTop: 4, textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  closeText: { color: '#1A1A1A', fontSize: 24, lineHeight: 24 },
  modalAccuracy: { backgroundColor: '#FFFACC', borderRadius: 10 as any, padding: 11, borderWidth: 1.5, borderColor: '#1A1A1A', marginBottom: 10 },
  modalAccuracyLabel: { fontSize: 11, color: '#4A4A4A', textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  modalAccuracyValue: { fontSize: 30, fontWeight: '800', color: '#00CC52', textAlign: 'right', fontFamily: "'Permanent Marker', cursive" },
  modalBar: { height: 9, borderRadius: 5, overflow: 'hidden', backgroundColor: '#F5F0E0', borderWidth: 1, borderColor: '#1A1A1A' },
  uploadingBox: { backgroundColor: '#E0FFF0', borderRadius: 10 as any, padding: 10, marginBottom: 10, borderWidth: 1.5, borderColor: '#1A1A1A' },
  uploadingTitle: { fontSize: 12, color: '#1A1A1A', textAlign: 'right', marginBottom: 7, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  uploadingPct: { fontSize: 12, color: '#00CC52', textAlign: 'center', marginTop: 4, fontFamily: "'Permanent Marker', cursive" },
  errorText: { color: '#1A1A1A', backgroundColor: '#FFFACC', borderWidth: 1, borderColor: '#1A1A1A', borderRadius: 8 as any, padding: 8, marginBottom: 8, textAlign: 'right', fontSize: 12 },
  slots: { gap: 9 },
  slotCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 12 as any, backgroundColor: '#FFFEF5', borderWidth: 1.5, borderColor: '#1A1A1A' },
  slotActive: { backgroundColor: '#FFFACC', boxShadow: '2px 2px 0 #FFE566' as any },
  slotComplete: { backgroundColor: '#E0FFF0', borderColor: '#00CC52' },
  silhouetteBox: { width: 74, height: 74, borderRadius: 9, backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 9, borderWidth: 1, borderColor: '#1A1A1A' },
  silhouetteHead: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#1A1A1A' },
  silhouetteBody: { width: 24, height: 29, borderRadius: 12, backgroundColor: '#1A1A1A', marginTop: 2 },
  silhouetteBodySide: { width: 15, borderRadius: 8, marginLeft: 9 },
  silhouetteLegs: { flexDirection: 'row', gap: 5 },
  silhouetteLeg: { width: 7, height: 18, borderRadius: 4, backgroundColor: '#1A1A1A' },
  slotDetails: { flex: 1, alignItems: 'flex-end', gap: 3 },
  slotTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', textAlign: 'right', fontFamily: "'Permanent Marker', cursive" },
  slotDescription: { fontSize: 11, color: '#4A4A4A', textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  doneBadge: { backgroundColor: '#00FF66', borderRadius: 8 as any, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: '#1A1A1A' },
  doneText: { fontSize: 11, color: '#1A1A1A', fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  uploadButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFE566', borderRadius: 8 as any, paddingVertical: 7, paddingHorizontal: 11, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  uploadButtonText: { fontSize: 12, color: '#1A1A1A', fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  waitingText: { fontSize: 10, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  successBox: { backgroundColor: '#E0FFF0', borderRadius: 10 as any, padding: 11, marginTop: 10, borderWidth: 1.5, borderColor: '#00CC52' },
  successTitle: { fontSize: 16, color: '#00CC52', fontWeight: '800', textAlign: 'right', fontFamily: "'Permanent Marker', cursive" },
  successSub: { fontSize: 11, color: '#1A1A1A', textAlign: 'right', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sourceChoiceOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400, justifyContent: 'center', alignItems: 'center' },
  sourceChoiceBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.5)' },
  sourceChoiceBox: { backgroundColor: '#FFFEF5', borderRadius: 16, padding: 16, width: '82%', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any },
  sourceChoiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, justifyContent: 'center' },
  sourceChoiceTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sourceChoiceRow: { flexDirection: 'row' },
  sourceChoiceBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 18, backgroundColor: '#FFFACC', borderRadius: 12 },
  sourceChoiceLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sourceChoiceSub: { fontSize: 11, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
})
