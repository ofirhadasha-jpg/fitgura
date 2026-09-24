import React, { useRef, useState, useCallback, useEffect } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Image } from 'react-native'
import { LinearGradient } from '../components'
// LinearGradient is kept for compatibility but not used in sketch theme
import {
  type ScannedSizes,
  type PersonBounds,
  type ScanEntry,
  type BodyMetrics,
  TOP_SIZES, BOTTOM_SIZES, FIT_TYPES, SHOE_SIZES_EU,
  PRIMARY_STYLES, SEC_STYLES,
  analyzeBodyImage,
  aiAnalysisToScannedSizes,
  computeBodyMetricsFromSizes,
  computeBodyMetricsFromHeightWeight,
  fileToCompressedBase64,
  formatTimestamp, nextScanId,
} from '../types'

const PENDING_SCAN_KEY = 'fitgura_pending_scan'

type OnboardStep = 'upload' | 'scanning' | 'result' | 'gallery-access'

export function OnboardingScreen({ onNext, onScanned, onGalleryAdd, onGalleryAccess }: { onNext: () => void; onScanned: (s: ScannedSizes) => void; onGalleryAdd: (g: ScanEntry[]) => void; onGalleryAccess: (granted: boolean) => void }) {
  const [step, setStep] = useState<OnboardStep>('upload')
  const [scanProgress, setScanProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [sizes, setSizes] = useState<ScannedSizes | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraFallbackRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  const [scanError, setScanError] = useState<string | null>(null)
  const [faceMissing, setFaceMissing] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const resetScan = useCallback(() => {
    sessionStorage.removeItem(PENDING_SCAN_KEY)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setSizes(null)
    setScanError(null)
    setFaceMissing(false)
    setScanProgress(0)
    setStep('upload')
  }, [])

  async function startScan(file: File) {
    if (previewUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    previewUrlRef.current = null

    setScanError(null)
    const instantPreview = URL.createObjectURL(file)
    previewUrlRef.current = instantPreview
    setSizes({
      sizing: { top: '', bottom: '', fit: '', bodyFrame: '', confidence: 0, baselineMatched: false, isWeeklyUpdate: false, measurementDelta: null, bodyMetrics: null },
      style: { primaryStyle: '', secondaryStyle: '', dominantColors: [], patternPreference: '', aestheticTags: [] },
      confidence: 0,
      preview: instantPreview,
      top: '',
      bottom: '',
      fit: '',
      gender: 'unisex',
      ageGroup: 'adult',
      personBounds: { top: 2, left: 10, width: 80, height: 96 },
      shoeSize: null,
    })
    setStep('scanning')
    setScanProgress(0)

    const progressInterval = setInterval(() => {
      setScanProgress((p) => {
        if (p >= 90) return 90
        return p + 5
      })
    }, 40)

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      const aiPromise = analyzeBodyImage(file)
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI_TIMEOUT')), 90000)
      })
      const { analysis, preview } = await Promise.race([aiPromise, timeoutPromise])
      if (timeoutId) clearTimeout(timeoutId)
      if (previewUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = preview
      const aiSizes = aiAnalysisToScannedSizes(analysis, preview)
      setSizes(aiSizes)
      onScanned(aiSizes)
      setFaceMissing(analysis.face_detected === false)
      const ts = formatTimestamp(new Date())
      const baselineEntry: ScanEntry = {
        id: nextScanId(),
        date: ts.date,
        time: ts.time,
        top: aiSizes.sizing.top,
        bottom: aiSizes.sizing.bottom,
        fit: aiSizes.sizing.fit,
        confidence: aiSizes.sizing.confidence,
        photoUrl: preview,
        source: 'תמונת הרשמה',
        isBaseline: true,
        delta: null,
      }
      onGalleryAdd([baselineEntry])
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId)
      if (previewUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      console.error('[Onboarding] Scan failed:', err)
      setSizes(null)
      setScanError(err instanceof Error && err.message === 'AI_TIMEOUT'
        ? 'ניתוח AI לא הספיק. נסה שוב.'
        : err instanceof Error ? err.message : 'ניתוח AI נכשל. נסה שוב.')
    } finally {
      clearInterval(progressInterval)
      sessionStorage.removeItem(PENDING_SCAN_KEY)
      setScanProgress(100)
      setTimeout(() => setStep('result'), 400)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      fileToCompressedBase64(file)
        .then((base64) => sessionStorage.setItem(PENDING_SCAN_KEY, base64))
        .catch(() => {})
      await startScan(file)
    }
    e.target.value = ''
  }

  useEffect(() => {
    void (async () => {
      try {
        const pending = sessionStorage.getItem(PENDING_SCAN_KEY)
        if (!pending) return
        sessionStorage.removeItem(PENDING_SCAN_KEY)
        const byteString = atob(pending.split(',')[1] ?? '')
        const ab = new Uint8Array(byteString.length)
        for (let i = 0; i < byteString.length; i++) ab[i] = byteString.charCodeAt(i)
        const blob = new Blob([ab], { type: 'image/jpeg' })
        const file = new File([blob], 'resumed-scan.jpg', { type: 'image/jpeg' })
        await startScan(file)
      } catch (err) {
        console.error('[Onboarding] Failed to resume pending scan:', err)
        sessionStorage.removeItem(PENDING_SCAN_KEY)
        setScanError('שגיאה בטעינת התמונה. נסה להעלות שוב.')
        setStep('upload')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFEF5', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)' } as React.CSSProperties}>
      {/* Header */}
      <View style={obStyles.header}>
        <View style={obStyles.progressRow}>
          {(['upload', 'scanning', 'result', 'gallery-access'] as OnboardStep[]).map((_s, i) => {
            const stepOrder = ['upload', 'scanning', 'result', 'gallery-access']
            const currentIdx = stepOrder.indexOf(step)
            const barColor = i <= currentIdx ? (step === 'gallery-access' && i === currentIdx ? '#FFE566' : i < currentIdx ? '#00FF66' : '#FFE566') : 'rgba(26,26,26,0.1)'
            return <View key={i} style={[obStyles.progressBar, { backgroundColor: barColor }]} />
          })}
        </View>
        <Text style={obStyles.headerTitle}>
          {step === 'upload' ? 'סריקת AI אישית' : step === 'scanning' ? 'סורק מידות...' : step === 'result' ? 'סריקה הושלמה ✓' : 'גישה לגלריה'}
        </Text>
        <Text style={obStyles.headerSub}>
          {step === 'upload' ? 'העלה תמונה וה-AI ימצא את המידה המדויקת שלך' : step === 'scanning' ? 'בינה מלאכותית מנתחת את מבנה הגוף שלך' : step === 'result' ? 'אישור מידות ופרופיל מוכן' : 'אישור גישה לגלריה לעדכון אוטומטי של מידות'}
        </Text>
      </View>

      {/* Hidden file inputs — use opacity:0 + absolute positioning instead of display:none so .click() works on mobile browsers */}
      <input ref={galleryRef} type="file" accept="image/*" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleFile} />
      <input ref={cameraFallbackRef} type="file" accept="image/*" capture="environment" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleFile} />

      {cameraOpen && (
        <CameraModal
          videoRef={videoRef}
          streamRef={streamRef}
          canvasRef={canvasRef}
          facingMode={facingMode}
          cameraError={cameraError}
          onCapture={async (file) => {
            setCameraOpen(false)
            setCameraError(null)
            await startScan(file)
          }}
          onClose={() => { setCameraOpen(false); setCameraError(null) }}
          onSwitchCamera={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
          onFallback={() => {
            setCameraOpen(false)
            setCameraError(null)
            cameraFallbackRef.current?.click()
          }}
        />
      )}

      <View style={{ flex: 1, padding: 24, gap: 20 }}>
        {step === 'upload' && (
          <>
            <BenefitCarousel />

            <View style={[obStyles.dropZone, dragOver && obStyles.dropZoneActive]}>
              <View style={obStyles.dropIcon}><Text style={{ fontSize: 32 }}>📸</Text></View>
              <Text style={obStyles.dropTitle}>Upload Your Photo</Text>
              <Text style={obStyles.dropSub}>גרור לכאן, או בחר אחת מהכפתורים למטה</Text>
              <View style={obStyles.tipBox}>
                <Text style={{ fontSize: 16 }}>💡</Text>
                <Text style={obStyles.tipText}>לתוצאה מדויקת — העלה תמונה של <Text style={{ fontWeight: '700' }}>כל הגוף</Text> מהראש עד הרגליים, עמידה ישרה, על רקע בהיר.</Text>
              </View>
              <View style={obStyles.btnRow}>
                <TouchableOpacity
                  onPress={() => { setCameraError(null); setCameraOpen(true) }}
                  style={obStyles.cameraBtn}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16 }}>📷</Text>
                  <Text style={obStyles.cameraBtnText}>צלם עכשיו</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => galleryRef.current?.click()}
                  style={obStyles.galleryBtn}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16 }}>🖼️</Text>
                  <Text style={obStyles.galleryBtnText}>מגלריה</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={obStyles.scanInfoCard}>
              <Text style={obStyles.scanInfoTitle}>מה פיטגורה בודקת:</Text>
              <View style={obStyles.scanInfoGrid}>
                {[
                  { icon: '📐', label: 'מידות גוף' },
                  { icon: '👔', label: 'גזרה מועדפת' },
                  { icon: '📏', label: 'פרופורציות' },
                  { icon: '🔄', label: 'עדכון אוטומטי' },
                ].map(({ icon, label }) => (
                  <View key={label} style={obStyles.scanInfoItem}>
                    <Text style={{ fontSize: 18 }}>{icon}</Text>
                    <Text style={obStyles.scanInfoLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {step === 'scanning' && <ScanningView progress={scanProgress} sizes={sizes} />}
        {step === 'result' && sizes && <ResultView onNext={() => setStep('gallery-access')} onScanned={onScanned} sizes={sizes} setSizes={setSizes} scanError={scanError} faceMissing={faceMissing} onRetake={resetScan} />}
        {step === 'result' && !sizes && (
          <View style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#DC2626', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>שגיאה בסריקה</Text>
            <Text style={{ fontSize: 16, color: '#6B6B6B', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' }}>אירעה שגיאה בניתוח התמונה. נסה שוב, או המשך ללא סריקה.</Text>
            {scanError && <Text style={{ fontSize: 13, color: '#DC2626', fontFamily: "'Noto Sans Hebrew', sans-serif", textAlign: 'center', marginTop: 4 }}>{scanError}</Text>}
            <TouchableOpacity onPress={resetScan} activeOpacity={0.8} style={{ backgroundColor: '#FFE566', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' }}>
              <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" }}>נסה שוב</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const fallback: ScannedSizes = {
                  sizing: { top: 'M', bottom: '40', fit: 'Regular', bodyFrame: 'Medium', confidence: 0, baselineMatched: false, isWeeklyUpdate: false, measurementDelta: null, bodyMetrics: null },
                  style: { primaryStyle: 'Casual', secondaryStyle: 'Urban', dominantColors: [], patternPreference: 'Solid', aestheticTags: [] },
                  confidence: 0,
                  preview: '',
                  top: 'M',
                  bottom: '40',
                  fit: 'Regular',
                  gender: 'unisex',
                  ageGroup: 'adult',
                  personBounds: { top: 2, left: 10, width: 80, height: 96 },
                  shoeSize: '42',
                }
                setSizes(fallback)
                onScanned(fallback)
                setStep('gallery-access')
              }}
              activeOpacity={0.7}
              style={{ paddingVertical: 10, paddingHorizontal: 24 }}
            >
              <Text style={{ color: '#6B6B6B', fontSize: 15, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>המשך ללא סריקה</Text>
            </TouchableOpacity>
          </View>
        )}
        {step === 'gallery-access' && (
          <GalleryAccessView
            onGranted={() => { onGalleryAccess(true); onNext() }}
            onSkip={() => { onGalleryAccess(false); onNext() }}
          />
        )}
      </View>
    </View>
  )
}

function CameraModal({
  videoRef,
  streamRef,
  canvasRef,
  facingMode,
  cameraError,
  onCapture,
  onClose,
  onSwitchCamera,
  onFallback,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  streamRef: React.MutableRefObject<MediaStream | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  facingMode: 'user' | 'environment'
  cameraError: string | null
  onCapture: (file: File) => void
  onClose: () => void
  onSwitchCamera: () => void
  onFallback: () => void
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(cameraError)

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {})
            setReady(true)
          }
        }
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Camera access failed'
        if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied')) {
          setError('נדרשת הרשאת מצלמה. אנא אשר גישה למצלמה ונסה שוב.')
        } else if (msg.includes('NotFound') || msg.includes('device')) {
          setError('לא נמצאה מצלמה במכשיר זה.')
        } else {
          setError('לא הצלחתי לפתוח את המצלמה. ניתן להשתמש בבחירת תמונה מהמכשיר.')
        }
      }
    }

    setReady(false)
    setError(null)
    startCamera()

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode])

  function handleSnap() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth || 720
    const h = video.videoHeight || 1280
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (facingMode === 'user') {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' })
      onCapture(file)
    }, 'image/jpeg', 0.85)
  }

  return (
    <View style={obStyles.cameraOverlay}>
      <View style={obStyles.cameraModal}>
        <View style={obStyles.cameraModalHeader}>
          <Text style={obStyles.cameraModalTitle}>צלם תמונה</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={obStyles.cameraCloseBtn}>
            <Text style={obStyles.cameraCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={obStyles.cameraPreviewWrap}>
          {error ? (
            <View style={obStyles.cameraErrorBox}>
              <Text style={{ fontSize: 40 }}>📷</Text>
              <Text style={obStyles.cameraErrorText}>{error}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity onPress={onFallback} activeOpacity={0.8} style={obStyles.cameraFallbackBtn}>
                  <Text style={obStyles.cameraFallbackBtnText}>בחר תמונה מהמכשיר</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 12,
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                } as React.CSSProperties}
              />
              {!ready && (
                <View style={obStyles.cameraLoadingBox}>
                  <Text style={{ fontSize: 28 }}>⏳</Text>
                  <Text style={obStyles.cameraLoadingText}>פותח מצלמה...</Text>
                </View>
              )}
              <View style={obStyles.cameraGuideFrame} />
            </>
          )}
        </View>

        <View style={obStyles.cameraControls}>
          <TouchableOpacity onPress={onSwitchCamera} activeOpacity={0.7} style={obStyles.cameraSwitchBtn} disabled={!!error}>
            <Text style={{ fontSize: 18 }}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSnap} activeOpacity={0.8} style={obStyles.cameraSnapBtn} disabled={!ready || !!error}>
            <View style={obStyles.cameraSnapInner} />
          </TouchableOpacity>
          <View style={{ width: 54 }} />
        </View>
      </View>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </View>
  )
}

