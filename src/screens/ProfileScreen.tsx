import React, { useRef, useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Image } from 'react-native'
import { BottomNav } from '../components'
import {
  type Screen, type User, type UserDevice,
  type DeviceIdentificationResult,
  type DetectedDevice, type ScannedSizes, type ScanEntry, type GalleryAccessState,
  TOP_SIZES, BOTTOM_SIZES, FIT_TYPES, SHOE_SIZES_EU,
  getBottomSizesForGender,
  computeBodyMetricsFromSizes,
  computeBodyMetricsFromHeightWeight,
  SCAN_NO_NEW_MESSAGE,
  nextDevId, identifyDevice,
  analyzeBodyImage, aiAnalysisToScannedSizes,
  formatTimestamp, nextScanId, computeDelta,
  formatNextScanDate, formatLastScanDate,
} from '../types'
import { SIZE_REGION_OPTIONS, SIZE_REGION_LABELS, formatFullPantsSizeLabel, type SizeRegion } from '../utils/sizeConverter'
import { supabase } from '../lib/supabase'

const DEV_TYPE_EMOJI: Record<string, string> = { 'טלפון': '📱', 'טאבלט': '📟', 'אוזניות': '🎧', 'שעון': '⌚', 'אחר': '🔧' }

export function ProfileScreen({ onNav, user, onSignOut, detectedDevice, scannedSizes, setScannedSizes, scanGallery, setScanGallery, galleryAccess, setGalleryAccess, preferredRegion, setPreferredRegion, registeredDevices, onAddDevice, onRemoveDevice }: {
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
  preferredRegion: SizeRegion
  setPreferredRegion: (r: SizeRegion) => void
  registeredDevices: string[]
  onAddDevice: (deviceName: string) => void
  onRemoveDevice: (deviceName: string) => void
}) {
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [editingSizes, setEditingSizes] = useState(false)
  const [profTop, setProfTop] = useState(scannedSizes?.sizing.top ?? 'M')
  const [profBottom, setProfBottom] = useState(scannedSizes?.sizing.bottom ?? '48')
  const [profFit, setProfFit] = useState(scannedSizes?.sizing.fit ?? 'Slim Fit')
  const [profShoe, setProfShoe] = useState(scannedSizes?.shoeSize ?? '42')

  // Sync local profile fields when scannedSizes changes externally (e.g. from onboarding or a new scan)
  useEffect(() => {
    if (scannedSizes) {
      setProfTop(scannedSizes.sizing.top)
      setProfBottom(scannedSizes.sizing.bottom)
      setProfFit(scannedSizes.sizing.fit)
      if (scannedSizes.shoeSize) setProfShoe(scannedSizes.shoeSize)
    }
  }, [scannedSizes?.sizing.top, scannedSizes?.sizing.bottom, scannedSizes?.sizing.fit, scannedSizes?.shoeSize])

  // Profile photo management
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(scannedSizes?.preview ?? null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoScanProgress, setPhotoScanProgress] = useState(0)
  const [photoScanPhase, setPhotoScanPhase] = useState('')
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoToast, setPhotoToast] = useState<string | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const photoUploadRef = useRef<HTMLInputElement>(null)

  // Load saved avatar path from profiles table and create a signed URL on mount
  useEffect(() => {
    if (!user) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('user_id', user.id)
          .maybeSingle()
        if (error) throw error
        if (data?.avatar_url) {
          const filePath = data.avatar_url
          const { data: signed, error: signError } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(filePath, 3600)
          if (signError) throw signError
          if (signed?.signedUrl) {
            setProfilePhotoUrl(signed.signedUrl)
          }
        }
      } catch (err) {
        console.error('[ProfileScreen] Failed to load profile photo URL:', err)
      }
    })()
  }, [user?.id])

  function showPhotoToast(msg: string) {
    setPhotoToast(msg)
    setTimeout(() => setPhotoToast(null), 3200)
  }

  async function handleReplacePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setPhotoError(null)
    setPhotoLoading(true)
    setPhotoScanProgress(0)
    setPhotoScanPhase('מעלה תמונה...')

    const progressInterval = setInterval(() => {
      setPhotoScanProgress((p) => {
        if (p < 30) { setPhotoScanPhase('מעלה תמונה...'); return p + 4 }
        if (p < 70) { setPhotoScanPhase('AI מנתח מידות...'); return p + 3 }
        if (p < 95) { setPhotoScanPhase('מעדכן פרופיל...'); return p + 3 }
        clearInterval(progressInterval)
        return p
      })
    }, 80)

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
      if (aiSizes.shoeSize) setProfShoe(aiSizes.shoeSize)

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
        source: 'החלפת תמונת פרופיל',
        isBaseline: true,
        delta,
      }
      setScanGallery((prev) => [entry, ...prev])

      if (user) {
        const filePath = `${user.id}/avatar.jpg`
        const { error: uploadError } = await supabase.storage
          .from('profile-photos')
          .upload(filePath, file, { upsert: true, contentType: file.type })
        if (uploadError) throw uploadError
        const { error: dbError } = await supabase
          .from('profiles')
          .upsert({ user_id: user.id, avatar_url: filePath }, { onConflict: 'user_id' })
        if (dbError) throw dbError
        const { data: signed, error: signError } = await supabase.storage
          .from('profile-photos')
          .createSignedUrl(filePath, 3600)
        if (signError) throw signError
        if (signed?.signedUrl) {
          setProfilePhotoUrl(signed.signedUrl)
        }
      } else {
        setProfilePhotoUrl(preview)
      }
      showPhotoToast('התמונה נסרקה והמידות עודכנו')
    } catch (err) {
      console.error('[ProfileScreen] Photo scan failed:', err)
      setPhotoError(err instanceof Error ? err.message : 'סריקת התמונה נכשלה. נסה שוב.')
    } finally {
      clearInterval(progressInterval)
      setPhotoScanProgress(100)
      setTimeout(() => { setPhotoLoading(false); setPhotoScanProgress(0); setPhotoScanPhase('') }, 600)
    }
  }

  async function handleRemovePhoto() {
    setShowRemoveConfirm(false)
    setPhotoError(null)
    setPhotoLoading(true)
    try {
      if (user) {
        const filePath = `${user.id}/avatar.jpg`
        await supabase.storage.from('profile-photos').remove([filePath])
        const { error: dbError } = await supabase
          .from('profiles')
          .upsert({ user_id: user.id, avatar_url: null }, { onConflict: 'user_id' })
        if (dbError) throw dbError
      }
      setProfilePhotoUrl(null)
      showPhotoToast('התמונה הוסרה')
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'הסרה נכשלה')
    } finally {
      setPhotoLoading(false)
    }
  }

  function handleRemoveScanPhoto(scanId: number) {
    setScanGallery((prev) => prev.filter((s) => s.id !== scanId))
    showPhotoToast('התמונה הוסרה מהגלריה')
  }

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

  // Sync devices added from the Feed screen into the profile device list
  useEffect(() => {
    setDevices((prev) => {
      const existingNames = new Set(prev.map((d) => `${d.brand} ${d.model}`.trim()))
      const additions: UserDevice[] = []
      for (const name of registeredDevices) {
        if (existingNames.has(name)) continue
        const parts = name.split(' ')
        const brand = parts[0] ?? name
        const model = parts.slice(1).join(' ') || '-'
        additions.push({
          id: nextDevId(),
          type: 'טלפון',
          brand,
          model,
          extra: '',
          emoji: '📱',
          primary: prev.length === 0 && additions.length === 0,
        })
      }
      return additions.length > 0 ? [...prev, ...additions] : prev
    })
  }, [registeredDevices])
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
      const updated = {
        ...scannedSizes,
        top: val,
        sizing: { ...scannedSizes.sizing, top: val, bodyMetrics: metrics },
      }
      setScannedSizes(updated)
      console.log('[ProfileScreen] Saved edited measurements:', { top: val, bottom: profBottom, fit: profFit, shoe: profShoe })
    }
  }

  function handleProfBottomChange(val: string) {
    setProfBottom(val)
    if (scannedSizes) {
      const metrics = computeBodyMetricsFromSizes(profTop, val, scannedSizes.sizing.bodyMetrics)
      const updated = {
        ...scannedSizes,
        bottom: val,
        sizing: { ...scannedSizes.sizing, bottom: val, bodyMetrics: metrics },
      }
      setScannedSizes(updated)
      console.log('[ProfileScreen] Saved edited measurements:', { top: profTop, bottom: val, fit: profFit, shoe: profShoe })
    }
  }

  function handleProfFitChange(val: string) {
    setProfFit(val)
    if (scannedSizes) {
      const updated = { ...scannedSizes, fit: val, sizing: { ...scannedSizes.sizing, fit: val } }
      setScannedSizes(updated)
      console.log('[ProfileScreen] Saved edited measurements:', { top: profTop, bottom: profBottom, fit: val, shoe: profShoe })
    }
  }

  function handleProfShoeChange(val: string) {
    setProfShoe(val)
    if (scannedSizes) {
      const updated = { ...scannedSizes, shoeSize: val }
      setScannedSizes(updated)
      console.log('[ProfileScreen] Saved edited measurements:', { top: profTop, bottom: profBottom, fit: profFit, shoe: val })
    }
  }

  function handleSaveSizes() {
    setEditingSizes(false)
    if (scannedSizes) {
      const metrics = computeBodyMetricsFromSizes(profTop, profBottom, scannedSizes.sizing.bodyMetrics)
      const updated: ScannedSizes = {
        ...scannedSizes,
        top: profTop,
        bottom: profBottom,
        fit: profFit,
        shoeSize: profShoe,
        sizing: {
          ...scannedSizes.sizing,
          top: profTop,
          bottom: profBottom,
          fit: profFit,
          bodyMetrics: metrics,
        },
      }
      setScannedSizes(updated)
      console.log('[ProfileScreen] Successfully saved edited measurements:', {
        top: profTop,
        bottom: profBottom,
        fit: profFit,
        shoe: profShoe,
        gender: scannedSizes.gender,
        bodyMetrics: metrics,
      })
    }
  }

  function handleProfHeightChange(val: string) {
    if (!scannedSizes) return
    const h = Number(val)
    const w = Number(scannedSizes.sizing.bodyMetrics?.estimated_weight_kg ?? 75)
    if (h > 0 && w > 0) {
      const metrics = computeBodyMetricsFromHeightWeight(h, w, scannedSizes.sizing.bodyMetrics)
      setScannedSizes({
        ...scannedSizes,
        sizing: { ...scannedSizes.sizing, bodyMetrics: metrics },
      })
    }
  }

  function handleProfWeightChange(val: string) {
    if (!scannedSizes) return
    const h = Number(scannedSizes.sizing.bodyMetrics?.estimated_height_cm ?? 175)
    const w = Number(val)
    if (h > 0 && w > 0) {
      const metrics = computeBodyMetricsFromHeightWeight(h, w, scannedSizes.sizing.bodyMetrics)
      setScannedSizes({
        ...scannedSizes,
        sizing: { ...scannedSizes.sizing, bodyMetrics: metrics },
      })
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
    const deviceName = `${newDevBrand} ${newDevModel}`.trim()
    setDevices((prev) => [...prev, {
      id: nextDevId(),
      type: newDevType,
      brand: newDevBrand,
      model: newDevModel,
      extra: newDevExtra,
      emoji: DEV_TYPE_EMOJI[newDevType] ?? '🔧',
    }])
    onAddDevice(deviceName)
    setShowAddDevice(false)
    setAddStep('options')
    if (devPhotoUrl) { URL.revokeObjectURL(devPhotoUrl); setDevPhotoUrl(null) }
    devPhotoFileRef.current = null
    setNewDevBrand(''); setNewDevModel(''); setNewDevExtra(''); setNewDevType('טלפון')
  }

  function removeDevice(id: number) {
    const dev = devices.find((d) => d.id === id)
    if (dev) onRemoveDevice(`${dev.brand} ${dev.model}`.trim())
    setDevices((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={profStyles.header}>
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
        {/* Hidden admin trigger — only visible to admin users */}
        {user?.is_admin && (
        <TouchableOpacity onPress={() => onNav('admin')} activeOpacity={1} delayLongPress={2000} onLongPress={() => onNav('admin')} style={profStyles.hiddenAdminTrigger}>
          <Text style={profStyles.versionLabel}>Fitgura v1.0</Text>
        </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
        {/* Profile photo management */}
        <View style={profStyles.card}>
          <Text style={profStyles.sizesTitle}>📸 תמונת פרופיל / סריקת גוף</Text>
          <Text style={profStyles.regionSub}>התמונה שהועלתה בתהליך ההרשמה</Text>
          <input ref={photoUploadRef} type="file" accept="image/*" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleReplacePhoto} />

          {/* Photo display area */}
          <View style={profStyles.photoDisplayArea}>
            {photoLoading ? (
              <View style={profStyles.photoPlaceholder}>
                <Text style={{ fontSize: 28 }}>{photoScanProgress < 30 ? '📤' : photoScanProgress < 70 ? '🤖' : '✅'}</Text>
                <Text style={profStyles.photoPlaceholderText}>{photoScanPhase || 'טוען...'}</Text>
                {photoScanProgress > 0 && photoScanProgress < 100 && (
                  <View style={{ width: '80%', height: 6, borderRadius: 3, backgroundColor: '#E5E0CC', marginTop: 8, overflow: 'hidden' }}>
                    <View style={{ width: `${photoScanProgress}%`, height: '100%', backgroundColor: '#00FF66', borderRadius: 3 }} />
                  </View>
                )}
              </View>
            ) : profilePhotoUrl ? (
              <Image source={{ uri: profilePhotoUrl }} style={profStyles.photoPreview} />
            ) : (
              <View style={profStyles.photoPlaceholder}>
                <Text style={{ fontSize: 36 }}>👤</Text>
                <Text style={profStyles.photoPlaceholderText}>אין תמונה</Text>
              </View>
            )}
          </View>

          {/* Action buttons */}
          <View style={profStyles.photoActionsRow}>
            <TouchableOpacity
              onPress={() => photoUploadRef.current?.click()}
              disabled={photoLoading}
              activeOpacity={0.8}
              style={[profStyles.photoBtn, profStyles.photoBtnPrimary, photoLoading && profStyles.photoBtnDisabled]}
            >
              <Text style={{ fontSize: 16 }}>🔄</Text>
              <Text style={profStyles.photoBtnPrimaryText}>החלף תמונה</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowRemoveConfirm(true)}
              disabled={photoLoading || !profilePhotoUrl}
              activeOpacity={0.8}
              style={[profStyles.photoBtn, profStyles.photoBtnDanger, (!profilePhotoUrl || photoLoading) && profStyles.photoBtnDisabled]}
            >
              <Text style={{ fontSize: 16 }}>🗑️</Text>
              <Text style={profStyles.photoBtnDangerText}>הסר תמונה</Text>
            </TouchableOpacity>
          </View>



          {photoError && (
            <View style={profStyles.photoErrorBox}>
              <Text style={profStyles.photoErrorText}>⚠️ {photoError}</Text>
            </View>
          )}
        </View>

        {/* Toast */}
        {photoToast && (
          <View style={profStyles.photoToast}>
            <Text style={profStyles.photoToastText}>✓ {photoToast}</Text>
          </View>
        )}

        {/* Remove confirmation modal */}
        {showRemoveConfirm && (
          <View style={profStyles.sheetOverlay}>
            <TouchableOpacity onPress={() => setShowRemoveConfirm(false)} activeOpacity={1} style={profStyles.sheetBackdrop} />
            <View style={profStyles.confirmSheet}>
              <Text style={profStyles.confirmTitle}>הסרת תמונה</Text>
              <Text style={profStyles.confirmDesc}>האם אתה בטוח שברצונך להסיר את תמונת הפרופיל? ניתן להעלות תמונה חדשה בכל עת.</Text>
              <View style={profStyles.confirmActionsRow}>
                <TouchableOpacity onPress={() => setShowRemoveConfirm(false)} activeOpacity={0.7} style={profStyles.confirmCancelBtn}>
                  <Text style={profStyles.confirmCancelBtnText}>ביטול</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRemovePhoto} activeOpacity={0.8} style={profStyles.confirmDeleteBtn}>
                  <Text style={profStyles.confirmDeleteBtnText}>כן, הסר</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Auto-update toggle */}
        <View style={profStyles.card}>
          <View style={profStyles.toggleRow}>
            <View style={profStyles.toggleLeft}>
              <View style={[profStyles.toggleIcon, { backgroundColor: autoUpdate ? '#E0FFF0' : '#F5F0E0' }]}>
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
              style={[profStyles.toggleSwitch, { backgroundColor: autoUpdate ? '#00FF66' : '#9A9A9A' }]}
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
              onPress={() => editingSizes ? handleSaveSizes() : setEditingSizes(true)}
              activeOpacity={0.7}
              style={[profStyles.editBtn, editingSizes && profStyles.editBtnActive]}
            >
              <Text style={[profStyles.editBtnText, editingSizes && profStyles.editBtnTextActive]}>
                {editingSizes ? 'אישור ושמירה' : 'ערוך ידנית'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={profStyles.sizesGrid}>
            {[
              { label: 'מידת חולצה', value: profTop, options: TOP_SIZES, set: handleProfTopChange },
              { label: 'מידת מכנסיים', value: profBottom, options: getBottomSizesForGender(scannedSizes?.gender), set: handleProfBottomChange },
              { label: 'מידת נעליים', value: profShoe, options: SHOE_SIZES_EU, set: handleProfShoeChange },
              { label: 'גזרה', value: profFit, options: FIT_TYPES, set: handleProfFitChange },
            ].map(({ label, value, options, set }) => (
              <View key={label} style={[profStyles.sizeBox, { borderColor: editingSizes ? '#FFE566' : '#9A9A9A', borderWidth: editingSizes ? 2 : 1.5 }]}>
                <Text style={profStyles.sizeLabel}>{label}</Text>
                {editingSizes ? (
                  <View style={profStyles.sizeOptionsRow}>
                    {options.map((o) => (
                      <TouchableOpacity key={o} onPress={() => set(o)} activeOpacity={0.7}
                        style={[profStyles.sizeOptionWrap, value === o && profStyles.sizeOptionWrapActive]}>
                        {value === o && <Text style={profStyles.sizeOptionCheck}>✓</Text>}
                        <Text style={[profStyles.sizeOption, value === o && profStyles.sizeOptionActive]}>{o}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={profStyles.sizeValue}>{value}</Text>
                )}
              </View>
            ))}
          </View>
          <Text style={profStyles.sizeRegionHint}>מידת המכנסיים נשמרת כ-{formatFullPantsSizeLabel(profBottom)}</Text>
        </View>

        <View style={profStyles.card}>
          <Text style={profStyles.sizesTitle}>אזור מידות מועדף</Text>
          <Text style={profStyles.regionSub}>בחר כיצד להציג מידות באפליקציה</Text>
          <View style={profStyles.regionOptionsRow}>
            {SIZE_REGION_OPTIONS.map((region) => (
              <TouchableOpacity
                key={region}
                onPress={() => setPreferredRegion(region)}
                activeOpacity={0.75}
                style={[profStyles.regionOption, preferredRegion === region && profStyles.regionOptionActive]}
              >
                <Text style={[profStyles.regionOptionText, preferredRegion === region && profStyles.regionOptionTextActive]}>
                  {SIZE_REGION_LABELS[region]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Body metrics editing — height/weight with proportional recalculation */}
        {scannedSizes?.sizing.bodyMetrics && (
          <View style={profStyles.card}>
            <View style={profStyles.sizesHeader}>
              <Text style={profStyles.sizesTitle}>📏 מידות גוף מדויקות</Text>
              <Text style={{ fontSize: 11, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>
                שינוי גובה/משקל מעדכן אוטומטית חזה, מותן, ירכיים וכתפיים
              </Text>
            </View>
            <View style={profStyles.bodyMetricsGrid}>
              {[
                { label: 'גובה', value: scannedSizes.sizing.bodyMetrics.estimated_height_cm, unit: 'ס"מ', onChange: handleProfHeightChange },
                { label: 'משקל', value: scannedSizes.sizing.bodyMetrics.estimated_weight_kg, unit: 'ק"ג', onChange: handleProfWeightChange },
                { label: 'חזה', value: scannedSizes.sizing.bodyMetrics.chest_circumference_cm, unit: 'ס"מ' },
                { label: 'מותן', value: scannedSizes.sizing.bodyMetrics.waist_circumference_cm, unit: 'ס"מ' },
                { label: 'ירכיים', value: scannedSizes.sizing.bodyMetrics.hips_circumference_cm, unit: 'ס"מ' },
                { label: 'כתפיים', value: scannedSizes.sizing.bodyMetrics.shoulder_width_cm, unit: 'ס"מ' },
              ].map(({ label, value, unit, onChange }) => (
                <View key={label} style={profStyles.bodyMetricItem}>
                  <View style={profStyles.bodyMetricFieldRow}>
                    <Text style={profStyles.bodyMetricLabel}>{label}</Text>
                    <TextInput
                      value={value != null ? String(value) : ''}
                      onChangeText={onChange ?? undefined}
                      keyboardType="numeric"
                      style={profStyles.bodyMetricInput}
                    />
                    <Text style={profStyles.bodyMetricUnit}>{unit}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

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
              <View key={dev.id} style={[profStyles.deviceRow, { backgroundColor: dev.primary ? '#FFFACC' : '#FFFEF5', borderColor: dev.primary ? '#FFE566' : '#9A9A9A' }]}>
                <View style={[profStyles.deviceEmojiBox, { backgroundColor: dev.primary ? '#FFFACC' : '#F5F0E0' }]}>
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
                    <TouchableOpacity onPress={() => removeDevice(dev.id)} activeOpacity={0.7} style={[profStyles.deviceActionBtn, { backgroundColor: '#FFFACC' }]}>
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
          <input ref={galleryUploadRef} type="file" accept="image/*" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleManualUpload} />
          <input ref={galleryMultiUploadRef} type="file" accept="image/*" multiple style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleGalleryMultiUpload} />
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
                  <View style={[profStyles.galleryAccessBadge, { backgroundColor: '#FFFACC' }]}>
                    <Text style={{ fontSize: 12 }}>⚠️</Text>
                    <Text style={[profStyles.galleryAccessText, { color: '#1A1A1A' }]}>אשר גישה</Text>
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
            <View style={{ backgroundColor: '#FFFACC', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1.5, borderColor: '#1A1A1A' }}>
              <Text style={{ fontSize: 12, color: '#1A1A1A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>
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
                  <View key={scan.id} style={[profStyles.scanRow, { backgroundColor: i === 0 ? '#E0FFF0' : '#FFFEF5', borderColor: i === 0 ? '#00FF66' : '#9A9A9A' }]}>
                    <View style={profStyles.scanThumbWrap}>
                      <Image source={{ uri: scan.photoUrl }} style={profStyles.scanThumb} />
                      {i === 0 && <View style={profStyles.scanThumbBadge}><Text style={{ fontSize: 9, color: '#1A1A1A' }}>✓</Text></View>}
                      {!scan.isBaseline && <View style={profStyles.scanWeeklyBadge}><Text style={{ fontSize: 9, color: '#1A1A1A' }}>🔄</Text></View>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View>
                          <Text style={profStyles.scanDate}>{scan.date} · {scan.time}</Text>
                          <View style={profStyles.scanSourceRow}>
                            <View style={[profStyles.scanSourceBadge, { backgroundColor: scan.isBaseline ? '#F5F0E0' : '#FFFACC' }]}>
                              <Text style={[profStyles.scanSourceText, { color: scan.isBaseline ? '#4A4A4A' : '#1A1A1A' }]}>{scan.source}</Text>
                            </View>
                          </View>
                        </View>
                        <Text style={[profStyles.scanConf, { color: i === 0 ? '#00CC52' : '#9A9A9A' }]}>{scan.confidence}%</Text>
                      </View>
                      <View style={profStyles.scanChips}>
                        {[`חולצה: ${scan.top}`, `מכנסיים: ${scan.bottom}`, scan.fit].map((label) => (
                          <View key={label} style={[profStyles.scanChip, { backgroundColor: i === 0 ? '#E0FFF0' : '#F5F0E0' }]}>
                            <Text style={[profStyles.scanChipText, { color: i === 0 ? '#00CC52' : '#4A4A4A' }]}>{label}</Text>
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
                        <View style={[profStyles.scanConfBarFill, { width: `${scan.confidence}%`, backgroundColor: i === 0 ? '#00FF66' : '#9A9A9A' }]} />
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveScanPhoto(scan.id)} activeOpacity={0.7} style={profStyles.scanDeleteBtn}>
                        <Text style={{ fontSize: 13 }}>🗑️</Text>
                        <Text style={profStyles.scanDeleteBtnText}>הסר</Text>
                      </TouchableOpacity>
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
            <input ref={devCameraInputRef} type="file" accept="image/*" capture="environment" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleDevPhoto} />
            <input ref={devGalleryInputRef} type="file" accept="image/*" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }} onChange={handleDevPhoto} />

            <View style={profStyles.sheetHeaderRow}>
              <Text style={profStyles.sheetTitle}>הוסף מכשיר</Text>
              <TouchableOpacity
                onPress={() => { setShowAddDevice(false); setDevPhotoUrl(null); setShowDevCameraChoice(false); setAddStep('options') }}
                activeOpacity={0.7}
                style={profStyles.sheetCloseBtn}
              >
                <Text style={{ color: '#4A4A4A', fontSize: 15 }}>✕</Text>
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
                      <Text style={profStyles.scanOptionTitle}>העלה את תמונת המכשיר</Text>
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
                      <TouchableOpacity onPress={() => devGalleryInputRef.current?.click()} activeOpacity={0.7} style={[profStyles.cameraChoiceBtn, { borderLeftWidth: 1, borderLeftColor: '#1A1A1A' }]}>
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

      <BottomNav current="profile" onNav={onNav} isAdmin={user?.is_admin === true} />
    </View>
  )
}

const PAPER_TEXTURE = 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)' as any

const profStyles = StyleSheet.create({
  header: {
    paddingTop: 56, paddingHorizontal: 28, paddingBottom: 28, position: 'relative', overflow: 'hidden',
    backgroundColor: '#FFE566',
    backgroundImage: PAPER_TEXTURE,
    borderBottomWidth: 2, borderBottomColor: '#1A1A1A',
    boxShadow: '0 3px 0 #1A1A1A' as any,
    borderRadius: 12 as any,
  } as any,
  headerOrb: { position: 'absolute', top: -40, left: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(26,26,26,0.06)' },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarBox: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#FFFEF5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  userName: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  userStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  userStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00FF66' },
  userStatusText: { fontSize: 12, color: '#2D2D2D', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  signOutBtn: { backgroundColor: '#1A1A1A', borderRadius: 8 as any, paddingVertical: 4, paddingHorizontal: 10, marginLeft: 6, boxShadow: '2px 2px 0 #F5C842' as any },
  signOutBtnText: { fontSize: 11, fontWeight: '700', color: '#FFE566', fontFamily: "'Permanent Marker', cursive" },
  card: {
    backgroundColor: '#FFFEF5',
    backgroundImage: PAPER_TEXTURE,
    borderRadius: 12 as any,
    padding: 16, borderWidth: 1.5, borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #1A1A1A' as any,
  } as any,
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleIcon: { width: 40, height: 40, borderRadius: 8 as any, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  toggleTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 14, fontFamily: "'Permanent Marker', cursive" },
  toggleSub: { fontSize: 11, color: '#4A4A4A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  toggleSwitch: { width: 50, height: 28, borderRadius: 14, justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  toggleKnob: { position: 'absolute', top: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFEF5', borderWidth: 1.5, borderColor: '#1A1A1A' },
  sizesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sizesTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 15, fontFamily: "'Permanent Marker', cursive" },
  editBtn: { backgroundColor: '#FFFACC', borderRadius: 8 as any, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  editBtnActive: { backgroundColor: '#FFE566', boxShadow: '2px 2px 0 #1A1A1A' as any },
  editBtnText: { color: '#1A1A1A', fontSize: 12, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  editBtnTextActive: { color: '#1A1A1A' },
  sizesGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  sizeBox: { flex: 1, minWidth: 150, backgroundColor: '#FFFEF5', borderRadius: 12 as any, padding: 12, alignItems: 'stretch', borderWidth: 1.5, borderColor: '#9A9A9A' },
  sizeValue: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', textAlign: 'right', fontFamily: "'Permanent Marker', cursive" },
  sizeRegionHint: { fontSize: 11, color: '#4A4A4A', marginTop: 10, textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  regionSub: { fontSize: 11, color: '#9A9A9A', marginTop: 4, marginBottom: 12, textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  regionOptionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  regionOption: { flex: 1, minWidth: 88, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 as any, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5', alignItems: 'center' },
  regionOptionActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566', boxShadow: '2px 2px 0 #1A1A1A' as any },
  regionOptionText: { fontSize: 12, fontWeight: '700', color: '#4A4A4A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  regionOptionTextActive: { color: '#1A1A1A' },
  sizeLabel: { fontSize: 11, color: '#2D2D2D', marginBottom: 8, textAlign: 'right', fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizeOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' },
  sizeOptionWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 as any, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: 'transparent' } as React.CSSProperties,
  sizeOptionWrapActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566', boxShadow: '2px 2px 0 #1A1A1A' as any },
  sizeOptionCheck: { fontSize: 12, fontWeight: '700', color: '#1A1A1A' },
  sizeOption: { fontSize: 14, fontWeight: '700', color: '#2D2D2D', fontFamily: "'Permanent Marker', cursive" },
  sizeOptionActive: { color: '#1A1A1A' },
  devicesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  devicesTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 15, fontFamily: "'Permanent Marker', cursive" },
  addDeviceBtn: { backgroundColor: '#00FF66', borderRadius: 8 as any, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  addDeviceBtnText: { color: '#1A1A1A', fontSize: 13, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  deviceRow: { borderRadius: 12 as any, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#9A9A9A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  deviceEmojiBox: { width: 42, height: 42, borderRadius: 8 as any, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  deviceName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  primaryBadge: { backgroundColor: '#FFE566', borderRadius: 8 as any, paddingVertical: 1, paddingHorizontal: 6, borderWidth: 1, borderColor: '#1A1A1A' },
  primaryBadgeText: { fontSize: 9, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  deviceSub: { fontSize: 11, color: '#4A4A4A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deviceActionBtn: { width: 30, height: 30, borderRadius: 8 as any, backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  devicesNote: { fontSize: 11, color: '#9A9A9A', textAlign: 'center', marginTop: 10, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  galleryTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 15, fontFamily: "'Permanent Marker', cursive" },
  gallerySub: { fontSize: 11, color: '#9A9A9A', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryLastScan: { fontSize: 10, color: '#00CC52', fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  galleryNextScan: { fontSize: 10, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryAccessBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E0FFF0', borderRadius: 8 as any, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: '#1A1A1A' },
  galleryAccessDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00FF66' },
  galleryAccessText: { fontSize: 10, fontWeight: '700', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  galleryAccessPrompt: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFACC', borderRadius: 12 as any, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  galleryAccessPromptTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  galleryAccessPromptSub: { fontSize: 11, color: '#2D2D2D', marginTop: 3, lineHeight: 16, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryAccessGrantBtn: { backgroundColor: '#00FF66', borderRadius: 8 as any, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  galleryAccessGrantBtnText: { color: '#1A1A1A', fontSize: 13, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  autoScanBox: { backgroundColor: '#FFFACC', borderRadius: 12 as any, padding: 16, marginBottom: 12, alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  autoScanHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoScanTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  autoScanBar: { width: '100%', height: 8, backgroundColor: '#F5F0E0', borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#1A1A1A' },
  autoScanBarFill: { height: '100%', backgroundColor: '#FFE566', borderRadius: 4 },
  autoScanPct: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  scanNowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00FF66', borderRadius: 12 as any, paddingVertical: 13, marginBottom: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any },
  scanNowBtnText: { color: '#1A1A1A', fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  lastScanInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E0FFF0', borderRadius: 12 as any, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  lastScanText: { fontSize: 12, fontWeight: '700', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  lastScanSub: { fontSize: 11, color: '#00CC52', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  manualUploadLink: { marginTop: 6, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#F5F0E0', borderRadius: 8 as any, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  manualUploadLinkText: { fontSize: 13, fontWeight: '600', color: '#2D2D2D', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryEmptyBox: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 16 },
  galleryEmptyTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  galleryEmptySub: { fontSize: 12, color: '#9A9A9A', textAlign: 'center', lineHeight: 18, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  galleryStatusBar: { backgroundColor: '#E0FFF0', borderRadius: 12 as any, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  galleryStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00FF66' },
  galleryStatusTitle: { fontSize: 12, fontWeight: '700', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  galleryStatusSub: { fontSize: 11, color: '#00CC52', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanRow: { flexDirection: 'row', gap: 12, borderRadius: 12 as any, padding: 12, borderWidth: 1.5, borderColor: '#9A9A9A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  scanThumbWrap: { position: 'relative' },
  scanThumb: { width: 54, height: 54, borderRadius: 8 as any, borderWidth: 1.5, borderColor: '#1A1A1A' },
  scanThumbBadge: { position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#00FF66', borderWidth: 1.5, borderColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  scanWeeklyBadge: { position: 'absolute', top: -4, left: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFE566', borderWidth: 1.5, borderColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  scanDate: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  scanSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  scanSourceBadge: { borderRadius: 8 as any, paddingVertical: 1, paddingHorizontal: 6, borderWidth: 1, borderColor: '#1A1A1A' },
  scanSourceText: { fontSize: 9, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanConf: { fontSize: 12, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  scanChips: { flexDirection: 'row', gap: 5, marginTop: 7, flexWrap: 'wrap' },
  scanChip: { borderRadius: 8 as any, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: '#1A1A1A' },
  scanChipText: { fontSize: 11, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanDeltaRow: { flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  scanDeltaBadge: { backgroundColor: '#FFFACC', borderRadius: 8 as any, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1, borderColor: '#1A1A1A' },
  scanDeltaText: { fontSize: 10, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  scanConfBar: { marginTop: 7, height: 3, backgroundColor: '#F5F0E0', borderRadius: 2, overflow: 'hidden' },
  scanConfBarFill: { height: '100%', borderRadius: 2 },
  scanDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8 as any, backgroundColor: '#FFFACC', borderWidth: 1.5, borderColor: '#1A1A1A', alignSelf: 'flex-start', boxShadow: '2px 2px 0 #1A1A1A' as any },
  scanDeleteBtnText: { fontSize: 11, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  galleryNote: { fontSize: 11, color: '#9A9A9A', textAlign: 'center', marginTop: 12, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  combinedStrip: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  combinedThumbWrap: { flex: 1, borderRadius: 8 as any, overflow: 'hidden', position: 'relative', borderWidth: 1.5, borderColor: '#1A1A1A' },
  combinedThumb: { width: '100%', height: 120, borderRadius: 8 as any },
  combinedThumbLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(26,26,26,0.75)', paddingVertical: 3, alignItems: 'center' },
  combinedThumbLabelTxt: { fontSize: 10, fontWeight: '700', color: '#FFE566', fontFamily: "'Permanent Marker', cursive" },
  combinedStripSub: { fontSize: 11, color: '#4A4A4A', marginBottom: 12, lineHeight: 16, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  noNewBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFEF5', borderRadius: 12 as any, padding: 12, marginTop: 12, borderWidth: 1.5, borderColor: '#9A9A9A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  noNewText: { fontSize: 12, fontWeight: '700', color: '#2D2D2D', fontFamily: "'Permanent Marker', cursive" },
  noNewSub: { fontSize: 11, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  familyCTA: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#1A1A1A', backgroundColor: '#FFFACC', borderRadius: 12 as any, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: '3px 3px 0 #1A1A1A' as any },
  familyCTATitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  familyCTASub: { fontSize: 12, color: '#4A4A4A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  familyCTABadge: { backgroundColor: '#FFE566', borderRadius: 8 as any, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1.5, borderColor: '#1A1A1A' },
  familyCTABadgeText: { fontSize: 11, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.55)' },
  sheet: { backgroundColor: '#FFFEF5', backgroundImage: PAPER_TEXTURE, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, maxHeight: '85%', borderWidth: 2, borderColor: '#1A1A1A' } as any,
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  sheetDesc: { fontSize: 13, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: 12 as any, borderWidth: 2, borderColor: '#1A1A1A', backgroundColor: '#FFFACC', boxShadow: '3px 3px 0 #1A1A1A' as any },
  scanOptionTitle: { fontWeight: '700', fontSize: 15, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  scanOptionSub: { fontSize: 12, color: '#4A4A4A', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  cameraChoiceBox: { borderRadius: 12 as any, borderWidth: 2, borderColor: '#1A1A1A', backgroundColor: '#FFFACC', overflow: 'hidden' },
  cameraChoiceHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cameraChoiceTitle: { fontWeight: '700', fontSize: 14, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  cameraChoiceRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  cameraChoiceBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  cameraChoiceLabel: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  cameraChoiceSub: { fontSize: 10, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  manualOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: 12 as any, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5', boxShadow: '2px 2px 0 #1A1A1A' as any },
  manualOptionTitle: { fontWeight: '700', fontSize: 15, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  manualOptionSub: { fontSize: 12, color: '#9A9A9A', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanningIconBox: { width: 80, height: 80, borderRadius: 12 as any, backgroundColor: '#FFFACC', alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: '#1A1A1A' },
  scanningPhoto: { width: '100%', height: '100%' },
  scanningTitle: { fontWeight: '700', fontSize: 17, color: '#1A1A1A', marginBottom: 6, fontFamily: "'Permanent Marker', cursive" },
  scanningSub: { fontSize: 13, color: '#9A9A9A', marginBottom: 20, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanningBar: { height: 8, backgroundColor: '#F5F0E0', borderRadius: 4, overflow: 'hidden', width: '100%', borderWidth: 1, borderColor: '#1A1A1A' },
  scanningBarFill: { height: '100%', backgroundColor: '#FFE566', borderRadius: 4 },
  scanningPct: { fontSize: 12, color: '#1A1A1A', fontWeight: '700', marginTop: 8, fontFamily: "'Permanent Marker', cursive" },
  resultBox: { backgroundColor: '#E0FFF0', borderRadius: 12 as any, padding: 14, borderWidth: 1.5, borderColor: '#1A1A1A', flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: '3px 3px 0 #1A1A1A' as any },
  resultIconBox: { width: 56, height: 56, borderRadius: 12 as any, backgroundColor: '#00FF66', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: '#1A1A1A' },
  resultPhoto: { width: '100%', height: '100%' },
  resultBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  resultBadge: { backgroundColor: '#E0FFF0', borderRadius: 8 as any, paddingVertical: 1, paddingHorizontal: 7, borderWidth: 1, borderColor: '#1A1A1A' },
  resultBadgeText: { fontSize: 12, fontWeight: '700', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  resultDeviceName: { fontWeight: '700', fontSize: 15, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  resultDeviceExtra: { fontSize: 11, color: '#00CC52', marginTop: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accessoriesTitle: { fontWeight: '700', fontSize: 14, color: '#1A1A1A', marginBottom: 10, fontFamily: "'Permanent Marker', cursive" },
  accessoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFEF5', borderRadius: 8 as any, padding: 10, borderWidth: 1.5, borderColor: '#9A9A9A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  accessoryIcon: { width: 28, height: 28, borderRadius: 8 as any, backgroundColor: '#FFFACC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1A1A1A' },
  accessoryText: { fontSize: 13, color: '#2D2D2D', flex: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accessoryAddBtn: { width: 20, height: 20, borderRadius: 8 as any, backgroundColor: '#FFE566', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1A1A1A' },
  editDetailsBtn: { flex: 1, padding: 13, borderRadius: 8 as any, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5', alignItems: 'center', boxShadow: '2px 2px 0 #1A1A1A' as any },
  editDetailsBtnText: { color: '#2D2D2D', fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  addDeviceConfirmBtn: { flex: 2, padding: 13, borderRadius: 8 as any, backgroundColor: '#00FF66', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any },
  addDeviceConfirmBtnText: { color: '#1A1A1A', fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  aiDetectedBox: { backgroundColor: '#E0FFF0', borderRadius: 8 as any, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  aiDetectedText: { fontSize: 13, color: '#00CC52', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  formLabel: { fontSize: 12, fontWeight: '700', color: '#4A4A4A', marginBottom: 6, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  formInput: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 8 as any, borderWidth: 1.5, borderColor: '#9A9A9A', fontSize: 14, backgroundColor: '#FFFEF5', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  typeBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8 as any, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5' },
  typeBtnActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566', boxShadow: '2px 2px 0 #1A1A1A' as any },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  typeBtnTextActive: { color: '#1A1A1A' },
  formSubmitBtn: { padding: 16, borderRadius: 12 as any, backgroundColor: '#00FF66', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any },
  formSubmitBtnDisabled: { backgroundColor: '#F5F0E0' },
  formSubmitBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  precisionCard: { backgroundColor: '#FFFACC', borderRadius: 12 as any, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any },
  precisionIconWrap: { width: 48, height: 48, borderRadius: 8 as any, backgroundColor: '#FFE566', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  precisionTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  precisionSub: { fontSize: 12, color: '#2D2D2D', lineHeight: 18, marginTop: 4, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  precisionUploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1A1A1A', borderRadius: 8 as any, paddingVertical: 10, paddingHorizontal: 14, flexShrink: 0, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFE566' as any },
  precisionUploadBtnText: { color: '#FFE566', fontSize: 12, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  bodyMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bodyMetricItem: { width: '31%', minWidth: 96, backgroundColor: '#FFFEF5', borderRadius: 8 as any, padding: 10, borderWidth: 1.5, borderColor: '#9A9A9A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  bodyMetricFieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  bodyMetricInput: { flex: 1, minWidth: 34, fontSize: 16, fontWeight: '700', color: '#1A1A1A', textAlign: 'right', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#9A9A9A', fontFamily: "'Permanent Marker', cursive" },
  bodyMetricUnit: { fontSize: 10, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  bodyMetricLabel: { flexShrink: 1, fontSize: 11, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  hiddenAdminTrigger: { alignSelf: 'center', marginTop: 16, marginBottom: 8, opacity: 0.3 },
  versionLabel: { fontSize: 10, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  photoDisplayArea: { width: '100%', height: 200, borderRadius: 12 as any, overflow: 'hidden', marginBottom: 12, backgroundColor: '#F5F0E0', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoPlaceholderText: { fontSize: 13, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  photoActionsRow: { flexDirection: 'row', gap: 10 },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8 as any, borderWidth: 1.5, borderColor: '#1A1A1A' },
  photoBtnPrimary: { backgroundColor: '#00FF66', boxShadow: '2px 2px 0 #1A1A1A' as any },
  photoBtnDanger: { backgroundColor: '#FFFACC', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  photoBtnDisabled: { opacity: 0.5 },
  photoBtnPrimaryText: { color: '#1A1A1A', fontSize: 13, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  photoBtnDangerText: { color: '#1A1A1A', fontSize: 13, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  photoLoginHint: { fontSize: 11, color: '#9A9A9A', textAlign: 'center', marginTop: 8, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  photoErrorBox: { backgroundColor: '#FFFACC', borderRadius: 8 as any, padding: 10, marginTop: 10, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any },
  photoErrorText: { fontSize: 12, color: '#1A1A1A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  photoToast: { position: 'absolute', bottom: 90, left: 20, right: 20, backgroundColor: '#00CC52', borderRadius: 12 as any, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', zIndex: 300, elevation: 5, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any },
  photoToastText: { color: '#FFFEF5', fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  confirmSheet: { backgroundColor: '#FFFEF5', backgroundImage: PAPER_TEXTURE, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, gap: 16, borderWidth: 2, borderColor: '#1A1A1A' } as any,
  confirmTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  confirmDesc: { fontSize: 14, color: '#4A4A4A', lineHeight: 20, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  confirmActionsRow: { flexDirection: 'row', gap: 10 },
  confirmCancelBtn: { flex: 1, padding: 14, borderRadius: 8 as any, borderWidth: 1.5, borderColor: '#1A1A1A', backgroundColor: '#F5F0E0', alignItems: 'center', boxShadow: '2px 2px 0 #1A1A1A' as any },
  confirmCancelBtnText: { color: '#2D2D2D', fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  confirmDeleteBtn: { flex: 1, padding: 14, borderRadius: 8 as any, backgroundColor: '#1A1A1A', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFE566' as any },
  confirmDeleteBtnText: { color: '#FFE566', fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
})
