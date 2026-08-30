import React, { useRef, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Image } from 'react-native'
import { LinearGradient } from '../components'
import {
  type ScannedSizes,
  type PersonBounds,
  type ScanEntry,
  TOP_SIZES, BOTTOM_SIZES, FIT_TYPES,
  PRIMARY_STYLES, SEC_STYLES,
  analyzeBodyImage,
  aiAnalysisToScannedSizes,
  formatTimestamp, nextScanId,
} from '../types'

type OnboardStep = 'upload' | 'scanning' | 'result' | 'gallery-access'

export function OnboardingScreen({ onNext, onScanned, onGalleryAdd, onGalleryAccess }: { onNext: () => void; onScanned: (s: ScannedSizes) => void; onGalleryAdd: (g: ScanEntry[]) => void; onGalleryAccess: (granted: boolean) => void }) {
  const [step, setStep] = useState<OnboardStep>('upload')
  const [scanProgress, setScanProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [sizes, setSizes] = useState<ScannedSizes | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  const [scanError, setScanError] = useState<string | null>(null)
  const [faceMissing, setFaceMissing] = useState(false)

  const resetScan = useCallback(() => {
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
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }

    setScanError(null)
    setSizes({
      sizing: { top: '', bottom: '', fit: '', bodyFrame: '', confidence: 0, baselineMatched: false, isWeeklyUpdate: false, measurementDelta: null, bodyMetrics: null },
      style: { primaryStyle: '', secondaryStyle: '', dominantColors: [], patternPreference: '', aestheticTags: [] },
      confidence: 0,
      preview: URL.createObjectURL(file),
      top: '',
      bottom: '',
      fit: '',
      personBounds: { top: 2, left: 10, width: 80, height: 96 },
    })
    setStep('scanning')
    setScanProgress(0)

    const progressInterval = setInterval(() => {
      setScanProgress((p) => {
        if (p >= 90) return 90
        return p + 2.5
      })
    }, 60)

    try {
      const { analysis, preview } = await analyzeBodyImage(file)
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
      setScanError(err instanceof Error ? err.message : 'AI analysis unavailable, using fallback')
    } finally {
      clearInterval(progressInterval)
      setScanProgress(100)
      setTimeout(() => setStep('result'), 400)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) startScan(file)
    e.target.value = ''
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <LinearGradient colors={['#0B1437', '#1A2F7A']} style={obStyles.header}>
        <View style={obStyles.progressRow}>
          {(['upload', 'scanning', 'result', 'gallery-access'] as OnboardStep[]).map((_s, i) => {
            const stepOrder = ['upload', 'scanning', 'result', 'gallery-access']
            const currentIdx = stepOrder.indexOf(step)
            const barColor = i <= currentIdx ? (step === 'gallery-access' && i === currentIdx ? '#2E5BFF' : i < currentIdx ? '#2ED573' : '#2E5BFF') : 'rgba(255,255,255,0.2)'
            return <View key={i} style={[obStyles.progressBar, { backgroundColor: barColor }]} />
          })}
        </View>
        <Text style={obStyles.headerTitle}>
          {step === 'upload' ? 'סריקת AI אישית' : step === 'scanning' ? 'סורק מידות...' : step === 'result' ? 'סריקה הושלמה ✓' : 'גישה לגלריה'}
        </Text>
        <Text style={obStyles.headerSub}>
          {step === 'upload' ? 'העלה תמונה וה-AI ימצא את המידה המדויקת שלך' : step === 'scanning' ? 'בינה מלאכותית מנתחת את מבנה הגוף שלך' : step === 'result' ? 'אישור מידות ופרופיל מוכן' : 'אישור גישה לגלריה לעדכון אוטומטי של מידות'}
        </Text>
      </LinearGradient>

      {/* Hidden file inputs for web */}
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />

      <View style={{ flex: 1, padding: 24, gap: 20 }}>
        {step === 'upload' && (
          <>
            <LinearGradient colors={['#0B1437', '#1A2F7A']} style={obStyles.explainCard}>
              <View style={obStyles.explainHeader}>
                <View style={obStyles.explainIcon}><Text style={{ fontSize: 20 }}>🤳</Text></View>
                <View>
                  <Text style={obStyles.explainTitle}>העלאת תמונה שלך הכוללת פנים וגוף</Text>
                  <Text style={obStyles.explainSub}>כדי שנוכל להתאים מוצרים בדיוק למידות שלך</Text>
                </View>
              </View>
              <View style={{ gap: 7 }}>
                {[
                  { icon: '📐', text: 'AI ינתח את המידות שלך ויתאים מוצרים בדיוק לגוף שלך' },
                  { icon: '🔄', text: 'המערכת תסרוק את הגלריה שלך כל שבוע ותעדכן את המידות אוטומטית' },
                  { icon: '🎯', text: 'ככל שתעלה יותר תמונות — הדיוק של ההתאמות ישתפר' },
                ].map(({ icon, text }) => (
                  <View key={text} style={obStyles.explainRow}>
                    <Text style={{ fontSize: 14 }}>{icon}</Text>
                    <Text style={obStyles.explainRowText}>{text}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>

            <View style={[obStyles.dropZone, dragOver && obStyles.dropZoneActive]}>
              <View style={obStyles.dropIcon}><Text style={{ fontSize: 32 }}>📸</Text></View>
              <Text style={obStyles.dropTitle}>העלאת תמונה שלך הכוללת פנים וגוף</Text>
              <Text style={obStyles.dropSub}>גרור לכאן, או בחר אחת מהכפתורים למטה</Text>
              <View style={obStyles.tipBox}>
                <Text style={{ fontSize: 16 }}>💡</Text>
                <Text style={obStyles.tipText}>לתוצאה מדויקת — העלה תמונה של <Text style={{ fontWeight: '700' }}>כל הגוף</Text> מהראש עד הרגליים, עמידה ישרה, על רקע בהיר.</Text>
              </View>
              <View style={obStyles.btnRow}>
                <TouchableOpacity
                  onPress={() => cameraRef.current?.click()}
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
              <Text style={obStyles.scanInfoTitle}>מה ה-AI סורק:</Text>
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
        {step === 'result' && sizes && <ResultView onNext={() => setStep('gallery-access')} sizes={sizes} scanError={scanError} faceMissing={faceMissing} onRetake={resetScan} />}
        {step === 'result' && !sizes && (
          <View style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#DC2626', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>שגיאה בסריקה</Text>
            <Text style={{ fontSize: 13, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif", textAlign: 'center' }}>אירעה שגיאה בניתוח התמונה. נסה שוב.</Text>
            <TouchableOpacity onPress={resetScan} activeOpacity={0.8} style={{ backgroundColor: '#2E5BFF', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>נסה שוב</Text>
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
                { borderColor: '#2ED573', width: 26, height: 26, marginLeft: isLeft ? -13 : -13, marginTop: isTop ? -13 : -13 },
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
          <View key={label} style={[obStyles.metricCard, { borderColor: done ? 'rgba(46,213,115,0.4)' : '#E2E8F0', backgroundColor: done ? '#F0FFF6' : '#F8FAFC' }]}>
            <Text style={[obStyles.metricValue, { color: done ? '#16A34A' : '#94A3B8' }]}>{value}</Text>
            <Text style={obStyles.metricLabel}>{label}</Text>
            <Text style={obStyles.metricSub}>{sub}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function ResultView({ onNext, sizes, scanError, faceMissing, onRetake }: { onNext: () => void; sizes: ScannedSizes; scanError: string | null; faceMissing: boolean; onRetake: () => void }) {
  const [editing, setEditing] = useState(false)
  const [topSize, setTopSize] = useState(sizes.sizing.top)
  const [bottomSize, setBottomSize] = useState(sizes.sizing.bottom)
  const [fitType, setFitType] = useState(sizes.sizing.fit)
  const [metricsEditing, setMetricsEditing] = useState(false)
  const [styleEditing, setStyleEditing] = useState(false)
  const [primaryStyle, setPrimaryStyle] = useState(sizes.style?.primaryStyle ?? '')
  const [secondaryStyle, setSecondaryStyle] = useState(sizes.style?.secondaryStyle ?? '')
  const [colors, setColors] = useState<string[]>(sizes.style?.domantColors ?? [])
  const COLOR_PALETTE = ['#1E293B', '#475569', '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#22C55E', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#FFFFFF', '#94A3B8']
  const [heightCm, setHeightCm] = useState(sizes.sizing.bodyMetrics?.estimated_height_cm?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(sizes.sizing.bodyMetrics?.estimated_weight_kg?.toString() ?? '')
  const [chestCm, setChestCm] = useState(sizes.sizing.bodyMetrics?.chest_circumference_cm?.toString() ?? '')
  const [waistCm, setWaistCm] = useState(sizes.sizing.bodyMetrics?.waist_circumference_cm?.toString() ?? '')
  const [hipsCm, setHipsCm] = useState(sizes.sizing.bodyMetrics?.hips_circumference_cm?.toString() ?? '')
  const [shoulderCm, setShoulderCm] = useState(sizes.sizing.bodyMetrics?.shoulder_width_cm?.toString() ?? '')
  const s = sizes.style ?? { primaryStyle: '', secondaryStyle: '', dominantColors: [] as string[], patternPreference: '', aestheticTags: [] as string[] }

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

      <View style={[obStyles.resultBanner, { backgroundColor: sizes.sizing.baselineMatched ? '#EEF2FF' : '#F0FFF6', borderColor: sizes.sizing.baselineMatched ? 'rgba(46,91,255,0.3)' : 'rgba(46,213,115,0.4)' }]}>
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
          <View style={obStyles.bodyMetricsGrid}>
            {[
              { label: 'גובה', value: heightCm, unit: 'ס"מ', set: setHeightCm },
              { label: 'משקל', value: weightKg, unit: 'ק"ג', set: setWeightKg },
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
        </View>
      )}

      {scanError && (
        <View style={{ backgroundColor: '#FEF2F2', borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: '#FECACA' }}>
          <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
            ⚠️ AI: {scanError}
          </Text>
          <Text style={{ fontSize: 11, color: '#991B1B', marginTop: 4, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
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
            { label: 'חולצה', value: topSize, options: TOP_SIZES, set: setTopSize },
            { label: 'מכנסיים', value: bottomSize, options: BOTTOM_SIZES, set: setBottomSize },
            { label: 'גזרה', value: fitType, options: FIT_TYPES, set: setFitType },
          ].map(({ label, value, options, set }) => (
            <View key={label} style={[obStyles.sizeBox, { borderColor: editing ? '#2E5BFF' : '#E2E8F0', borderWidth: editing ? 2 : 1.5 }]}>
              {editing ? (
                <View>
                  {options.map((o) => (
                    <TouchableOpacity key={o} onPress={() => set(o)} activeOpacity={0.7}>
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
        <TouchableOpacity onPress={onNext} activeOpacity={0.8} style={obStyles.confirmBtn}>
          <Text style={obStyles.confirmBtnText}>אשר פרופיל והמשך</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRetake} activeOpacity={0.7}>
          <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '600', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>סרוק תמונה חדשה</Text>
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
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 24 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  explainCard: { borderRadius: 20, padding: 18, gap: 12 },
  explainHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  explainIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(46,91,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  explainTitle: { fontWeight: '800', fontSize: 15, color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  explainSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  explainRowText: { fontSize: 12, color: 'rgba(255,255,255,0.75)', flex: 1, lineHeight: 18, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  dropZone: { borderWidth: 2, borderColor: '#CBD5E1', borderRadius: 24, padding: 36, alignItems: 'center', gap: 14, backgroundColor: '#fff', minHeight: 200, justifyContent: 'center' },
  dropZoneActive: { borderColor: '#2E5BFF', backgroundColor: '#EEF2FF' },
  dropIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  dropTitle: { fontWeight: '700', color: '#1E293B', fontSize: 16, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  dropSub: { color: '#94A3B8', fontSize: 13, marginTop: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  tipBox: { backgroundColor: '#FFFBEB', borderRadius: 14, padding: 10, flexDirection: 'row', gap: 8, width: '100%', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  tipText: { fontSize: 12, color: '#92400E', lineHeight: 18, flex: 1, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  btnRow: { flexDirection: 'row', gap: 10 },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2E5BFF', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  cameraBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  galleryBtnText: { color: '#475569', fontSize: 13, fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanInfoCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  scanInfoTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 12, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanInfoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  scanInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, width: '48%' },
  scanInfoLabel: { fontSize: 13, color: '#475569', fontWeight: '500', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanFrame: { width: '100%', height: 280, borderRadius: 24, backgroundColor: '#1a2f7a', overflow: 'hidden', position: 'relative' },
  scanPhoto: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  scanGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.3 },
  scanBeam: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: '#2ED573', shadowColor: '#2ED573', shadowRadius: 16, shadowOpacity: 0.6 },
  cornerBracket: { position: 'absolute', width: 24, height: 24 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  progressPct: { fontSize: 14, fontWeight: '700', color: '#2E5BFF' },
  progressTrack: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#2E5BFF', borderRadius: 4 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  metricCard: { width: '48%', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1.5 },
  metricValue: { fontSize: 13, fontWeight: '700' },
  metricLabel: { fontSize: 9, color: '#94A3B8', marginTop: 2, letterSpacing: 0.5 },
  metricSub: { fontSize: 10, color: '#64748B', marginTop: 1, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  resultBanner: { borderRadius: 20, padding: 18, borderWidth: 1.5, alignItems: 'center' },
  resultPhoto: { width: 60, height: 60, borderRadius: 30, marginBottom: 10 },
  resultBadges: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  resultBadge: { backgroundColor: '#2E5BFF', color: '#fff', fontSize: 10, fontWeight: '700', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  weeklyBadge: { backgroundColor: '#7C3AED', color: '#fff', fontSize: 10, fontWeight: '700', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  resultTitle: { fontWeight: '800', fontSize: 17, color: '#15803D', marginBottom: 4, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  resultSub: { fontSize: 12, color: '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deltaCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: '#E0E7FF' },
  deltaTitle: { fontWeight: '700', color: '#1E293B', fontSize: 13, marginBottom: 10, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deltaSummary: { fontSize: 12, color: '#475569', marginBottom: 8, lineHeight: 18, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deltaChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  deltaChip: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, flexDirection: 'row', gap: 4, alignItems: 'center' },
  deltaChipLabel: { fontSize: 10, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deltaChipVal: { fontSize: 11, fontWeight: '700', color: '#2E5BFF' },
  bodyMetricsCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: '#DBEAFE' },
  bodyMetricsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bodyMetricsTitle: { fontWeight: '700', color: '#1E40AF', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  bodyMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bodyMetricItem: { width: '31%', backgroundColor: '#EFF6FF', borderRadius: 12, padding: 8, alignItems: 'center' },
  bodyMetricValue: { fontSize: 16, fontWeight: '800', color: '#1E40AF' },
  bodyMetricUnit: { fontSize: 9, color: '#3B82F6', marginTop: 1 },
  bodyMetricLabel: { fontSize: 11, color: '#64748B', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  bodyMetricItemEditing: { borderColor: '#2E5BFF', borderWidth: 2, backgroundColor: '#EFF6FF', padding: 6 },
  bodyMetricInput: { fontSize: 14, fontWeight: '700', color: '#1E40AF', textAlign: 'center', paddingVertical: 4, paddingHorizontal: 2, width: '100%', maxWidth: 60, borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, backgroundColor: '#fff' },
  sizingCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16 },
  sizingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sizingTitle: { fontWeight: '700', color: '#1E293B', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  editBtn: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12 },
  editBtnActive: { backgroundColor: '#2E5BFF' },
  editBtnText: { color: '#2E5BFF', fontSize: 12, fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  editBtnTextActive: { color: '#fff' },
  sizingGrid: { flexDirection: 'row', gap: 8 },
  sizeBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1.5 },
  sizeValue: { fontSize: 16, fontWeight: '700', color: '#2E5BFF' },
  sizeLabel: { fontSize: 10, color: '#94A3B8', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeOption: { fontSize: 14, fontWeight: '700', color: '#475569', paddingVertical: 2 },
  sizeOptionActive: { color: '#2E5BFF' },
  styleCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16 },
  styleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  styleTitle: { fontWeight: '700', color: '#1E293B', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  stylePickerLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 8, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  stylePickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  styleChip: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1.5, borderColor: 'transparent' },
  styleChipActive: { backgroundColor: '#EEF2FF', borderColor: '#2E5BFF' },
  styleChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  styleChipTextActive: { color: '#2E5BFF' },
  styleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stylePrimary: { flex: 1, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 10, alignItems: 'center' },
  stylePrimaryText: { fontSize: 13, fontWeight: '700', color: '#2E5BFF' },
  stylePrimaryLabel: { fontSize: 10, color: '#64748B', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  styleSecondary: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, alignItems: 'center' },
  styleSecondaryText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  styleSecondaryLabel: { fontSize: 10, color: '#94A3B8', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  colorLabel: { fontSize: 11, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  colorDots: { flexDirection: 'row', gap: 6 },
  colorDot: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(0,0,0,0.08)' },
  colorDotsEditable: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  colorDotRemove: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  colorAddLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  colorPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  colorPaletteDot: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(0,0,0,0.08)' },
  colorPaletteDotActive: { borderColor: '#2E5BFF', borderWidth: 3 },
  patternText: { fontSize: 11, color: '#94A3B8' },
  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  tagText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  confirmBtn: { padding: 16, borderRadius: 18, backgroundColor: '#2E5BFF', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  faceMissingCard: { backgroundColor: '#FEF2F2', borderRadius: 18, padding: 18, borderWidth: 2, borderColor: '#FECACA', gap: 10 },
  faceMissingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faceMissingTitle: { fontSize: 15, fontWeight: '700', color: '#DC2626', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  faceMissingText: { fontSize: 13, color: '#991B1B', lineHeight: 20, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  faceMissingBtn: { backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', marginTop: 4 },
  faceMissingBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryAccessCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center', gap: 14, borderWidth: 2, borderColor: '#DBEAFE' },
  galleryAccessIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  galleryAccessTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryAccessDesc: { fontSize: 13, color: '#64748B', lineHeight: 20, textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryAccessFeatures: { gap: 10, width: '100%', marginTop: 6 },
  galleryAccessFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  galleryAccessFeatureText: { fontSize: 12, color: '#475569', flex: 1, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryGrantBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E5BFF', borderRadius: 18, paddingVertical: 16 },
  galleryGrantBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  gallerySkipText: { color: '#94A3B8', fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 8, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryScanBox: { alignItems: 'center', gap: 14, paddingVertical: 20 },
  galleryScanTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryScanBar: { width: '100%', height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  galleryScanBarFill: { height: '100%', backgroundColor: '#2E5BFF', borderRadius: 4 },
  galleryScanPct: { fontSize: 14, fontWeight: '700', color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