const BENEFIT_SLIDES = [
  { icon: '🛍️', text: 'לקנות בביטחון' },
  { icon: '↩️', text: 'אין יותר החזרות' },
  { icon: '👖', text: 'מתאימים לך מכנסיים' },
  { icon: '👔', text: 'מתאימים לך חולצה' },
  { icon: '👗', text: 'מתאימים לך שמלה' },
  { icon: '👜', text: 'מתאימים לך אביזרים' },
]

function BenefitCarousel() {
  const [index, setIndex] = useState(0)
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % BENEFIT_SLIDES.length)
      setAnimKey((k) => k + 1)
    }, 2800)
    return () => clearInterval(t)
  }, [])

  const slide = BENEFIT_SLIDES[index]

  return (
    <View style={obStyles.explainCard}>
      <View style={obStyles.carouselStage} key={animKey} className="fitgura-carousel-enter">
        <View style={obStyles.carouselIconWrap}>
          <Text style={obStyles.carouselIcon}>{slide.icon}</Text>
        </View>
        <Text style={obStyles.carouselText}>{slide.text}</Text>
      </View>
      <View style={obStyles.carouselDots}>
        {BENEFIT_SLIDES.map((_, i) => (
          <View
            key={i}
            style={[obStyles.carouselDot, i === index && obStyles.carouselDotActive]}
          />
        ))}
      </View>
    </View>
  )
}

