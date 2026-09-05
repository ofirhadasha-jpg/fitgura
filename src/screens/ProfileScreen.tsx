import React, { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Image } from 'react-native'
import { LinearGradient, BottomNav } from '../components'
import {
  type Screen, type User, type UserDevice,
  type DeviceIdentificationResult,
  type DetectedDevice, type ScannedSizes, type ScanEntry, type GalleryAccessState,
  TOP_SIZES, BOTTOM_SIZES, FIT_TYPES, SHOE_SIZES_EU,
  computeBodyMetricsFromSizes,
  SCAN_NO_NEW_MESSAGE,
  nextDevId, identifyDevice,
  analyzeBodyImage, aiAnalysisToScannedSizes,
  formatTimestamp, nextScanId, computeDelta,
  formatNextScanDate, formatLastScanDate,
} from '../types'

const DEV_TYPE_EMOJI: Record<string, string> = { 'טלפון': '📱', 'טאבלט': '📟', 'אוזניות': '🎧', 'שעון': '⌚', 'אחר': '🔧' }

export function ProfileScreen({ onNav, user, onSignOut, detectedDevice, scannedSizes, setScannedSizes, scanGallery, setScanGallery, galleryAccess, setGalleryAccess }: {
  onNav: (s: Screen) => void
  user: User | null
  onSignOut: () => void
  detectedDevice: DetectedDevice | null
  scannedSizes: ScannedSizes | null
  setScannedSizes: (s: ScannedSizes) => void
  scanGallery: ScanEntry[]
  setScanGallery: (g: ScanEntry[] | ((prev: ScanEntry[]) => ScanEntry[])) => void
  galleryAccess: GalleryAccessState
  setGalleryAccess: (s: GalleryAccessState) => void
}) {
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [editingSizes, setEditingSizes] = useState(false)
  const [profTop, setProfTop] = useState(scannedSizes?.sizing.top ?? 'M')
  const [profBottom, setProfBottom] = useState(scannedSizes?.sizing.bottom ?? '32')
  const [profFit, setProfFit] = useState(scannedSizes?.sizing.fit ?? 'Slim Fit')
  const [profShoe, setProfShoe] = useState(scannedSizes?.shoeSize ?? '42')

  const [devices, setDevices] = useState<UserDevice[]>(() => {
    if (detectedDevice) {
      const extraParts = [
        detectedDevice.chip,
        detectedDevice.year,
        detectedDevice.screen_size_inches ? `${detectedDevice.screen_size_inches}"` : null,
      ].filter(Boolean)
      return [{
        id: 1,
        type: 'טלפון',
        brand: detectedDevice.brand,
        model: detectedDevice.model,
        extra: extraParts.join(' · '),
        emoji: '📱',
        primary: true,
      }]
    }
    return []
  })
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [addStep, setAddStep] = useState<'options' | 'scanning' | 'result' | 'form'>('options')
  const [scannedAccessories, setScannedAccessories] = useState<string[]>([])
  const [devPhotoUrl, setDevPhotoUrl] = useState<string | null>(null)
  const [addScanProgress, setAddScanProgress] = useState(0)
  const [newDevType, setNewDevType] = useState('טלפון')
  const [newDevBrand, setNewDevBrand] = useState('')
  const [newDevModel, setNewDevModel] = useState('')
  const [newDevExtra, setNewDevExtra] = useState('')
  const devCameraInputRef = useRef<HTMLInputElement>(null)
  const devGalleryInputRef = useRef<HTMLInputElement>(null)
  const [showDevCameraChoice, setShowDevCameraChoice] = useState(false)

  const galleryUploadRef = useRef<HTMLInputElement>(null)
  const galleryMultiUploadRef = useRef<HTMLInputElement>(null)
  const [autoScanning, setAutoScanning] = useState(false)
  const [autoScanProgress, setAutoScanProgress] = useState(0)
  const [autoScanPhase, setAutoScanPhase] = useState('')
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [lastAutoScan, setLastAutoScan] = useState<string | null>(null)
  const [nextScanDate, setNextScanDate] = useState<string>(formatNextScanDate())

  function handleAutoScan() {
    if (autoScanning) return
    galleryMultiUploadRef.current?.click()
  }

  async function handleGalleryMultiUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setGalleryError(null)
    setAutoScanning(true)
    setAutoScanProgress(0)
    setAutoScanPhase('סורק את הגלריה שלך...')

    const phaseInterval = setInterval(() => {
      setAutoScanProgress((p) => {
        if (p < 30) { setAutoScanPhase('סורק את הגלריה שלך...'); return p + 3 }
        if (p < 55) { setAutoScanPhase('מחפש תמונות שלך מהזמן האחרון...'); return p + 3 }
        if (p < 80) { setAutoScanPhase('מזהה פנים ומנתח מידות...'); return p + 3 }
        if (p < 95) { setAutoScanPhase('משווה עם המידות הקיימות...'); return p + 3 }
        clearInterval(phaseInterval)
        return p
      })
    }, 80)

    try {
      for (const photo of files) {
        const { analysis, preview } = await analyzeBodyImage(photo)
        const aiSizes = aiAnalysisToScannedSizes(analysis, preview)
        const prevSizing = scannedSizes?.sizing ?? null
        const delta = prevSizing ? computeDelta(prevSizing, aiSizes.sizing) : null
        aiSizes.sizing.baselineMatched = true
        aiSizes.sizing.isWeeklyUpdate = true
        aiSizes.sizing.measurementDelta = delta
        setScannedSizes(aiSizes)
        setProfTop(aiSizes.sizing.top)
        setProfBottom(aiSizes.sizing.bottom)
        setProfFit(aiSizes.sizing.fit)
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
        setScanGallery((prev) => [entry, ...prev])
      }
      setLastAutoScan(formatLastScanDate())
      setNextScanDate(formatNextScanDate())
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : 'הסריקה נכשלה')
    } finally {
      clearInterval(phaseInterval)
      setAutoScanProgress(100)
      setTimeout(() => { setAutoScanning(false); setAutoScanProgress(0); setAutoScanPhase('') }, 800)
    }
  }

  async function handleManualUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setGalleryError(null)
    setAutoScanning(true)
    setAutoScanProgress(0)
    setAutoScanPhase('מנתח את התמונה...')
    const progressInterval = setInterval(() => {
      setAutoScanProgress((p) => (p >= 90 ? 90 : p + 3))
    }, 60)

    try {
      const { analysis, preview } = await analyzeBodyImage(file)
      const aiSizes = aiAnalysisToScannedSizes(analysis, preview)
      const prevSizing = scannedSizes?.sizing ?? null
      const delta = prevSizing ? computeDelta(prevSizing, aiSizes.sizing) : null
      aiSizes.sizing.baselineMatched = true
      aiSizes.sizing.isWeeklyUpdate = true
      aiSizes.sizing.measurementDelta = delta
      setScannedSizes(aiSizes)
      setProfTop(aiSizes.sizing.top)
      setProfBottom(aiSizes.sizing.bottom)
      setProfFit(aiSizes.sizing.fit)
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
        source: 'הועלתה ידנית',
        isBaseline: false,
        delta,
      }
      setScanGallery((prev) => [entry, ...prev])
      setLastAutoScan(formatLastScanDate())
      setNextScanDate(formatNextScanDate())
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : 'ניתוח נכשל')
    } finally {
      clearInterval(progressInterval)
      setAutoScanProgress(100)
      setTimeout(() => { setAutoScanning(false); setAutoScanProgress(0); setAutoScanPhase('') }, 500)
    }
  }

  function handleProfTopChange(val: string) {
    setProfTop(val)
    if (scannedSizes) {
      const metrics = computeBodyMetricsFromSizes(val, profBottom, scannedSizes.sizing.bodyMetrics)
      setScannedSizes({
        ...scannedSizes,
        top: val,
        sizing: {
          ...scannedSizes.sizing,
          top: val,
          bodyMetrics: metrics,
        },
      })
    }
  }

  function handleProfBottomChange(val: string) {
    setProfBottom(val)
    if (scannedSizes) {
      const metrics = computeBodyMetricsFromSizes(profTop, val, scannedSizes.sizing.bodyMetrics)
      setScannedSizes({
        ...scannedSizes,
        bottom: val,
        sizing: {
          ...scannedSizes.sizing,
          bottom: val,
          bodyMetrics: metrics,
        },
      })
    }
  }

  function handleProfFitChange(val: string) {
    setProfFit(val)
    if (scannedSizes) {
      setScannedSizes({
        ...scannedSizes,
        fit: val,
        sizing: { ...scannedSizes.sizing, fit: val },
      })
    }
  }

  function handleProfShoeChange(val: string) {
    setProfShoe(val)
    if (scannedSizes) {
      setScannedSizes({ ...scannedSizes, shoeSize: val })
    }
  }

  function handleDevPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (devPhotoUrl) URL.revokeObjectURL(devPhotoUrl)
    setDevPhotoUrl(URL.createObjectURL(file))
    devPhotoFileRef.current = file
    setShowDevCameraChoice(false)
    startDeviceScan()
    runDeviceAI(file)
    e.target.value = ''
  }

  const devScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const devPhotoFileRef = useRef<File | null>(null)

  function startDeviceScan() {
    setAddStep('scanning')
    setAddScanProgress(0)
    let p = 0
    devScanTimerRef.current = setInterval(() => {
      p += Math.random() * 8 + 3
      setAddScanProgress(Math.min(p, 90))
    }, 180)
  }

  async function runDeviceAI(file: File) {
    try {
      const result = await identifyDevice(file)
      setNewDevBrand(result.brand)
      setNewDevModel(result.model)
      setNewDevExtra(result.extra)
      setNewDevType(result.device_type)
      setScannedAccessories(result.compatible_accessories)
    } catch {
      setNewDevBrand('')
      setNewDevModel('')
      setNewDevExtra('')
      setScannedAccessories([])
    } finally {
      if (devScanTimerRef.current) {
        clearInterval(devScanTimerRef.current)
        devScanTimerRef.current = null
      }
      setAddScanProgress(100)
      setTimeout(() => setAddStep('result'), 300)
    }
  }

  function addDevice() {
    if (!newDevBrand || !newDevModel) return
    setDevices((prev) => [...prev, {
      id: nextDevId(),
      type: newDevType,
      brand: newDevBrand,
      model: newDevModel,
      extra: newDevExtra,
      emoji: DEV_TYPE_EMOJI[newDevType] ?? '🔧',
    }])
    setShowAddDevice(false)
    setAddStep('options')
    if (devPhotoUrl) { URL.revokeObjectURL(devPhotoUrl); setDevPhotoUrl(null) }
    devPhotoFileRef.current = null
    setNewDevBrand(''); setNewDevModel(''); setNewDevExtra(''); setNewDevType('טלפון')
  }

  function removeDevice(id: number) {
    setDevices((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={['#0B1437', '#1A2F7A']} style={profStyles.header}>
        <View style={profStyles.headerOrb} />
        <View style={profStyles.headerContent}>
          <View style={profStyles.avatarBox}>
            <Text style={profStyles.avatarText}>{user ? user.name[0] : '👤'}</Text>
          </View>
          <View>
            <Text style={profStyles.userName}>{user ? user.name : 'אורח'}</Text>
            <View style={profStyles.userStatusRow}>
              <View style={profStyles.userStatusDot} />
              <Text style={profStyles.userStatusText}>
                {user ? `מחובר • ${user.email}` : 'גלישה כאורח — הוסף מוצר לשמורים שלך כדי להתחבר'}
              </Text>
              {user && (
                <TouchableOpacity onPress={onSignOut} activeOpacity={0.7} style={profStyles.signOutBtn}>
                  <Text style={profStyles.signOutBtnText}>התנתק</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
        {/* Auto-update toggle */}
        <View style={profStyles.card}>
          <View style={profStyles.toggleRow}>
            <View style={profStyles.toggleLeft}>
              <View style={[profStyles.toggleIcon, { backgroundColor: autoUpdate ? '#F0FFF6' : '#F8FAFC' }]}>
                <Text style={{ fontSize: 20 }}>🔄</Text>
              </View>
              <View>
                <Text style={profStyles.toggleTitle}>עדכון מידות אוטומטי</Text>
                <Text style={profStyles.toggleSub}>AI מעדכן מתמונות חדשות</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setAutoUpdate(!autoUpdate)}
              activeOpacity={0.8}
              style={[profStyles.toggleSwitch, { backgroundColor: autoUpdate ? '#2ED573' : '#E2E8F0' }]}
            >
              <View style={[profStyles.toggleKnob, { left: autoUpdate ? 25 : 3 }]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Current sizes */}
        <View style={profStyles.card}>
          <View style={profStyles.sizesHeader}>
            <Text style={profStyles.sizesTitle}>📐 המידות הנוכחיות</Text>
            <TouchableOpacity
              onPress={() => setEditingSizes(!editingSizes)}
              activeOpacity={0.7}
              style={[profStyles.editBtn, editingSizes && profStyles.editBtnActive]}
            >
              <Text style={[profStyles.editBtnText, editingSizes && profStyles.editBtnTextActive]}>
                {editingSizes ? 'שמור' : 'ערוך ידנית'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={profStyles.sizesGrid}>
            {[
              { label: 'חולצה', value: profTop, options: TOP_SIZES, set: handleProfTopChange },
              { label: 'מכנסיים', value: profBottom, options: BOTTOM_SIZES, set: handleProfBottomChange },
              { label: 'גזרה', value: profFit, options: FIT_TYPES, set: handleProfFitChange },
              { label: 'נעליים', value: profShoe, options: SHOE_SIZES_EU, set: handleProfShoeChange },
            ].map(({ label, value, options, set }) => (
              <View key={label} style={[profStyles.sizeBox, { borderColor: editingSizes ? '#2E5BFF' : '#E2E8F0', borderWidth: editingSizes ? 2 : 1.5 }]}>
                {editingSizes ? (
                  <>
                    {options.map((o) => (
                      <TouchableOpacity key={o} onPress={() => set(o)} activeOpacity={0.7}>
                        <Text style={[profStyles.sizeOption, value === o && profStyles.sizeOptionActive]}>{o}</Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={profStyles.sizeLabel}>{label}</Text>
                  </>
                ) : (
                  <>
                    <Text style={profStyles.sizeValue}>{value}</Text>
                    <Text style={profStyles.sizeLabel}>{label}</Text>
                  </>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* My Devices */}
        <View style={profStyles.card}>
          <View style={profStyles.devicesHeader}>
            <Text style={profStyles.devicesTitle}>📱 המכשירים שלי</Text>
            <TouchableOpacity
              onPress={() => { setShowAddDevice(true); setAddStep('options') }}
              activeOpacity={0.7}
              style={profStyles.addDeviceBtn}
            >
              <Text style={profStyles.addDeviceBtnText}>+ הוסף מכשיר</Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: 10 }}>
            {devices.map((dev) => (
              <View key={dev.id} style={[profStyles.deviceRow, { backgroundColor: dev.primary ? '#EEF2FF' : '#F8FAFC', borderColor: dev.primary ? 'rgba(46,91,255,0.25)' : '#F1F5F9' }]}>
                <View style={[profStyles.deviceEmojiBox, { backgroundColor: dev.primary ? '#DBEAFE' : '#F1F5F9' }]}>
                  <Text style={{ fontSize: 22 }}>{dev.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={profStyles.deviceName}>{dev.brand} {dev.model}</Text>
                    {dev.primary && <View style={profStyles.primaryBadge}><Text style={profStyles.primaryBadgeText}>ראשי</Text></View>}
                  </View>
                  <Text style={profStyles.deviceSub}>{dev.type} · {dev.extra}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => setEditingDeviceId(dev.id)} activeOpacity={0.7} style={profStyles.deviceActionBtn}>
                    <Text style={{ fontSize: 13 }}>✏️</Text>
                  </TouchableOpacity>
                  {!dev.primary && (
                    <TouchableOpacity onPress={() => removeDevice(dev.id)} activeOpacity={0.7} style={[profStyles.deviceActionBtn, { backgroundColor: '#FFF0F0' }]}>
                      <Text style={{ fontSize: 13 }}>🗑️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
          <Text style={profStyles.devicesNote}>Fitgura ישאב התאמות לכל מכשיר ברשימה</Text>
        </View>

        {/* Multi-photo precision recommendation card */}
        <View style={profStyles.precisionCard}>
          <View style={profStyles.precisionIconWrap}>
            <Text style={{ fontSize: 28 }}>📸</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={profStyles.precisionTitle}>לדיוק מירבי במידות</Text>
            <Text style={profStyles.precisionSub}>
              מומלץ להעלות תמונות נוספות מזוויות שונות (פרופיל, גב) להצלבת מידע והגעה להתאמה מוחלטת
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => galleryUploadRef.current?.click()}
            activeOpacity={0.8}
            style={profStyles.precisionUploadBtn}
          >
            <Text style={{ fontSize: 16 }}>📷</Text>
            <Text style={profStyles.precisionUploadBtnText}>העלאת תמונה נוספת</Text>
          </TouchableOpacity>
        </View>

        {/* AI scan gallery */}
        <View style={profStyles.card}>
          <input ref={galleryUploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleManualUpload} />
          <input ref={galleryMultiUploadRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleGalleryMultiUpload} />
          <View style={profStyles.galleryHeader}>
            <View>
              <Text style={profStyles.galleryTitle}>🖼️ גלריית סריקות AI</Text>
              <Text style={profStyles.gallerySub}>{scanGallery.length} תמונות שלך למדידה משולבת</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {galleryAccess === 'granted' ? (
                <View style={profStyles.galleryAccessBadge}>
                  <View style={profStyles.galleryAccessDot} />
                  <Text style={profStyles.galleryAccessText}>גישה אושרה</Text>
                </View>
              ) : galleryAccess === 'denied' ? (
                <TouchableOpacity onPress={() => setGalleryAccess('granted')} activeOpacity={0.7}>
                  <View style={[profStyles.galleryAccessBadge, { backgroundColor: '#FEF2F2' }]}>
                    <Text style={{ fontSize: 12 }}>⚠️</Text>
                    <Text style={[profStyles.galleryAccessText, { color: '#DC2626' }]}>אשר גישה</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              <Text style={profStyles.galleryNextScan}>סריקה הבאה: {nextScanDate}</Text>
            </View>
          </View>

          {/* Gallery access status / explanation */}
          {galleryAccess !== 'granted' && (
            <View style={profStyles.galleryAccessPrompt}>
              <Text style={{ fontSize: 28 }}>🖼️</Text>
              <View style={{ flex: 1 }}>
                <Text style={profStyles.galleryAccessPromptTitle}>
                  {galleryAccess === 'denied' ? 'גישה לגלריה נדרשת לעדכון אוטומטי' : 'אשר גישה לגלריה לעדכון אוטומטי'}
                </Text>
                <Text style={profStyles.galleryAccessPromptSub}>
                  ה-AI יסרוק את התמונות האחרונות שלך פעם בשבוע, יזהה את הפנים שלך, ויעדכן את המידות אוטומטית — ללא כל פעולה מצידך
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setGalleryAccess('granted')}
                activeOpacity={0.8}
                style={profStyles.galleryAccessGrantBtn}
              >
                <Text style={profStyles.galleryAccessGrantBtnText}>אשר</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Auto-scan progress */}
          {autoScanning && (
            <View style={profStyles.autoScanBox}>
              <View style={profStyles.autoScanHeader}>
                <Text style={{ fontSize: 24 }}>🔍</Text>
                <Text style={profStyles.autoScanTitle}>{autoScanPhase || 'סורק...'}</Text>
              </View>
              <View style={profStyles.autoScanBar}>
                <View style={[profStyles.autoScanBarFill, { width: `${autoScanProgress}%` }]} />
              </View>
              <Text style={profStyles.autoScanPct}>{Math.round(autoScanProgress)}%</Text>
            </View>
          )}

          {galleryError && (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1.5, borderColor: '#FECACA' }}>
              <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                ⚠️ {galleryError}
              </Text>
            </View>
          )}

          {/* Scan now button */}
          {galleryAccess === 'granted' && !autoScanning && (
            <TouchableOpacity
              onPress={handleAutoScan}
              activeOpacity={0.8}
              style={profStyles.scanNowBtn}
            >
              <Text style={{ fontSize: 18 }}>🔄</Text>
              <Text style={profStyles.scanNowBtnText}>סרוק גלריה עכשיו</Text>
            </TouchableOpacity>
          )}

          {/* Last scan info */}
          {lastAutoScan && !autoScanning && (
            <View style={profStyles.lastScanInfo}>
              <Text style={{ fontSize: 14 }}>✅</Text>
              <View style={{ flex: 1 }}>
                <Text style={profStyles.lastScanText}>סריקה אחרונה: {lastAutoScan}</Text>
                <Text style={profStyles.lastScanSub}>הסריקה הבאה תתבצע אוטומטית ב-{nextScanDate}</Text>
              </View>
            </View>
          )}

          {/* Gallery photos */}
          {scanGallery.length === 0 ? (
            <View style={profStyles.galleryEmptyBox}>
              <Text style={{ fontSize: 32 }}>📸</Text>
              <Text style={profStyles.galleryEmptyTitle}>אין תמונות בגלריה עדיין</Text>
              <Text style={profStyles.galleryEmptySub}>
                {galleryAccess === 'granted'
                  ? 'ה-AI יסרוק אוטומטית את הגלריה שלך כל שבוע וימצא תמונות חדשות שלך. ניתן גם ללחוץ "סרוק גלריה עכשיו" או להעלות תמונה ידנית.'
                  : 'אשר גישה לגלריה כדי שה-AI יוכל לסרוק אוטומטית ולמצוא תמונות שלך.'}
              </Text>
              <TouchableOpacity
                onPress={() => galleryUploadRef.current?.click()}
                activeOpacity={0.8}
                style={profStyles.manualUploadLink}
              >
                <Text style={profStyles.manualUploadLinkText}>או העלה תמונה ידנית</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Combined measurement strip */}
              <View style={profStyles.combinedStrip}>
                {scanGallery.slice(0, 3).map((scan) => (
                  <View key={scan.id} style={profStyles.combinedThumbWrap}>
                    <Image source={{ uri: scan.photoUrl }} style={profStyles.combinedThumb} />
                    <View style={profStyles.combinedThumbLabel}>
                      <Text style={profStyles.combinedThumbLabelTxt}>
                        {scan.isBaseline ? 'הרשמה' : scan.source.includes('אוטומטית') ? 'גלריה' : 'ידנית'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={profStyles.combinedStripSub}>
                מדידה משולבת מ-{Math.min(scanGallery.length, 3)} תמונות שלך — תמונת ההרשמה והתמונות האחרונות שזוהו מהגלריה
              </Text>

              <View style={profStyles.galleryStatusBar}>
                <View style={profStyles.galleryStatusDot} />
                <View style={{ flex: 1 }}>
                  <Text style={profStyles.galleryStatusTitle}>
                    AI שילב {Math.min(scanGallery.length, 3)} תמונות למדידה מדויקת
                  </Text>
                  <Text style={profStyles.galleryStatusSub}>
                    התמונות נבחרו לפי חותמת הזמן האחרונה מהגלריה שלך — רק תמונות שלך
                  </Text>
                </View>
                <Text style={{ fontSize: 18 }}>🔄</Text>
              </View>

              <View style={{ gap: 10 }}>
                {scanGallery.map((scan, i) => (
                  <View key={scan.id} style={[profStyles.scanRow, { backgroundColor: i === 0 ? '#F0FFF6' : '#F8FAFC', borderColor: i === 0 ? 'rgba(46,213,115,0.35)' : '#F1F5F9' }]}>
                    <View style={profStyles.scanThumbWrap}>
                      <Image source={{ uri: scan.photoUrl }} style={profStyles.scanThumb} />
                      {i === 0 && <View style={profStyles.scanThumbBadge}><Text style={{ fontSize: 9, color: '#fff' }}>✓</Text></View>}
                      {!scan.isBaseline && <View style={profStyles.scanWeeklyBadge}><Text style={{ fontSize: 9, color: '#fff' }}>🔄</Text></View>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View>
                          <Text style={profStyles.scanDate}>{scan.date} · {scan.time}</Text>
                          <View style={profStyles.scanSourceRow}>
                            <View style={[profStyles.scanSourceBadge, { backgroundColor: scan.isBaseline ? '#F1F5F9' : '#EEF2FF' }]}>
                              <Text style={[profStyles.scanSourceText, { color: scan.isBaseline ? '#94A3B8' : '#2E5BFF' }]}>{scan.source}</Text>
                            </View>
                          </View>
                        </View>
                        <Text style={[profStyles.scanConf, { color: i === 0 ? '#16A34A' : '#94A3B8' }]}>{scan.confidence}%</Text>
                      </View>
                      <View style={profStyles.scanChips}>
                        {[`חולצה: ${scan.top}`, `מכנסיים: ${scan.bottom}`, scan.fit].map((label) => (
                          <View key={label} style={[profStyles.scanChip, { backgroundColor: i === 0 ? 'rgba(46,213,115,0.12)' : '#F1F5F9' }]}>
                            <Text style={[profStyles.scanChipText, { color: i === 0 ? '#15803D' : '#64748B' }]}>{label}</Text>
                          </View>
                        ))}
                      </View>
                      {scan.delta && (
                        <View style={profStyles.scanDeltaRow}>
                          {Object.entries(scan.delta).filter(([k]) => k !== 'summary').map(([k, d]) => (
                            <View key={k} style={profStyles.scanDeltaBadge}>
                              <Text style={profStyles.scanDeltaText}>↔ {d}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={profStyles.scanConfBar}>
                        <View style={[profStyles.scanConfBarFill, { width: `${scan.confidence}%`, backgroundColor: i === 0 ? '#2ED573' : '#94A3B8' }]} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={profStyles.galleryNote}>
            הגלריה נסרקת אוטומטית כל שבוע · ה-AI מזהה את הפנים שלך ומעדכן מידות · ניתן גם להעלות תמונה ידנית
          </Text>
        </View>

        {/* Family CTA */}
        <TouchableOpacity activeOpacity={0.7} style={profStyles.familyCTA}>
          <Text style={{ fontSize: 26 }}>👨‍👩‍👧</Text>
          <View style={{ flex: 1 }}>
            <Text style={profStyles.familyCTATitle}>+ הוסף פרופיל משפחתי</Text>
            <Text style={profStyles.familyCTASub}>בקרוב — סריקת AI לכל הבית</Text>
          </View>
          <View style={profStyles.familyCTABadge}><Text style={profStyles.familyCTABadgeText}>בקרוב</Text></View>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Device Sheet */}
      {showAddDevice && (
        <View style={profStyles.sheetOverlay}>
          <TouchableOpacity
            onPress={() => { setShowAddDevice(false); setDevPhotoUrl(null); setShowDevCameraChoice(false); setAddStep('options') }}
            activeOpacity={1}
            style={profStyles.sheetBackdrop}
          />
          <View style={profStyles.sheet}>
            <input ref={devCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleDevPhoto} />
            <input ref={devGalleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleDevPhoto} />

            <View style={profStyles.sheetHeaderRow}>
              <Text style={profStyles.sheetTitle}>הוסף מכשיר</Text>
              <TouchableOpacity
                onPress={() => { setShowAddDevice(false); setDevPhotoUrl(null); setShowDevCameraChoice(false); setAddStep('options') }}
                activeOpacity={0.7}
                style={profStyles.sheetCloseBtn}
              >
                <Text style={{ color: '#64748B', fontSize: 15 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {addStep === 'options' && (
              <View style={{ gap: 12 }}>
                <Text style={profStyles.sheetDesc}>כיצד תרצה להוסיף את המכשיר?</Text>
                {!showDevCameraChoice ? (
                  <TouchableOpacity
                    onPress={() => setShowDevCameraChoice(true)}
                    activeOpacity={0.8}
                    style={profStyles.scanOptionBtn}
                  >
                    <Text style={{ fontSize: 28 }}>📷</Text>
                    <View>
                      <Text style={profStyles.scanOptionTitle}>צלם את המכשיר</Text>
                      <Text style={profStyles.scanOptionSub}>AI יזהה את המכשיר אוטומטית</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={profStyles.cameraChoiceBox}>
                    <View style={profStyles.cameraChoiceHeader}>
                      <Text style={{ fontSize: 20 }}>📷</Text>
                      <Text style={profStyles.cameraChoiceTitle}>בחר מקור תמונה</Text>
                    </View>
                    <View style={profStyles.cameraChoiceRow}>
                      <TouchableOpacity onPress={() => devCameraInputRef.current?.click()} activeOpacity={0.7} style={profStyles.cameraChoiceBtn}>
                        <Text style={{ fontSize: 26 }}>📸</Text>
                        <Text style={profStyles.cameraChoiceLabel}>מצלמה</Text>
                        <Text style={profStyles.cameraChoiceSub}>צלם עכשיו</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => devGalleryInputRef.current?.click()} activeOpacity={0.7} style={[profStyles.cameraChoiceBtn, { borderLeftWidth: 1, borderLeftColor: 'rgba(46,91,255,0.15)' }]}>
                        <Text style={{ fontSize: 26 }}>🖼️</Text>
                        <Text style={profStyles.cameraChoiceLabel}>גלריה</Text>
                        <Text style={profStyles.cameraChoiceSub}>בחר תמונה</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => setAddStep('form')}
                  activeOpacity={0.8}
                  style={profStyles.manualOptionBtn}
                >
                  <Text style={{ fontSize: 28 }}>✏️</Text>
                  <View>
                    <Text style={profStyles.manualOptionTitle}>הזן ידנית</Text>
                    <Text style={profStyles.manualOptionSub}>מלא יצרן, דגם, ופרטים</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {addStep === 'scanning' && (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <View style={profStyles.scanningIconBox}>
                  {devPhotoUrl
                    ? <Image source={{ uri: devPhotoUrl }} style={profStyles.scanningPhoto} />
                    : <Text style={{ fontSize: 36 }}>📷</Text>}
                </View>
                <Text style={profStyles.scanningTitle}>AI סורק ומזהה...</Text>
                <Text style={profStyles.scanningSub}>מנתח את התמונה ושואב פרטי מכשיר מהרשת</Text>
                <View style={profStyles.scanningBar}>
                  <View style={[profStyles.scanningBarFill, { width: `${addScanProgress}%` }]} />
                </View>
                <Text style={profStyles.scanningPct}>{Math.round(addScanProgress)}%</Text>
              </View>
            )}

            {addStep === 'result' && (
              <View style={{ gap: 16 }}>
                <View style={profStyles.resultBox}>
                  <View style={profStyles.resultIconBox}>
                    {devPhotoUrl
                      ? <Image source={{ uri: devPhotoUrl }} style={profStyles.resultPhoto} />
                      : <Text style={{ fontSize: 26 }}>{DEV_TYPE_EMOJI[newDevType] ?? '📱'}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={profStyles.resultBadgeRow}>
                      <View style={profStyles.resultBadge}><Text style={profStyles.resultBadgeText}>✓ זוהה</Text></View>
                    </View>
                    <Text style={profStyles.resultDeviceName}>{newDevBrand} {newDevModel}</Text>
                    <Text style={profStyles.resultDeviceExtra}>{newDevExtra}</Text>
                  </View>
                </View>
                <View>
                  <Text style={profStyles.accessoriesTitle}>🛍️ אביזרים מומלצים ({scannedAccessories.length})</Text>
                  <View style={{ gap: 8 }}>
                    {scannedAccessories.map((acc, i) => (
                      <View key={i} style={profStyles.accessoryRow}>
                        <View style={profStyles.accessoryIcon}>
                          <Text style={{ fontSize: 14 }}>{['🛡️', '🔍', '✏️', '⌨️', '🔌'][i % 5]}</Text>
                        </View>
                        <Text style={profStyles.accessoryText}>{acc}</Text>
                        <View style={profStyles.accessoryAddBtn}><Text style={{ fontSize: 11 }}>+</Text></View>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={() => setAddStep('form')} activeOpacity={0.7} style={profStyles.editDetailsBtn}>
                    <Text style={profStyles.editDetailsBtnText}>ערוך פרטים</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={addDevice} activeOpacity={0.8} style={profStyles.addDeviceConfirmBtn}>
                    <Text style={profStyles.addDeviceConfirmBtnText}>הוסף למכשירים שלי ✓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {addStep === 'form' && (
              <View style={{ gap: 14 }}>
                {newDevBrand && (
                  <View style={profStyles.aiDetectedBox}>
                    <Text style={{ fontSize: 16 }}>✅</Text>
                    <Text style={profStyles.aiDetectedText}>AI זיהה: {newDevBrand} {newDevModel}</Text>
                  </View>
                )}
                <View>
                  <Text style={profStyles.formLabel}>סוג מכשיר</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {['טלפון', 'טאבלט', 'אוזניות', 'שעון', 'אחר'].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setNewDevType(t)}
                        activeOpacity={0.7}
                        style={[profStyles.typeBtn, newDevType === t && profStyles.typeBtnActive]}
                      >
                        <Text style={[profStyles.typeBtnText, newDevType === t && profStyles.typeBtnTextActive]}>
                          {DEV_TYPE_EMOJI[t]} {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={profStyles.formLabel}>יצרן</Text>
                    <TextInput value={newDevBrand} onChangeText={setNewDevBrand} placeholder="Apple, Samsung..." style={profStyles.formInput} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={profStyles.formLabel}>דגם</Text>
                    <TextInput value={newDevModel} onChangeText={setNewDevModel} placeholder="Tab P12, S24..." style={profStyles.formInput} />
                  </View>
                </View>
                <View>
                  <Text style={profStyles.formLabel}>פרטים נוספים (גודל, שנה, שבב...)</Text>
                  <TextInput value={newDevExtra} onChangeText={setNewDevExtra} placeholder='12.7" · Snapdragon · 2024' style={profStyles.formInput} />
                </View>
                <TouchableOpacity
                  onPress={addDevice}
                  disabled={!newDevBrand || !newDevModel}
                  activeOpacity={0.8}
                  style={[profStyles.formSubmitBtn, (!newDevBrand || !newDevModel) && profStyles.formSubmitBtnDisabled]}
                >
                  <Text style={profStyles.formSubmitBtnText}>הוסף למכשירים שלי</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      <BottomNav current="profile" onNav={onNav} />
    </View>
  )
}

const profStyles = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 24, position: 'relative', overflow: 'hidden' },
  headerOrb: { position: 'absolute', top: -40, left: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(46,91,255,0.1)' },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarBox: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF6B6B', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.25)' },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#fff' },
  userName: { fontSize: 20, fontWeight: '700', color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  userStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  userStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ED573' },
  userStatusText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  signOutBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginLeft: 6 },
  signOutBtnText: { fontSize: 11, fontWeight: '700', color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: 'transparent' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontWeight: '700', color: '#1E293B', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  toggleSub: { fontSize: 11, color: '#94A3B8', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  toggleSwitch: { width: 50, height: 28, borderRadius: 14, justifyContent: 'center' },
  toggleKnob: { position: 'absolute', top: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  sizesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sizesTitle: { fontWeight: '700', color: '#1E293B', fontSize: 15, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  editBtn: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12 },
  editBtnActive: { backgroundColor: '#2E5BFF' },
  editBtnText: { color: '#2E5BFF', fontSize: 12, fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  editBtnTextActive: { color: '#fff' },
  sizesGrid: { flexDirection: 'row', gap: 10 },
  sizeBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1.5 },
  sizeValue: { fontSize: 18, fontWeight: '700', color: '#2E5BFF' },
  sizeLabel: { fontSize: 11, color: '#94A3B8', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeOption: { fontSize: 14, fontWeight: '700', color: '#475569', paddingVertical: 2 },
  sizeOptionActive: { color: '#2E5BFF' },
  devicesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  devicesTitle: { fontWeight: '700', color: '#1E293B', fontSize: 15, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  addDeviceBtn: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12 },
  addDeviceBtnText: { color: '#2E5BFF', fontSize: 12, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deviceRow: { borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5 },
  deviceEmojiBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deviceName: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  primaryBadge: { backgroundColor: '#EEF2FF', borderRadius: 5, paddingVertical: 1, paddingHorizontal: 6 },
  primaryBadgeText: { fontSize: 9, fontWeight: '700', color: '#2E5BFF' },
  deviceSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  deviceActionBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  devicesNote: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 10, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  galleryTitle: { fontWeight: '700', color: '#1E293B', fontSize: 15, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  gallerySub: { fontSize: 11, color: '#94A3B8', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryLastScan: { fontSize: 10, color: '#16A34A', fontWeight: '700' },
  galleryNextScan: { fontSize: 10, color: '#94A3B8', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryAccessBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0FFF6', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(46,213,115,0.3)' },
  galleryAccessDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ED573' },
  galleryAccessText: { fontSize: 10, fontWeight: '700', color: '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryAccessPrompt: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFBEB', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.3)' },
  galleryAccessPromptTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryAccessPromptSub: { fontSize: 11, color: '#B45309', marginTop: 3, lineHeight: 16, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryAccessGrantBtn: { backgroundColor: '#F59E0B', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  galleryAccessGrantBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  autoScanBox: { backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center', gap: 10 },
  autoScanHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoScanTitle: { fontSize: 14, fontWeight: '700', color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  autoScanBar: { width: '100%', height: 8, backgroundColor: '#DBEAFE', borderRadius: 4, overflow: 'hidden' },
  autoScanBarFill: { height: '100%', backgroundColor: '#2E5BFF', borderRadius: 4 },
  autoScanPct: { fontSize: 13, fontWeight: '700', color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanNowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E5BFF', borderRadius: 14, paddingVertical: 13, marginBottom: 12 },
  scanNowBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  lastScanInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F0FFF6', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(46,213,115,0.25)' },
  lastScanText: { fontSize: 12, fontWeight: '700', color: '#15803D', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  lastScanSub: { fontSize: 11, color: '#16A34A', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  manualUploadLink: { marginTop: 6, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#F1F5F9', borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  manualUploadLinkText: { fontSize: 13, fontWeight: '600', color: '#475569', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryEmptyBox: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 16 },
  galleryEmptyTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryEmptySub: { fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 18, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryStatusBar: { backgroundColor: '#F0FFF6', borderRadius: 14, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(46,213,115,0.25)' },
  galleryStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ED573' },
  galleryStatusTitle: { fontSize: 12, fontWeight: '700', color: '#15803D', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  galleryStatusSub: { fontSize: 11, color: '#16A34A', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanRow: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 12, borderWidth: 1.5 },
  scanThumbWrap: { position: 'relative' },
  scanThumb: { width: 54, height: 54, borderRadius: 13 },
  scanThumbBadge: { position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#2ED573', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  scanWeeklyBadge: { position: 'absolute', top: -4, left: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#2E5BFF', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  scanDate: { fontSize: 13, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  scanSourceBadge: { borderRadius: 5, paddingVertical: 1, paddingHorizontal: 6 },
  scanSourceText: { fontSize: 9, fontWeight: '600' },
  scanConf: { fontSize: 12, fontWeight: '700' },
  scanChips: { flexDirection: 'row', gap: 5, marginTop: 7, flexWrap: 'wrap' },
  scanChip: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  scanChipText: { fontSize: 11, fontWeight: '600' },
  scanDeltaRow: { flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  scanDeltaBadge: { backgroundColor: '#EEF2FF', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  scanDeltaText: { fontSize: 10, fontWeight: '700', color: '#2E5BFF' },
  scanConfBar: { marginTop: 7, height: 3, backgroundColor: '#E2E8F0', borderRadius: 2, overflow: 'hidden' },
  scanConfBarFill: { height: '100%', borderRadius: 2 },
  galleryNote: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 12, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  combinedStrip: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  combinedThumbWrap: { flex: 1, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  combinedThumb: { width: '100%', height: 120, borderRadius: 14 },
  combinedThumbLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(11,20,55,0.65)', paddingVertical: 3, alignItems: 'center' },
  combinedThumbLabelTxt: { fontSize: 10, fontWeight: '700', color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  combinedStripSub: { fontSize: 11, color: '#64748B', marginBottom: 12, lineHeight: 16, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  noNewBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, marginTop: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  noNewText: { fontSize: 12, fontWeight: '700', color: '#475569', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  noNewSub: { fontSize: 11, color: '#94A3B8', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  familyCTA: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#FECACA', backgroundColor: '#FFF5F5', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  familyCTATitle: { fontSize: 14, fontWeight: '700', color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  familyCTASub: { fontSize: 12, color: '#FB923C', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  familyCTABadge: { backgroundColor: 'rgba(255,107,107,0.12)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  familyCTABadgeText: { fontSize: 11, fontWeight: '700', color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,20,55,0.55)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, maxHeight: '85%' },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  sheetDesc: { fontSize: 13, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: 18, borderWidth: 2, borderColor: '#2E5BFF', backgroundColor: '#EEF2FF' },
  scanOptionTitle: { fontWeight: '700', fontSize: 15, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanOptionSub: { fontSize: 12, color: '#64748B', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  cameraChoiceBox: { borderRadius: 18, borderWidth: 2, borderColor: '#2E5BFF', backgroundColor: '#EEF2FF', overflow: 'hidden' },
  cameraChoiceHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cameraChoiceTitle: { fontWeight: '700', fontSize: 14, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  cameraChoiceRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(46,91,255,0.15)' },
  cameraChoiceBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  cameraChoiceLabel: { fontSize: 12, fontWeight: '700', color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  cameraChoiceSub: { fontSize: 10, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  manualOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: 18, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  manualOptionTitle: { fontWeight: '700', fontSize: 15, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  manualOptionSub: { fontSize: 12, color: '#94A3B8', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanningIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden' },
  scanningPhoto: { width: '100%', height: '100%' },
  scanningTitle: { fontWeight: '700', fontSize: 17, color: '#1E293B', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanningSub: { fontSize: 13, color: '#94A3B8', marginBottom: 20, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanningBar: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', width: '100%' },
  scanningBarFill: { height: '100%', backgroundColor: '#2E5BFF', borderRadius: 4 },
  scanningPct: { fontSize: 12, color: '#2E5BFF', fontWeight: '700', marginTop: 8 },
  resultBox: { backgroundColor: '#F0FFF6', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: 'rgba(46,213,115,0.35)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultIconBox: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#2ED573', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(46,213,115,0.4)' },
  resultPhoto: { width: '100%', height: '100%' },
  resultBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  resultBadge: { backgroundColor: '#BBF7D0', borderRadius: 6, paddingVertical: 1, paddingHorizontal: 7 },
  resultBadgeText: { fontSize: 12, fontWeight: '700', color: '#15803D' },
  resultDeviceName: { fontWeight: '700', fontSize: 15, color: '#166534' },
  resultDeviceExtra: { fontSize: 11, color: '#16A34A', marginTop: 1 },
  accessoriesTitle: { fontWeight: '700', fontSize: 14, color: '#1E293B', marginBottom: 10, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  accessoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  accessoryIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  accessoryText: { fontSize: 13, color: '#374151', flex: 1, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  accessoryAddBtn: { width: 20, height: 20, borderRadius: 6, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  editDetailsBtn: { flex: 1, padding: 13, borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', alignItems: 'center' },
  editDetailsBtnText: { color: '#475569', fontSize: 14, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  addDeviceConfirmBtn: { flex: 2, padding: 13, borderRadius: 14, backgroundColor: '#2E5BFF', alignItems: 'center' },
  addDeviceConfirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  aiDetectedBox: { backgroundColor: '#F0FFF6', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(46,213,115,0.3)' },
  aiDetectedText: { fontSize: 13, color: '#15803D', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  formLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  formInput: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', fontSize: 14, backgroundColor: '#F8FAFC', color: '#1E293B' },
  typeBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  typeBtnActive: { borderColor: '#2E5BFF', backgroundColor: '#EEF2FF' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#475569', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  typeBtnTextActive: { color: '#2E5BFF' },
  formSubmitBtn: { padding: 16, borderRadius: 18, backgroundColor: '#2E5BFF', alignItems: 'center' },
  formSubmitBtnDisabled: { backgroundColor: '#E2E8F0' },
  formSubmitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  precisionCard: { backgroundColor: '#EEF2FF', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: 'rgba(46,91,255,0.2)' },
  precisionIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  precisionTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  precisionSub: { fontSize: 12, color: '#475569', lineHeight: 18, marginTop: 4, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  precisionUploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2E5BFF', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, flexShrink: 0 },
  precisionUploadBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