function ScanningView({ progress, sizes }: { progress: number; sizes: ScannedSizes | null }) {
  const [beamY, setBeamY] = useState(0)
  React.useEffect(() => {
    const t = setInterval(() => setBeamY((y) => (y + 2) % 100), 30)
    return () => clearInterval(t)
  }, [])

  const bounds: PersonBounds = sizes?.personBounds ?? { top: 2, left: 10, width: 80, height: 96 }

  return (
    <View style={{ alignItems: 'center', gap: 24 }}>
      <View style={obStyles.scanFrame}>
        {sizes?.preview ? (
          <Image source={{ uri: sizes.preview }} style={obStyles.scanPhoto} />
        ) : null}
        <View style={obStyles.scanGrid} />
        {/* scan beam */}
        <View style={[obStyles.scanBeam, { top: `${beamY}%` }]} />
        {/* corner brackets aligned to person bounds */}
        {[
          { top: `${bounds.top}%`, left: `${bounds.left}%`, borderTopWidth: 3, borderLeftWidth: 3 },
          { top: `${bounds.top}%`, left: `${bounds.left + bounds.width}%`, borderTopWidth: 3, borderRightWidth: 3 },
          { top: `${bounds.top + bounds.height}%`, left: `${bounds.left}%`, borderBottomWidth: 3, borderLeftWidth: 3 },
          { top: `${bounds.top + bounds.height}%`, left: `${bounds.left + bounds.width}%`, borderBottomWidth: 3, borderRightWidth: 3 },
        ].map((c, i) => {
          const isLeft = i % 2 === 0
          const isTop = i < 2
          return (
            <View
              key={i}
              style={[
                obStyles.cornerBracket,
                c,
                { borderColor: '#00FF66', width: 26, height: 26, marginLeft: isLeft ? -13 : -13, marginTop: isTop ? -13 : -13 },
              ]}
            />
          )
        })}
      </View>

      <View style={{ width: '100%' }}>
        <View style={obStyles.progressLabelRow}>
          <Text style={obStyles.progressLabel}>מנתח מידות גוף...</Text>
          <Text style={obStyles.progressPct}>{Math.round(progress)}%</Text>
        </View>
        <View style={obStyles.progressTrack}>
          <View style={[obStyles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={obStyles.metricsGrid}>
        {[
          { label: 'sizing_profile', sub: 'מידות גוף', value: '...', done: progress > 25 },
          { label: 'body_frame', sub: 'מסגרת גוף', value: '...', done: progress > 50 },
          { label: 'style_profile', sub: 'סגנון', value: '...', done: progress > 70 },
          { label: 'fit_preference', sub: 'גזרה', value: '...', done: progress > 88 },
        ].map(({ label, sub, value, done }) => (
          <View key={label} style={[obStyles.metricCard, { borderColor: done ? '#00FF66' : '#9A9A9A', backgroundColor: done ? '#E0FFF0' : '#FFFEF5' }]}>
            <Text style={[obStyles.metricValue, { color: done ? '#00CC52' : '#9A9A9A' }]}>{value}</Text>
            <Text style={obStyles.metricLabel}>{label}</Text>
            <Text style={obStyles.metricSub}>{sub}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function ResultView({ onNext, onScanned, sizes, setSizes, scanError, faceMissing, onRetake }: { onNext: () => void; onScanned: (s: ScannedSizes) => void; sizes: ScannedSizes; setSizes: React.Dispatch<React.SetStateAction<ScannedSizes | null>>; scanError: string | null; faceMissing: boolean; onRetake: () => void }) {
  const [editing, setEditing] = useState(false)
  const [topSize, setTopSize] = useState(sizes.sizing.top)
  const [bottomSize, setBottomSize] = useState(sizes.sizing.bottom)
  const [fitType, setFitType] = useState(sizes.sizing.fit)
  const [shoeSize, setShoeSize] = useState(sizes.shoeSize ?? '42')
  const [metricsEditing, setMetricsEditing] = useState(false)
  const [styleEditing, setStyleEditing] = useState(false)
  const [primaryStyle, setPrimaryStyle] = useState(sizes.style?.primaryStyle ?? '')
  const [secondaryStyle, setSecondaryStyle] = useState(sizes.style?.secondaryStyle ?? '')
  const [colors, setColors] = useState<string[]>(sizes.style?.dominantColors ?? [])
  const COLOR_PALETTE = ['#1A1A1A', '#4A4A4A', '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#22C55E', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#FFFFFF', '#9A9A9A']
  const [gender, setGender] = useState<'male' | 'female' | 'unisex'>(sizes.gender ?? 'unisex')
  const [heightCm, setHeightCm] = useState(sizes.sizing.bodyMetrics?.estimated_height_cm?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(sizes.sizing.bodyMetrics?.estimated_weight_kg?.toString() ?? '')
  const [chestCm, setChestCm] = useState(sizes.sizing.bodyMetrics?.chest_circumference_cm?.toString() ?? '')
  const [waistCm, setWaistCm] = useState(sizes.sizing.bodyMetrics?.waist_circumference_cm?.toString() ?? '')
  const [hipsCm, setHipsCm] = useState(sizes.sizing.bodyMetrics?.hips_circumference_cm?.toString() ?? '')
  const [shoulderCm, setShoulderCm] = useState(sizes.sizing.bodyMetrics?.shoulder_width_cm?.toString() ?? '')
  const s = sizes.style ?? { primaryStyle: '', secondaryStyle: '', dominantColors: [] as string[], patternPreference: '', aestheticTags: [] as string[] }

  function syncBodyMetricsFromSizes(top: string, bottom: string) {
    const existing = sizes.sizing.bodyMetrics
    const metrics = computeBodyMetricsFromSizes(top, bottom, existing)
    setChestCm(String(metrics.chest_circumference_cm))
    setWaistCm(String(metrics.waist_circumference_cm))
    setHipsCm(String(metrics.hips_circumference_cm))
    setShoulderCm(String(metrics.shoulder_width_cm))
  }

  function handleTopSizeChange(val: string) {
    setTopSize(val)
    syncBodyMetricsFromSizes(val, bottomSize)
  }

  function handleBottomSizeChange(val: string) {
    setBottomSize(val)
    syncBodyMetricsFromSizes(topSize, val)
  }

  function handleHeightChange(val: string) {
    setHeightCm(val)
    const h = Number(val)
    const w = Number(weightKg)
    if (h > 0 && w > 0) {
      const baseline = sizes.sizing.bodyMetrics
      const metrics = computeBodyMetricsFromHeightWeight(h, w, baseline)
      setChestCm(String(metrics.chest_circumference_cm))
      setWaistCm(String(metrics.waist_circumference_cm))
      setHipsCm(String(metrics.hips_circumference_cm))
      setShoulderCm(String(metrics.shoulder_width_cm))
    }
  }

  function handleWeightChange(val: string) {
    setWeightKg(val)
    const h = Number(heightCm)
    const w = Number(val)
    if (h > 0 && w > 0) {
      const baseline = sizes.sizing.bodyMetrics
      const metrics = computeBodyMetricsFromHeightWeight(h, w, baseline)
      setChestCm(String(metrics.chest_circumference_cm))
      setWaistCm(String(metrics.waist_circumference_cm))
      setHipsCm(String(metrics.hips_circumference_cm))
      setShoulderCm(String(metrics.shoulder_width_cm))
    }
  }

  function handleConfirm() {
    const updated: ScannedSizes = {
      ...sizes,
      top: topSize,
      bottom: bottomSize,
      fit: fitType,
      shoeSize,
      gender,
      sizing: {
        ...sizes.sizing,
        top: topSize,
        bottom: bottomSize,
        fit: fitType,
        bodyMetrics: {
          estimated_height_cm: heightCm ? Number(heightCm) : null,
          estimated_weight_kg: weightKg ? Number(weightKg) : null,
          chest_circumference_cm: chestCm ? Number(chestCm) : null,
          waist_circumference_cm: waistCm ? Number(waistCm) : null,
          hips_circumference_cm: hipsCm ? Number(hipsCm) : null,
          shoulder_width_cm: shoulderCm ? Number(shoulderCm) : null,
        },
      },
      style: {
        ...sizes.style,
        primaryStyle: primaryStyle || sizes.style?.primaryStyle || '',
        secondaryStyle: secondaryStyle || sizes.style?.secondaryStyle || '',
        dominantColors: colors.length ? colors : (sizes.style?.dominantColors ?? []),
      },
    }
    setSizes(updated)
    onScanned(updated)
    onNext()
  }

  return (
    <View style={{ gap: 14 }}>
      {faceMissing && (
        <View style={obStyles.faceMissingCard}>
          <View style={obStyles.faceMissingHeader}>
            <Text style={{ fontSize: 22 }}>⚠️</Text>
            <Text style={obStyles.faceMissingTitle}>לא זוהו פנים בתמונה</Text>
          </View>
          <Text style={obStyles.faceMissingText}>
            אנא העלה תמונה אחרת שמציגה את הפנים והגוף שלך, כדי שנוכל לעדכן את המידות שלך אוטומטית בעתיד.
          </Text>
          <TouchableOpacity onPress={onRetake} activeOpacity={0.8} style={obStyles.faceMissingBtn}>
            <Text style={obStyles.faceMissingBtnText}>העלה תמונה חדשה</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[obStyles.resultBanner, { backgroundColor: sizes.sizing.baselineMatched ? '#FFFACC' : '#E0FFF0', borderColor: sizes.sizing.baselineMatched ? '#FFE566' : '#00FF66' }]}>
        {sizes.preview && (
          <Image source={{ uri: sizes.preview }} style={obStyles.resultPhoto} />
        )}
        <View style={obStyles.resultBadges}>
          <Text style={obStyles.resultBadge}>
            {sizes.sizing.baselineMatched ? '🔄 TRACKING MODE' : '📸 BASELINE SCAN'}
          </Text>
          {sizes.sizing.isWeeklyUpdate && <Text style={obStyles.weeklyBadge}>WEEKLY UPDATE</Text>}
        </View>
        <Text style={obStyles.resultTitle}>ניתוח AI הושלם ✓</Text>
        <Text style={obStyles.resultSub}>דיוק {sizes.sizing.confidence}% · מסגרת גוף: {sizes.sizing.bodyFrame}</Text>
      </View>

      {sizes.sizing.measurementDelta && (
        <View style={obStyles.deltaCard}>
          <Text style={obStyles.deltaTitle}>📊 שינויים מהסריקה הקודמת</Text>
          <Text style={obStyles.deltaSummary}>{sizes.sizing.measurementDelta.summary}</Text>
          <View style={obStyles.deltaChips}>
            {[
              { label: 'חולצה', val: sizes.sizing.measurementDelta.top ?? null },
              { label: 'מכנסיים', val: sizes.sizing.measurementDelta.bottom ?? null },
              { label: 'גזרה', val: sizes.sizing.measurementDelta.fit ?? null },
              { label: 'מסגרת', val: sizes.sizing.measurementDelta.frame ?? null },
            ].filter(({ val }) => val).map(({ label, val }) => (
              <View key={label} style={obStyles.deltaChip}>
                <Text style={obStyles.deltaChipLabel}>{label}:</Text>
                <Text style={obStyles.deltaChipVal}>{val}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {sizes.sizing.bodyMetrics && (
        <View style={obStyles.bodyMetricsCard}>
          <View style={obStyles.bodyMetricsHeader}>
            <Text style={obStyles.bodyMetricsTitle}>📏 מידות גוף מדויקות (ס"מ)</Text>
            <TouchableOpacity
              onPress={() => setMetricsEditing(!metricsEditing)}
              style={[obStyles.editBtn, metricsEditing && obStyles.editBtnActive]}
              activeOpacity={0.7}
            >
              <Text style={[obStyles.editBtnText, metricsEditing && obStyles.editBtnTextActive]}>{metricsEditing ? 'שמור' : 'ערוך מידות'}</Text>
            </TouchableOpacity>
          </View>

          {metricsEditing && (
            <View style={obStyles.genderRow}>
              <Text style={obStyles.genderLabel}>מגדר</Text>
              <View style={obStyles.genderSelector}>
                {([
                  { key: 'male', label: 'זכר' },
                  { key: 'female', label: 'נקבה' },
                  { key: 'unisex', label: 'אוניסקס' },
                ] as const).map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setGender(key)}
                    activeOpacity={0.7}
                    style={[obStyles.genderOption, gender === key && obStyles.genderOptionActive]}
                  >
                    <Text style={[obStyles.genderOptionText, gender === key && obStyles.genderOptionTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {!metricsEditing && (
            <View style={obStyles.genderDisplayRow}>
              <Text style={obStyles.genderDisplayLabel}>מגדר: </Text>
              <Text style={obStyles.genderDisplayValue}>
                {gender === 'male' ? 'זכר' : gender === 'female' ? 'נקבה' : 'אוניסקס'}
              </Text>
            </View>
          )}

          <View style={obStyles.bodyMetricsGrid}>
            {[
              { label: 'גובה', value: heightCm, unit: 'ס"מ', set: handleHeightChange },
              { label: 'משקל', value: weightKg, unit: 'ק"ג', set: handleWeightChange },
              { label: 'חזה', value: chestCm, unit: 'ס"מ', set: setChestCm },
              { label: 'מותן', value: waistCm, unit: 'ס"מ', set: setWaistCm },
              { label: 'ירכיים', value: hipsCm, unit: 'ס"מ', set: setHipsCm },
              { label: 'כתפיים', value: shoulderCm, unit: 'ס"מ', set: setShoulderCm },
            ].map(({ label, value, unit, set }) => (
              <View key={label} style={[obStyles.bodyMetricItem, metricsEditing && obStyles.bodyMetricItemEditing]}>
                {metricsEditing ? (
                  <TextInput
                    value={value}
                    onChangeText={set}
                    keyboardType="numeric"
                    style={obStyles.bodyMetricInput}
                  />
                ) : (
                  <Text style={obStyles.bodyMetricValue}>{value || '—'}</Text>
                )}
                <Text style={obStyles.bodyMetricUnit}>{unit}</Text>
                <Text style={obStyles.bodyMetricLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {metricsEditing && (
            <TouchableOpacity
              onPress={() => setMetricsEditing(false)}
              activeOpacity={0.8}
              style={obStyles.updateResultsBtn}
            >
              <Text style={obStyles.updateResultsBtnText}>עדכן תוצאות</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {scanError && (
        <View style={{ backgroundColor: '#FFF0F0', borderRadius: 8, padding: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' }}>
          <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>
            ⚠️ AI: {scanError}
          </Text>
          <Text style={{ fontSize: 13, color: '#991B1B', marginTop: 4, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>
            מציג תוצאות מהמערכת המקומית כגיבוי
          </Text>
        </View>
      )}

      <View style={obStyles.sizingCard}>
        <View style={obStyles.sizingHeader}>
          <Text style={obStyles.sizingTitle}>📐 פרופיל מידות</Text>
          <TouchableOpacity
            onPress={() => setEditing(!editing)}
            style={[obStyles.editBtn, editing && obStyles.editBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[obStyles.editBtnText, editing && obStyles.editBtnTextActive]}>{editing ? 'שמור' : 'ערוך מידות'}</Text>
          </TouchableOpacity>
        </View>
        <View style={obStyles.sizingGrid}>
          {[
            { label: 'חולצה', value: topSize, options: TOP_SIZES, set: handleTopSizeChange },
            { label: 'מכנסיים (EU)', value: bottomSize, options: BOTTOM_SIZES, set: handleBottomSizeChange },
            { label: 'גזרה', value: fitType, options: FIT_TYPES, set: setFitType },
            { label: 'נעליים', value: shoeSize, options: SHOE_SIZES_EU, set: setShoeSize },
          ].map(({ label, value, options, set }) => (
            <View key={label} style={[obStyles.sizeBox, { borderColor: editing ? '#FFE566' : '#9A9A9A', borderWidth: editing ? 2 : 1.5 }]}>
              {editing ? (
                <View style={obStyles.sizeOptionsCol}>
                  {options.map((o) => (
                    <TouchableOpacity key={o} onPress={() => set(o)} activeOpacity={0.7}
                      style={[obStyles.sizeOptionWrap, value === o && obStyles.sizeOptionWrapActive]}>
                      {value === o && <Text style={obStyles.sizeOptionCheck}>✓</Text>}
                      <Text style={[obStyles.sizeOption, value === o && obStyles.sizeOptionActive]}>{o}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <>
                  <Text style={obStyles.sizeValue}>{value}</Text>
                  <Text style={obStyles.sizeLabel}>{label}</Text>
                </>
              )}
              {editing && <Text style={obStyles.sizeLabel}>{label}</Text>}
            </View>
          ))}
        </View>
      </View>

      <View style={obStyles.styleCard}>
        <View style={obStyles.styleHeader}>
          <Text style={obStyles.styleTitle}>🎨 פרופיל סגנון</Text>
          <TouchableOpacity
            onPress={() => setStyleEditing(!styleEditing)}
            style={[obStyles.editBtn, styleEditing && obStyles.editBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[obStyles.editBtnText, styleEditing && obStyles.editBtnTextActive]}>{styleEditing ? 'שמור' : 'ערוך סגנון'}</Text>
          </TouchableOpacity>
        </View>
        {styleEditing ? (
          <View style={{ gap: 12 }}>
            <View>
              <Text style={obStyles.stylePickerLabel}>סגנון ראשי</Text>
              <View style={obStyles.stylePickerGrid}>
                {PRIMARY_STYLES.map((st) => (
                  <TouchableOpacity key={st} onPress={() => setPrimaryStyle(st)} activeOpacity={0.7}
                    style={[obStyles.styleChip, primaryStyle === st && obStyles.styleChipActive]}
                  >
                    <Text style={[obStyles.styleChipText, primaryStyle === st && obStyles.styleChipTextActive]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={obStyles.stylePickerLabel}>סגנון משני</Text>
              <View style={obStyles.stylePickerGrid}>
                {SEC_STYLES.map((st) => (
                  <TouchableOpacity key={st} onPress={() => setSecondaryStyle(st)} activeOpacity={0.7}
                    style={[obStyles.styleChip, secondaryStyle === st && obStyles.styleChipActive]}
                  >
                    <Text style={[obStyles.styleChipText, secondaryStyle === st && obStyles.styleChipTextActive]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={obStyles.stylePickerLabel}>צבעים דומיננטים</Text>
              <View style={obStyles.colorDotsEditable}>
                {colors.map((c) => (
                  <TouchableOpacity key={c} onPress={() => setColors(colors.filter((x) => x !== c))} activeOpacity={0.7}>
                    <View style={[obStyles.colorDot, { backgroundColor: c }]}>
                      <Text style={obStyles.colorDotRemove}>×</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={obStyles.colorAddLabel}>הוסף צבע:</Text>
              <View style={obStyles.colorPalette}>
                {COLOR_PALETTE.map((c) => {
                  const selected = colors.includes(c)
                  return (
                    <TouchableOpacity key={c} onPress={() => setColors(selected ? colors.filter((x) => x !== c) : [...colors, c])} activeOpacity={0.7}
                      style={[obStyles.colorPaletteDot, { backgroundColor: c }, selected && obStyles.colorPaletteDotActive]}
                    />
                  )
                })}
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={obStyles.styleRow}>
              <View style={obStyles.stylePrimary}>
                <Text style={obStyles.stylePrimaryText}>{primaryStyle || s.primaryStyle}</Text>
                <Text style={obStyles.stylePrimaryLabel}>סגנון ראשי</Text>
              </View>
              <View style={obStyles.styleSecondary}>
                <Text style={obStyles.styleSecondaryText}>{secondaryStyle || s.secondaryStyle}</Text>
                <Text style={obStyles.styleSecondaryLabel}>סגנון משני</Text>
              </View>
            </View>
            <View style={obStyles.colorRow}>
              <Text style={obStyles.colorLabel}>צבעים דומיננטים:</Text>
              <View style={obStyles.colorDots}>
                {(colors.length ? colors : (s.dominantColors ?? [])).map((c) => (
                  <View key={c} style={[obStyles.colorDot, { backgroundColor: c }]} />
                ))}
              </View>
              <Text style={obStyles.patternText}>{s.patternPreference}</Text>
            </View>
            <View style={obStyles.tagsRow}>
              {(s.aestheticTags ?? []).map((tag) => (
                <View key={tag} style={obStyles.tag}>
                  <Text style={obStyles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <TouchableOpacity onPress={handleConfirm} activeOpacity={0.8} style={obStyles.confirmBtn}>
          <Text style={obStyles.confirmBtnText}>אשר פרופיל והמשך</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRetake} activeOpacity={0.7}>
          <Text style={{ color: '#6B6B6B', fontSize: 16, fontWeight: '600', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>סרוק תמונה חדשה</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function GalleryAccessView({ onGranted, onSkip }: { onGranted: () => void; onSkip: () => void }) {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)

  function handleGrant() {
    setScanning(true)
    setProgress(0)
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval)
          setTimeout(onGranted, 400)
          return 100
        }
        return p + 5
      })
    }, 50)
  }

  return (
    <View style={{ gap: 20, paddingVertical: 10 }}>
      <View style={obStyles.galleryAccessCard}>
        <View style={obStyles.galleryAccessIcon}>
          <Text style={{ fontSize: 36 }}>🖼️</Text>
        </View>
        <Text style={obStyles.galleryAccessTitle}>גישה לגלריית התמונות</Text>
        <Text style={obStyles.galleryAccessDesc}>
          כדי שה-AI יוכל לעדכן את המידות שלך אוטומטית, אנחנו צריכים גישה לגלריה שלך. המערכת תסרוק כל שבוע את התמונות האחרונות שצילמת, תזהה את הפנים שלך, ותמדוד שינויים במידות הגוף — ללא כל פעולה מצידך.
        </Text>
        <View style={obStyles.galleryAccessFeatures}>
          <View style={obStyles.galleryAccessFeatureRow}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <Text style={obStyles.galleryAccessFeatureText}>זיהוי פנים — ה-AI מוצא תמונות שלך בלבד</Text>
          </View>
          <View style={obStyles.galleryAccessFeatureRow}>
            <Text style={{ fontSize: 16 }}>🔄</Text>
            <Text style={obStyles.galleryAccessFeatureText}>סריקה אוטומטית שבועית של התמונות האחרונות</Text>
          </View>
          <View style={obStyles.galleryAccessFeatureRow}>
            <Text style={{ fontSize: 16 }}>📐</Text>
            <Text style={obStyles.galleryAccessFeatureText}>עדכון מידות אוטומטי — גובה, משקל, מסגרת גוף</Text>
          </View>
          <View style={obStyles.galleryAccessFeatureRow}>
            <Text style={{ fontSize: 16 }}>🔒</Text>
            <Text style={obStyles.galleryAccessFeatureText}>התמונות שלך נשארות פרטיות — ניתוח מקומי בלבד</Text>
          </View>
        </View>
      </View>

      {scanning ? (
        <View style={obStyles.galleryScanBox}>
          <Text style={{ fontSize: 28 }}>🔍</Text>
          <Text style={obStyles.galleryScanTitle}>מאשר גישה לגלריה...</Text>
          <View style={obStyles.galleryScanBar}>
            <View style={[obStyles.galleryScanBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={obStyles.galleryScanPct}>{progress}%</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={handleGrant} activeOpacity={0.8} style={obStyles.galleryGrantBtn}>
            <Text style={{ fontSize: 18 }}>✓</Text>
            <Text style={obStyles.galleryGrantBtnText}>אשר גישה לגלריה</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} activeOpacity={0.7}>
            <Text style={obStyles.gallerySkipText}>דלג כעת — ניתן לאשר מאוחר יותר בהגדרות</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const obStyles = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 24, backgroundColor: '#FFE566', borderBottomWidth: 1.5, borderBottomColor: '#1A1A1A' },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  headerTitle: { color: '#1A1A1A', fontSize: 22, fontWeight: '700', marginBottom: 6, fontFamily: "'Permanent Marker', cursive" },
  headerSub: { color: '#4A4A4A', fontSize: 16, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  explainCard: { borderRadius: 12, padding: 18, gap: 12, backgroundColor: '#1A1A1A', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #FFE566' } as React.CSSProperties,
  explainHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  explainIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: 'rgba(255,229,102,0.3)', alignItems: 'center', justifyContent: 'center' },
  explainTitle: { fontWeight: '800', fontSize: 16, color: '#FFE566', fontFamily: "'Permanent Marker', cursive" },
  explainSub: { fontSize: 14, color: 'rgba(255,229,102,0.6)', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  explainRowText: { fontSize: 14, color: 'rgba(255,229,102,0.75)', flex: 1, lineHeight: 20, textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  carouselStage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 22, gap: 14, minHeight: 130 },
  carouselIconWrap: { width: 72, height: 72, borderRadius: 12, backgroundColor: 'rgba(255,229,102,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFE566' },
  carouselIcon: { fontSize: 36 },
  carouselText: { fontSize: 22, fontWeight: '700', color: '#FFE566', textAlign: 'center', fontFamily: "'Permanent Marker', cursive" },
  carouselDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 4 },
  carouselDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,229,102,0.25)' },
  carouselDotActive: { backgroundColor: '#FFE566', width: 20 },
  dropZone: { borderWidth: 1.5, borderColor: '#1A1A1A', borderRadius: 12, padding: 36, alignItems: 'center', gap: 14, backgroundColor: '#FFFEF5', minHeight: 200, justifyContent: 'center', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  dropZoneActive: { borderColor: '#FFE566', backgroundColor: '#FFFACC', boxShadow: '3px 3px 0 #FFE566' } as React.CSSProperties,
  dropIcon: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#FFFACC', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  dropTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 18, fontFamily: "'Permanent Marker', cursive" },
  dropSub: { color: '#6B6B6B', fontSize: 15, marginTop: 6, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  tipBox: { backgroundColor: '#FFFACC', borderRadius: 8, padding: 10, flexDirection: 'row', gap: 8, width: '100%', borderWidth: 1, borderColor: '#FFE566' },
  tipText: { fontSize: 14, color: '#4A4A4A', lineHeight: 20, flex: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  btnRow: { flexDirection: 'row', gap: 10 },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#00FF66', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  cameraBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFEF5', borderWidth: 1.5, borderColor: '#1A1A1A', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  galleryBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanInfoCard: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 18, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  scanInfoTitle: { fontSize: 15, fontWeight: '700', color: '#4A4A4A', marginBottom: 12, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanInfoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  scanInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, width: '48%', borderWidth: 1, borderColor: '#FFE566' },
  scanInfoLabel: { fontSize: 15, color: '#2D2D2D', fontWeight: '500', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanFrame: { width: '100%', height: 280, borderRadius: 12, backgroundColor: '#1A1A1A', overflow: 'hidden', position: 'relative', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #FFE566' } as React.CSSProperties,
  scanPhoto: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  scanGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.3 },
  scanBeam: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: '#00FF66', shadowColor: '#00FF66', shadowRadius: 16, shadowOpacity: 0.6 },
  cornerBracket: { position: 'absolute', width: 24, height: 24 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  progressPct: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  progressTrack: { height: 8, backgroundColor: '#F5F0E0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFE566', borderRadius: 4 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  metricCard: { width: '48%', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1.5, boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  metricValue: { fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  metricLabel: { fontSize: 10, color: '#9A9A9A', marginTop: 2, letterSpacing: 0.5, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  metricSub: { fontSize: 12, color: '#6B6B6B', marginTop: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  resultBanner: { borderRadius: 12, padding: 18, borderWidth: 1.5, alignItems: 'center', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  resultPhoto: { width: 60, height: 60, borderRadius: 12, marginBottom: 10, borderWidth: 1.5, borderColor: '#1A1A1A' },
  resultBadges: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  resultBadge: { backgroundColor: '#FFE566', color: '#1A1A1A', fontSize: 11, fontWeight: '700', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1, borderColor: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  weeklyBadge: { backgroundColor: '#00FF66', color: '#1A1A1A', fontSize: 11, fontWeight: '700', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1, borderColor: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  resultTitle: { fontWeight: '700', fontSize: 18, color: '#00CC52', marginBottom: 4, fontFamily: "'Permanent Marker', cursive" },
  resultSub: { fontSize: 14, color: '#00CC52', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deltaCard: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #FFE566' } as React.CSSProperties,
  deltaTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 15, marginBottom: 10, fontFamily: "'Permanent Marker', cursive" },
  deltaSummary: { fontSize: 14, color: '#4A4A4A', marginBottom: 8, lineHeight: 20, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deltaChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  deltaChip: { backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, flexDirection: 'row', gap: 4, alignItems: 'center', borderWidth: 1, borderColor: '#FFE566' },
  deltaChipLabel: { fontSize: 12, color: '#6B6B6B', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deltaChipVal: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  bodyMetricsCard: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #00FF66' } as React.CSSProperties,
  bodyMetricsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bodyMetricsTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 15, fontFamily: "'Permanent Marker', cursive" },
  bodyMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bodyMetricItem: { width: '31%', backgroundColor: '#FFFACC', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#FFE566' },
  bodyMetricValue: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  bodyMetricUnit: { fontSize: 11, color: '#6B6B6B', marginTop: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  bodyMetricLabel: { fontSize: 13, color: '#4A4A4A', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  bodyMetricItemEditing: { borderColor: '#00FF66', borderWidth: 2, backgroundColor: '#E0FFF0', padding: 6 },
  bodyMetricInput: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', paddingVertical: 4, paddingHorizontal: 2, width: '100%', maxWidth: 60, borderWidth: 1, borderColor: '#1A1A1A', borderRadius: 8, backgroundColor: '#FFFEF5', fontFamily: "'Permanent Marker', cursive" },
  sizingCard: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  sizingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sizingTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 15, fontFamily: "'Permanent Marker', cursive" },
  editBtn: { backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: '#FFE566' },
  editBtnActive: { backgroundColor: '#FFE566', borderColor: '#1A1A1A' },
  editBtnText: { color: '#1A1A1A', fontSize: 14, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  editBtnTextActive: { color: '#1A1A1A' },
  sizingGrid: { flexDirection: 'row', gap: 8 },
  sizeBox: { flex: 1, backgroundColor: '#FFFEF5', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1.5, boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  sizeValue: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sizeLabel: { fontSize: 12, color: '#6B6B6B', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizeOptionsCol: { gap: 4, width: '100%' },
  sizeOptionWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 as any, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: 'transparent' } as React.CSSProperties,
  sizeOptionWrapActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566', boxShadow: '2px 2px 0 #1A1A1A' as any },
  sizeOptionCheck: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  sizeOption: { fontSize: 16, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizeOptionActive: { color: '#1A1A1A' },
  styleCard: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  styleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  styleTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 15, fontFamily: "'Permanent Marker', cursive" },
  stylePickerLabel: { fontSize: 14, fontWeight: '600', color: '#4A4A4A', marginBottom: 8, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  stylePickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  styleChip: { backgroundColor: '#F5F0E0', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1.5, borderColor: 'transparent' },
  styleChipActive: { backgroundColor: '#FFFACC', borderColor: '#FFE566' },
  styleChipText: { fontSize: 14, fontWeight: '600', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  styleChipTextActive: { color: '#1A1A1A' },
  styleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stylePrimary: { flex: 1, backgroundColor: '#FFFACC', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FFE566' },
  stylePrimaryText: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  stylePrimaryLabel: { fontSize: 12, color: '#6B6B6B', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  styleSecondary: { flex: 1, backgroundColor: '#E0FFF0', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#00FF66' },
  styleSecondaryText: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  styleSecondaryLabel: { fontSize: 12, color: '#6B6B6B', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  colorLabel: { fontSize: 14, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  colorDots: { flexDirection: 'row', gap: 6 },
  colorDot: { width: 22, height: 22, borderRadius: 8, borderWidth: 1.5, borderColor: '#1A1A1A' },
  colorDotsEditable: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  colorDotRemove: { color: '#FFFEF5', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  colorAddLabel: { fontSize: 14, fontWeight: '600', color: '#4A4A4A', marginBottom: 6, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  colorPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  colorPaletteDot: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: '#1A1A1A' },
  colorPaletteDotActive: { borderColor: '#FFE566', borderWidth: 3 },
  patternText: { fontSize: 14, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: '#FFE566' },
  tagText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  confirmBtn: { padding: 16, borderRadius: 12, backgroundColor: '#00FF66', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  confirmBtnText: { color: '#1A1A1A', fontSize: 17, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  faceMissingCard: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 18, borderWidth: 1.5, borderColor: '#1A1A1A', gap: 10, boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  faceMissingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faceMissingTitle: { fontSize: 16, fontWeight: '700', color: '#DC2626', fontFamily: "'Permanent Marker', cursive" },
  faceMissingText: { fontSize: 15, color: '#991B1B', lineHeight: 22, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  faceMissingBtn: { backgroundColor: '#DC2626', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', marginTop: 4, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  faceMissingBtnText: { color: '#FFFEF5', fontSize: 15, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  galleryAccessCard: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 24, alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #FFE566' } as React.CSSProperties,
  galleryAccessIcon: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#FFFACC', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFE566' },
  galleryAccessTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  galleryAccessDesc: { fontSize: 15, color: '#4A4A4A', lineHeight: 22, textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryAccessFeatures: { gap: 10, width: '100%', marginTop: 6 },
  galleryAccessFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#FFE566' },
  galleryAccessFeatureText: { fontSize: 14, color: '#2D2D2D', flex: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryGrantBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00FF66', borderRadius: 12, paddingVertical: 16, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  galleryGrantBtnText: { color: '#1A1A1A', fontSize: 17, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  gallerySkipText: { color: '#6B6B6B', fontSize: 15, fontWeight: '600', textAlign: 'center', paddingVertical: 8, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryScanBox: { alignItems: 'center', gap: 14, paddingVertical: 20 },
  galleryScanTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  galleryScanBar: { width: '100%', height: 8, backgroundColor: '#F5F0E0', borderRadius: 4, overflow: 'hidden' },
  galleryScanBarFill: { height: '100%', backgroundColor: '#00FF66', borderRadius: 4 },
  galleryScanPct: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  genderRow: { marginBottom: 12 },
  genderLabel: { fontSize: 14, fontWeight: '600', color: '#4A4A4A', marginBottom: 8, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  genderSelector: { flexDirection: 'row', gap: 8 },
  genderOption: { flex: 1, backgroundColor: '#F5F0E0', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  genderOptionActive: { backgroundColor: '#FFFACC', borderColor: '#FFE566' },
  genderOptionText: { fontSize: 15, fontWeight: '600', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  genderOptionTextActive: { color: '#1A1A1A' },
  genderDisplayRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  genderDisplayLabel: { fontSize: 15, fontWeight: '600', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  genderDisplayValue: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  updateResultsBtn: { marginTop: 12, backgroundColor: '#1A1A1A', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFE566' } as React.CSSProperties,
  updateResultsBtnText: { color: '#FFE566', fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  cameraOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  cameraModal: { width: '90%', maxWidth: 420, backgroundColor: '#FFFEF5', borderRadius: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #FFE566', overflow: 'hidden' } as React.CSSProperties,
  cameraModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#FFE566', borderBottomWidth: 1.5, borderBottomColor: '#1A1A1A' },
  cameraModalTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  cameraCloseBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  cameraCloseText: { color: '#FFE566', fontSize: 16, fontWeight: '700' },
  cameraPreviewWrap: { width: '100%', height: 420, backgroundColor: '#1A1A1A', position: 'relative', overflow: 'hidden' } as React.CSSProperties,
  cameraErrorBox: { alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, gap: 10 },
  cameraErrorText: { fontSize: 15, color: '#FFFEF5', textAlign: 'center', lineHeight: 22, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  cameraFallbackBtn: { backgroundColor: '#00FF66', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  cameraFallbackBtnText: { color: '#1A1A1A', fontSize: 14, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  cameraLoadingBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  cameraLoadingText: { fontSize: 16, color: '#FFFEF5', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  cameraGuideFrame: { position: 'absolute', top: '15%', left: '10%', right: '10%', bottom: '15%', borderWidth: 2, borderColor: 'rgba(0,255,102,0.5)', borderRadius: 12, borderStyle: 'dashed' } as React.CSSProperties,
  cameraControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 20, backgroundColor: '#FFFEF5' },
  cameraSwitchBtn: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#FFFACC', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  cameraSnapBtn: { width: 72, height: 72, borderRadius: 40, backgroundColor: '#FFFEF5', borderWidth: 4, borderColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  cameraSnapInner: { width: 56, height: 56, borderRadius: 30, backgroundColor: '#00FF66', borderWidth: 2, borderColor: '#1A1A1A' },
})
