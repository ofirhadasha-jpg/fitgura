import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useEscToDismiss } from '../utils/useEscToDismiss'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Image } from 'react-native'
import { BottomNav } from '../components'
import ContextualUpsellBanner from '../components/ContextualUpsellBanner'
import GalleryPreviewModal, { type PreviewablePhoto } from '../components/GalleryPreviewModal'
import type { Screen, User, ScannedSizes, ScanEntry, Product, FamilyMember, AgeGroup } from '../types'
import { supabase } from '../lib/supabase'
import SizingResultModal, { type WardrobeItem, type FitBreakdown, decodeHtmlEntities } from '../components/SizingResultModal'
import { normalizeProductImageUrl } from '../utils/productImages'

import { analyzeProductUrl } from '../services/analyzeProductUrl'
import { runGalleryScan, persistSizingToSupabase, type MergedSizingResult } from '../services/sizingService'
import { buildComparisonAffiliateUrl, buildGoogleLensUrl, ensureAffiliateWrapped, buildCategoryAffiliateUrls } from '../services/affiliateService'
import { isNativePlatform, getGalleryPhotos, fetchPhotoAsFile, getGalleryPermissionGranted, setGalleryPermissionGranted, requestGalleryPermissions } from '../services/nativeGalleryBridge'

import { captureClickPos, computePopupStyle, type AnchorPos } from '../utils/popupPosition'

const PAPER_TEXTURE = 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)' as any

function wrapAffiliateUrl(url: string): string {
  return ensureAffiliateWrapped(url)
}

function ProductThumbWithFallback({ imageUrl, style, placeholderStyle }: {
  imageUrl: string
  style: React.CSSProperties
  placeholderStyle: React.CSSProperties
}) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <View style={placeholderStyle}>
        <Text style={{ fontSize: 22 }}>📸</Text>
      </View>
    )
  }
  return <Image source={{ uri: imageUrl }} style={style} onError={() => setError(true)} />
}

export function SizingHubScreen({ onNav, user, scannedSizes, setScannedSizes, scanGallery, setScanGallery, wishlistItems, feedCatalog, budget, onToggleWishlist, familyMembers, activeProfileId, setActiveProfileId, focusWishlistProfileId, onWishlistFocusHandled, initialProductUrl, onInitialProductHandled, onRequestAuth }: {
  onNav: (s: Screen) => void
  user: User | null
  scannedSizes: ScannedSizes | null
  setScannedSizes?: (s: ScannedSizes | null) => void
  scanGallery?: ScanEntry[]
  setScanGallery?: (entries: ScanEntry[]) => void
  wishlistItems?: number[]
  feedCatalog?: Product[]
  budget?: [number, number]
  onToggleWishlist?: (idx: number) => void
  familyMembers?: FamilyMember[]
  activeProfileId?: string
  setActiveProfileId?: (id: string) => void
  focusWishlistProfileId?: string | null
  onWishlistFocusHandled?: () => void
  initialProductUrl?: string | null
  onInitialProductHandled?: () => void
  onRequestAuth?: (anchorPos?: AnchorPos) => void
}) {
  const [url, setUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [accuracy, setAccuracy] = useState(72)
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([])
  const [expandedWardrobe, setExpandedWardrobe] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<WardrobeItem | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [result, setResult] = useState<{
    visible: boolean
    productName: string
    productImage: string | null
    price: string | null
    platform: string
    category: string
    recommendedSize: string
    matchPercentage: number
    fitBreakdown: FitBreakdown | null
    affiliateUrl: string
    originalUrl: string
    profileAgeGroup: AgeGroup
    productAgeRange: 'adult' | 'children' | 'unknown'
    productDemographic: 'children' | 'women' | 'men' | 'unisex-adult' | 'unknown'
    fitExplanation: string
  } | null>(null)
  const [resultProfileName, setResultProfileName] = useState<string | null>(null)
  const [resultDefaultProfileId, setResultDefaultProfileId] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const [wardrobeFilter, setWardrobeFilter] = useState<string>('all')

  const currentProfileId = activeProfileId ?? 'self'
  const activeMember = currentProfileId === 'self' ? null : (familyMembers ?? []).find((m) => m.id === currentProfileId) ?? null
  const activeSizes: ScannedSizes | null = activeMember?.scannedSizes ?? scannedSizes
  const activeGender = activeSizes?.gender ?? 'unisex'
  const activeAgeGroup = activeSizes?.ageGroup ?? 'adult'

  const [galleryPhotos, setGalleryPhotos] = useState<PreviewablePhoto[]>([])
  const [galleryModalVisible, setGalleryModalVisible] = useState(false)
  const [galleryProcessing, setGalleryProcessing] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [galleryToast, setGalleryToast] = useState(false)
  const [wardrobeToast, setWardrobeToast] = useState<string | null>(null)
  const [galleryPermissionGranted, setGalleryPermissionGrantedState] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [analyzeAnchorPos, setAnalyzeAnchorPos] = useState<AnchorPos>(null)
  const [galleryAnchorPos, setGalleryAnchorPos] = useState<AnchorPos>(null)
  const [deleteAnchorPos, setDeleteAnchorPos] = useState<AnchorPos>(null)
  const [permissionCallback, setPermissionCallback] = useState<(() => void) | null>(null)

  useEffect(() => {
    void (async () => {
      const granted = await getGalleryPermissionGranted()
      setGalleryPermissionGrantedState(granted)
    })()
  }, [])

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('sizing_accuracy')
        .eq('user_id', user.id)
        .maybeSingle()
      if (typeof data?.sizing_accuracy === 'number') setAccuracy(data.sizing_accuracy)
    })()
  }, [user?.id])

  const loadWardrobe = useCallback(async () => {
    if (!user) {
      setWardrobe([])
      return
    }
    try {
      let query = supabase
        .from('fitted_wardrobe')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      // When a specific family profile is active, filter to that profile's items only
      if (currentProfileId !== 'self') {
        query = query.eq('profile_id', currentProfileId)
      }

      const { data, error } = await query
      if (error || !data) return
      setWardrobe(data.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        productUrl: row.product_url as string,
        productName: row.product_name as string ?? 'מוצר',
        productImage: row.product_image as string | null,
        price: row.price as string | null,
        platform: row.platform as string ?? 'חנות',
        recommendedSize: row.recommended_size as string ?? '-',
        matchPercentage: row.match_percentage as number ?? 0,
        fitBreakdown: row.fit_breakdown as FitBreakdown | null,
        affiliateUrl: row.affiliate_url as string ?? row.product_url as string,
        profileId: row.profile_id as string | null,
        isWishlist: row.is_wishlist as boolean ?? false,
        createdAt: row.created_at as string | null,
      })))
    } catch {
      // Non-fatal
    }
  }, [user, currentProfileId])

  useEffect(() => { void loadWardrobe() }, [loadWardrobe])

  // Reset wardrobe filter when the active profile changes
  useEffect(() => {
    setWardrobeFilter('all')
  }, [currentProfileId])

  useEscToDismiss(!!deleteTarget, () => setDeleteTarget(null))
  useEscToDismiss(showPermissionModal, () => setShowPermissionModal(false))

  useEffect(() => {
    if (!focusWishlistProfileId) return
    setActiveProfileId?.(focusWishlistProfileId)
    setWardrobeFilter('wishlist')
    onWishlistFocusHandled?.()
  }, [focusWishlistProfileId, onWishlistFocusHandled, setActiveProfileId])

  async function handleAnalyze(event?: unknown, productUrl?: string) {
    if (event) setAnalyzeAnchorPos(captureClickPos(event))
    const trimmed = (productUrl ?? url).trim()
    if (!trimmed) return
    if (!activeSizes) {
      onNav('profile')
      return
    }
    const activeAccuracy = activeMember?.accuracy ?? accuracy

    setAnalyzing(true)
    setUrl('')

    try {
      const analysisResult = await analyzeProductUrl(trimmed, activeSizes, activeAccuracy)
      const affiliateUrl = wrapAffiliateUrl(trimmed)

      const newResult = {
        visible: true,
        productName: analysisResult.productName,
        productImage: analysisResult.productImage,
        price: analysisResult.price,
        platform: analysisResult.platform,
        category: analysisResult.category,
        recommendedSize: analysisResult.recommendedSize,
        matchPercentage: analysisResult.matchPercentage,
        fitBreakdown: analysisResult.fitBreakdown,
        affiliateUrl,
        originalUrl: trimmed,
        profileAgeGroup: analysisResult.profileAgeGroup,
        productAgeRange: analysisResult.productAgeRange,
        productDemographic: analysisResult.productDemographic,
        fitExplanation: analysisResult.fitExplanation,
      }

      setResult(newResult)
    } catch (err) {
      console.error('[SizingHub] Analysis failed:', err)
      if (err instanceof Error && err.message === 'NO_PROFILE') {
        onNav('profile')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    if (!initialProductUrl) return
    setUrl(initialProductUrl)
    onInitialProductHandled?.()
    void handleAnalyze(undefined, initialProductUrl)
  }, [initialProductUrl, onInitialProductHandled])

  async function handleSaveToWardrobe(profileId: string, isWishlist?: boolean, overrideImage?: string | null, anchorPos?: AnchorPos) {
    if (!result) return
    const savedImage = overrideImage ?? result.productImage

    const { data: { session } } = await supabase.auth.getSession()
    const activeUserId = session?.user?.id ?? user?.id ?? null
    if (!activeUserId) {
      localStorage.setItem('fitgura_pending_guest_wardrobe', JSON.stringify({
        product_url: result.originalUrl,
        product_name: result.productName,
        product_image: savedImage,
        price: result.price,
        platform: result.platform,
        recommended_size: result.recommendedSize,
        match_percentage: result.matchPercentage,
        fit_breakdown: result.fitBreakdown,
        affiliate_url: result.affiliateUrl,
        profile_id: profileId === 'self' ? null : profileId,
        is_wishlist: isWishlist ?? false,
      }))
      setResult((prev) => prev ? { ...prev, visible: false } : null)
      onRequestAuth?.(anchorPos)
      return
    }
    try {
      const { error } = await supabase
        .from('fitted_wardrobe')
        .insert({
          product_url: result.originalUrl,
          product_name: result.productName,
          product_image: savedImage,
          price: result.price,
          platform: result.platform,
          recommended_size: result.recommendedSize,
          match_percentage: result.matchPercentage,
          fit_breakdown: result.fitBreakdown,
          affiliate_url: result.affiliateUrl,
          user_id: activeUserId,
          profile_id: profileId === 'self' ? null : profileId,
          is_wishlist: isWishlist ?? false,
        })
      if (error) {
        console.error('[SizingHub] Save failed:', error)
        setWardrobeToast('השמירה נכשלה. נסה שוב מאוחר יותר.')
        setTimeout(() => setWardrobeToast(null), 3000)
      } else {
        void loadWardrobe()
        const profileName = profileId === 'self' ? (user?.name ?? 'אני') : (familyMembers?.find((m) => m.id === profileId)?.name ?? 'פרופיל')
        setWardrobeToast(`הפריט נשמר בהצלחה בארון של ${profileName}! 👕✨`)
        setTimeout(() => setWardrobeToast(null), 3000)
      }
    } catch (err) {
      console.error('[SizingHub] Save error:', err)
      setWardrobeToast('השמירה נכשלה. נסה שוב מאוחר יותר.')
      setTimeout(() => setWardrobeToast(null), 3000)
    }
    setResult((prev) => prev ? { ...prev, visible: false } : null)
  }

  function handleBuy(affiliateUrl: string) {
    window.open(ensureAffiliateWrapped(affiliateUrl), '_blank', 'noopener,noreferrer')
  }

  async function handleDeleteWardrobeItem(id: string) {
    setRemovingId(id)
    setDeleteTarget(null)
    try {
      const { error } = await supabase.from('fitted_wardrobe').delete().eq('id', id)
      if (error) {
        console.error('[SizingHub] Delete failed:', error)
        setRemovingId(null)
        return
      }
      setWardrobe((prev) => prev.filter((w) => w.id !== id))
      setExpandedWardrobe((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      console.error('[SizingHub] Delete error:', err)
    } finally {
      setRemovingId(null)
    }
  }

  function toggleWardrobeExpand(id: string) {
    setExpandedWardrobe((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getWardrobeBaseSize(item: WardrobeItem): string {
    if (item.profileId && familyMembers) {
      const m = familyMembers.find((f) => f.id === item.profileId)
      if (m?.scannedSizes?.sizing.top) return m.scannedSizes.sizing.top
    }
    return scannedSizes?.sizing.top ?? '-'
  }

  function getWardrobeProfileTag(item: WardrobeItem): string {
    if (item.profileId && familyMembers) {
      const m = familyMembers.find((f) => f.id === item.profileId)
      if (m) return `\u05de\u05d9\u05d5\u05e2\u05d3 \u05e2\u05d1\u05d5\u05e8: ${m.name}`
    }
    return `\u05de\u05d9\u05d5\u05e2\u05d3 \u05e2\u05d1\u05d5\u05e8: ${user?.name ?? '\u05d0\u05e0\u05d9'}`
  }

  function getWardrobeBuyerInsights(item: WardrobeItem): string {
    if (!item.fitBreakdown) return '\u05e0\u05d9\u05ea\u05d5\u05d7 \u05d1\u05d9\u05e7\u05d5\u05e8\u05d5\u05ea \u05e7\u05d5\u05e0\u05d9\u05dd: \u05d0\u05d9\u05df \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05d6\u05de\u05d9\u05e0\u05d9\u05dd'
    const scores = [item.fitBreakdown.chest.score, item.fitBreakdown.waist.score, item.fitBreakdown.length.score]
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    if (avg >= 85) return '\u05e0\u05d9\u05ea\u05d5\u05d7 \u05d1\u05d9\u05e7\u05d5\u05e8\u05d5\u05ea \u05e7\u05d5\u05e0\u05d9\u05dd: \u05d4\u05de\u05d9\u05d3\u05d5\u05ea \u05de\u05d3\u05d5\u05d9\u05e7\u05d5\u05ea, \u05de\u05d5\u05de\u05dc\u05e5 \u05dc\u05d4\u05d6\u05de\u05d9\u05df \u05d1\u05de\u05d9\u05d3\u05d4 \u05d4\u05e8\u05d2\u05d9\u05dc\u05d4'
    if (item.fitBreakdown.chest.score < 85) return `\u05e0\u05d9\u05ea\u05d5\u05d7 \u05d1\u05d9\u05e7\u05d5\u05e8\u05d5\u05ea \u05e7\u05d5\u05e0\u05d9\u05dd: ${Math.round(100 - item.fitBreakdown.chest.score)}% \u05de\u05d3\u05d5\u05d5\u05d7\u05d9\u05dd \u05e9\u05d4\u05d2\u05d6\u05e8\u05d4 \u05e6\u05e8\u05d4, \u05de\u05d5\u05de\u05dc\u05e5 \u05dc\u05e7\u05d7\u05ea \u05de\u05d9\u05d3\u05d4 \u05de\u05e2\u05dc`
    return '\u05e0\u05d9\u05ea\u05d5\u05d7 \u05d1\u05d9\u05e7\u05d5\u05e8\u05d5\u05ea \u05e7\u05d5\u05e0\u05d9\u05dd: \u05d7\u05dc\u05e7 \u05de\u05d4\u05e7\u05d5\u05e0\u05d9\u05dd \u05de\u05de\u05dc\u05d9\u05e6\u05d9\u05dd \u05dc\u05e7\u05d7\u05ea \u05de\u05d9\u05d3\u05d4 \u05de\u05e2\u05dc'
  }

  async function handleResultProfileChange(profileId: string) {
    if (!result) return
    const trimmed = result.originalUrl
    if (profileId === 'self') {
      setResultProfileName(null)
      setResultDefaultProfileId('self')
      if (!scannedSizes) return
      setRecalculating(true)
      try {
        const reanalysis = await analyzeProductUrl(trimmed, scannedSizes, accuracy)
        setResult((prev) => prev ? {
          ...prev,
          recommendedSize: reanalysis.recommendedSize,
          matchPercentage: reanalysis.matchPercentage,
          fitBreakdown: reanalysis.fitBreakdown,
          profileAgeGroup: reanalysis.profileAgeGroup,
          productAgeRange: reanalysis.productAgeRange,
          productDemographic: reanalysis.productDemographic,
          fitExplanation: reanalysis.fitExplanation,
        } : null)
      } catch (err) {
        console.error('[SizingHub] Recalculation for self failed:', err)
      } finally {
        setRecalculating(false)
      }
      return
    }

    const targetMember = (familyMembers ?? []).find((m) => m.id === profileId)
    if (!targetMember?.scannedSizes) return

    setResultProfileName(targetMember.name)
    setResultDefaultProfileId(profileId)
    setRecalculating(true)
    try {
      const reanalysis = await analyzeProductUrl(trimmed, targetMember.scannedSizes, targetMember.accuracy ?? accuracy)
      setResult((prev) => prev ? {
        ...prev,
        recommendedSize: reanalysis.recommendedSize,
        matchPercentage: reanalysis.matchPercentage,
        fitBreakdown: reanalysis.fitBreakdown,
        profileAgeGroup: reanalysis.profileAgeGroup,
        productAgeRange: reanalysis.productAgeRange,
        productDemographic: reanalysis.productDemographic,
      } : null)
    } catch (err) {
      console.error('[SizingHub] Recalculation for profile failed:', err)
    } finally {
      setRecalculating(false)
    }
  }

  async function handleUpsellTrigger(event?: unknown) {
    if (event) setGalleryAnchorPos(captureClickPos(event))
    if (scanGallery && scanGallery.length > 0) {
      const existingPhotos: PreviewablePhoto[] = scanGallery.slice(0, 6).map((entry) => ({
        id: `existing_${entry.id}`,
        url: entry.photoUrl,
      }))
      setGalleryPhotos(existingPhotos)
      setGalleryModalVisible(true)
      return
    }
    await initiateGallerySync()
  }

  async function initiateGallerySync() {
    if (galleryPermissionGranted) {
      await silentGalleryScan()
      return
    }
    setShowPermissionModal(true)
    setPermissionCallback(() => () => { void performGalleryAccess() })
  }

  async function performGalleryAccess() {
    if (isNativePlatform()) {
      const granted = await requestGalleryPermissions()
      if (granted) {
        setGalleryPermissionGrantedState(true)
        await setGalleryPermissionGranted(true)
        await silentGalleryScan()
      }
      return
    }
    setGalleryPermissionGrantedState(true)
    await setGalleryPermissionGranted(true)
    setGalleryToast(true)
    setTimeout(() => setGalleryToast(false), 2500)
    galleryInputRef.current?.click()
  }

  async function silentGalleryScan() {
    if (isNativePlatform()) {
      const nativePhotos = await getGalleryPhotos(6)
      if (nativePhotos.length === 0) {
        setGalleryToast(true)
        setTimeout(() => setGalleryToast(false), 2500)
        galleryInputRef.current?.click()
        return
      }
      const photosWithFiles = await Promise.all(
        nativePhotos.map(async (np) => {
          const file = await fetchPhotoAsFile(np.url)
          return {
            id: np.id,
            url: file ? URL.createObjectURL(file) : np.url,
            file: file ?? undefined,
          } as PreviewablePhoto
        })
      )
      const valid = photosWithFiles.filter((p) => p.file)
      if (valid.length > 0) {
        setGalleryPhotos(valid)
        setGalleryModalVisible(true)
      }
      return
    }
    if (scanGallery && scanGallery.length > 0) {
      const existingPhotos: PreviewablePhoto[] = scanGallery.slice(0, 6).map((entry) => ({
        id: `existing_${entry.id}`,
        url: entry.photoUrl,
      }))
      setGalleryPhotos(existingPhotos)
      setGalleryModalVisible(true)
      return
    }
    setGalleryToast(true)
    setTimeout(() => setGalleryToast(false), 2500)
    galleryInputRef.current?.click()
  }

  async function handleNativeGallerySync() {
    await silentGalleryScan()
  }

  async function handleGallerySync(event?: unknown) {
    if (event) setGalleryAnchorPos(captureClickPos(event))
    if (scanGallery && scanGallery.length > 0 && !galleryPermissionGranted) {
      const existingPhotos: PreviewablePhoto[] = scanGallery.slice(0, 6).map((entry) => ({
        id: `existing_${entry.id}`,
        url: entry.photoUrl,
      }))
      setGalleryPhotos(existingPhotos)
      setGalleryModalVisible(true)
      return
    }
    await initiateGallerySync()
  }

  function handleGalleryFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    const photos: PreviewablePhoto[] = files.slice(0, 6).map((file, i) => ({
      id: `gallery_${i}_${Date.now()}`,
      url: URL.createObjectURL(file),
      file,
    }))

    setGalleryPhotos(photos)
    setGalleryModalVisible(true)
    e.target.value = ''
  }

  async function handleGalleryApprove(approved: PreviewablePhoto[]) {
    const newFiles = approved.filter((p) => p.file).map((p) => p.file!)

    if (newFiles.length === 0) {
      setGalleryModalVisible(false)
      return
    }

    setGalleryProcessing(true)

    try {
      const existingEntries = scanGallery ?? []

      const baselinePhotoUrl = scannedSizes?.preview ?? scanGallery?.find((e) => e.isBaseline)?.photoUrl ?? null

      const scanResult: MergedSizingResult = await runGalleryScan({
        files: newFiles,
        baselinePhotoUrl,
        currentSizes: scannedSizes,
        existingGallery: existingEntries,
        userId: user?.id ?? null,
        onProgress: () => {},
      })

      if (setScannedSizes) setScannedSizes(scanResult.mergedSizes)
      if (setScanGallery) setScanGallery(scanResult.newEntries)

      if (user?.id) {
        await persistSizingToSupabase(user.id, scanResult.newEntries, scanResult.accuracy, scanResult.mergedSizes)
      }

      setAccuracy(scanResult.accuracy)
      setGalleryModalVisible(false)
    } catch (err) {
      console.error('[SizingHub] Gallery scan failed:', err)
    } finally {
      setGalleryProcessing(false)
    }
  }

  function handleGalleryCancel() {
    galleryPhotos.forEach((p) => {
      if (p.file) URL.revokeObjectURL(p.url)
    })
    setGalleryPhotos([])
    setGalleryModalVisible(false)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFEF5', backgroundImage: PAPER_TEXTURE }}>
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }}
        onChange={handleGalleryFileSelect}
      />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.profileSection}>
            <TouchableOpacity onPress={() => onNav('profile')} activeOpacity={0.7} style={styles.avatarBtn}>
              <Text style={styles.avatarText}>{user ? user.name[0] : '👤'}</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.userName}>{user ? user.name : 'אורח'}</Text>
              <Text style={styles.accuracyText}>{accuracy}% דיוק פרופיל</Text>
            </View>
          </View>
          <View style={styles.accuracyGauge}>
            <Text style={styles.accuracyGaugeText}>{accuracy}%</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 100 }}>
        <Text style={styles.hubTitle}>פיטגורה</Text>
        <Text style={styles.hubSub}>נתח מידה לכל מוצר מכל חנות</Text>

        {/* Profile selector card */}
        <View style={styles.profileSelectorCard}>
          <Text style={styles.profileSelectorTitle}>למי תרצה לקנות היום? 🕵️‍♂️✨</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2, paddingVertical: 4 }}>
            <TouchableOpacity
              onPress={() => setActiveProfileId?.('self')}
              activeOpacity={0.7}
              style={[styles.profilePill, currentProfileId === 'self' && styles.profilePillActive]}
            >
              <Text style={styles.profilePillEmoji}>🧑</Text>
              <Text style={[styles.profilePillName, currentProfileId === 'self' && styles.profilePillNameActive]}>{user?.name ?? 'אני'}</Text>
            </TouchableOpacity>
            {(familyMembers ?? []).map((m) => {
              const emoji = m.category === 'baby' ? '👶' : m.category === 'child' ? '🧒' : m.category === 'partner' ? '💍' : '👤'
              const isActive = currentProfileId === m.id
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setActiveProfileId?.(m.id)}
                  activeOpacity={0.7}
                  style={[styles.profilePill, isActive && styles.profilePillActive]}
                >
                  <Text style={styles.profilePillEmoji}>{emoji}</Text>
                  <Text style={[styles.profilePillName, isActive && styles.profilePillNameActive]}>{m.name}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>מצאת משהו שווה ברשת? שים פה לינק ונפצח לך את המידה 🕵️‍♂️✨</Text>
          <View style={styles.platformRow}>
            {buildCategoryAffiliateUrls(activeGender, activeAgeGroup).map((chip) => (
              <TouchableOpacity
                key={chip.label}
                onPress={() => window.open(chip.url, '_blank', 'noopener,noreferrer')}
                activeOpacity={0.7}
                style={styles.platformChip}
              >
                <Text style={styles.platformChipText}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="הדבק קישור משיין, עליאקספרס, Temu, זארה..."
            style={styles.urlInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={handleAnalyze}
            disabled={analyzing || !url.trim()}
            activeOpacity={0.8}
            style={[styles.analyzeBtn, (analyzing || !url.trim()) && styles.btnDisabled]}
          >
            <Text style={styles.analyzeBtnText}>{analyzing ? 'מנתח...' : 'פוצץ לי מידה ✨'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>איך להשתמש בפיטגורה בקליק 🎯</Text>
          <View style={styles.guideSteps}>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepNum}>1</Text>
              <Text style={styles.guideStepText}>
                <Text style={styles.guideStepBold}>בחר פרופיל למעלה</Text> 👤{'\n'}למשל: אופיר, אלה, איתמר — הקישורים לחנויות מעל תיבת ההדבקה יתאימו את עצמם אוטומטית למשתמש הנבחר!
              </Text>
            </View>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepNum}>2</Text>
              <Text style={styles.guideStepText}>
                <Text style={styles.guideStepBold}>היכנס לחנות</Text> (SHEIN, עלי-אקספרס, אמזון וכו') מתוך הקישורים המותאמים ומצא את הפריט שתרצה.
              </Text>
            </View>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepNum}>3</Text>
              <Text style={styles.guideStepText}>
                <Text style={styles.guideStepBold}>העתק את הקישור של המוצר</Text> וחזור לכאן.
              </Text>
            </View>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepNum}>4</Text>
              <Text style={styles.guideStepText}>
                <Text style={styles.guideStepBold}>הדבק את הקישור למעלה ולחץ "פוצץ לי מידה ✨"</Text> — נפענח עבורך את המידה המדויקת להזמנה, ותוכל לשמור בארון או להמשיך לקנייה!
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.wardrobeSection}>
          <Text style={styles.wardrobeTitle}>הארון שלי</Text>

          {/* Profile filter pills */}
          {wardrobe.length > 0 && (familyMembers?.length ?? 0) > 0 && (
            <View style={styles.wardrobeFilterRow}>
              <TouchableOpacity
                onPress={() => setWardrobeFilter('all')}
                activeOpacity={0.7}
                style={[styles.wardrobeFilterPill, wardrobeFilter === 'all' && styles.wardrobeFilterPillActive]}
              >
                <Text style={[styles.wardrobeFilterPillText, wardrobeFilter === 'all' && styles.wardrobeFilterPillTextActive]}>הכל 🛍️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setWardrobeFilter('self')}
                activeOpacity={0.7}
                style={[styles.wardrobeFilterPill, wardrobeFilter === 'self' && styles.wardrobeFilterPillActive]}
              >
                <Text style={[styles.wardrobeFilterPillText, wardrobeFilter === 'self' && styles.wardrobeFilterPillTextActive]}>{user?.name ?? 'אני'} 👤</Text>
              </TouchableOpacity>
              {familyMembers.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setWardrobeFilter(m.id)}
                  activeOpacity={0.7}
                  style={[styles.wardrobeFilterPill, wardrobeFilter === m.id && styles.wardrobeFilterPillActive]}
                >
                  <Text style={[styles.wardrobeFilterPillText, wardrobeFilter === m.id && styles.wardrobeFilterPillTextActive]}>{m.name} {m.category === 'partner' ? '💍' : m.category === 'child' ? '🧒' : m.category === 'baby' ? '👶' : '👤'}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setWardrobeFilter('wishlist')}
                activeOpacity={0.7}
                style={[styles.wardrobeFilterPill, wardrobeFilter === 'wishlist' && styles.wardrobeFilterPillActive]}
              >
                <Text style={[styles.wardrobeFilterPillText, wardrobeFilter === 'wishlist' && styles.wardrobeFilterPillTextActive]}>רשימת משאלות 🎁</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Saved products from feed */}
          {wishlistItems && feedCatalog && wishlistItems.length > 0 && (
            <View style={{ gap: 10, marginBottom: 12 }}>
              <Text style={styles.savedSectionLabel}>❤️ מוצרים שמורים ({wishlistItems.length})</Text>
              {wishlistItems.map((idx) => {
                const p = feedCatalog[idx]
                if (!p) return null
                const inBudget = !budget || (p.price >= budget[0] && p.price <= budget[1])
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => onToggleWishlist?.(idx)}
                    activeOpacity={0.7}
                    style={[styles.wardrobeItem, { opacity: inBudget ? 1 : 0.6 }]}
                  >
                    <View style={styles.wardrobeThumbWrap}>
                      <Image
                        source={{ uri: `https://images.unsplash.com/${p.img}?w=80&h=80&fit=crop&auto=format` }}
                        style={styles.wardrobeThumb}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.wardrobeItemName} numberOfLines={2}>{p.name}</Text>
                      <View style={styles.wardrobeMetaRow}>
                        <View style={styles.wardrobeStoreBadge}>
                          <Text style={styles.wardrobeStoreText}>{p.brand}</Text>
                        </View>
                        <Text style={[styles.wardrobePriceText, { color: inBudget ? '#1A1A1A' : '#9A9A9A' }]}>₪{p.price}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 20 }}>❤️</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          {/* Analyzed wardrobe items */}
          {(() => {
            const filteredWardrobe = wardrobeFilter === 'all'
              ? wardrobe
              : wardrobeFilter === 'self'
                ? wardrobe.filter((w) => !w.profileId)
                : wardrobeFilter === 'wishlist'
                  ? wardrobe.filter((w) => w.isWishlist && (currentProfileId === 'self' ? !w.profileId : w.profileId === currentProfileId))
                  : wardrobe.filter((w) => w.profileId === wardrobeFilter)
            return filteredWardrobe.length === 0 ? (
            <View style={styles.wardrobeEmpty}>
              <Text style={{ fontSize: 32 }}>👔</Text>
              <Text style={styles.wardrobeEmptyText}>עדיין לא ניתחת מוצרים</Text>
              <Text style={styles.wardrobeEmptySub}>הדבק קישור למעלה כדי להתחיל</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {filteredWardrobe.map((item) => {
                const decodedName = decodeHtmlEntities(item.productName)
                const expanded = expandedWardrobe.has(item.id)
                const baseSize = getWardrobeBaseSize(item)
                const profileTag = getWardrobeProfileTag(item)
                const buyerInsights = getWardrobeBuyerInsights(item)
                return (
                  <View key={item.id} style={styles.wardrobeCard}>
                    <View style={styles.wardrobeItemRow}>
                      <View style={styles.wardrobeThumbWrap}>
                        {(() => {
                          const normalized = normalizeProductImageUrl(item.productImage)
                          if (normalized) {
                            return (
                              <ProductThumbWithFallback
                                imageUrl={normalized}
                                style={styles.wardrobeThumb}
                                placeholderStyle={styles.wardrobeThumbPlaceholder}
                              />
                            )
                          }
                          return (
                            <View style={styles.wardrobeThumbPlaceholder}>
                              <Text style={styles.wardrobeThumbPlaceholderText}>👕</Text>
                            </View>
                          )
                        })()}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.wardrobeItemName} numberOfLines={2}>{decodedName}</Text>
                        <View style={styles.wardrobeMetaRow}>
                          <View style={styles.wardrobeStoreBadge}>
                            <Text style={styles.wardrobeStoreText}>{item.platform}</Text>
                          </View>
                          {item.price && (
                            <Text style={styles.wardrobePriceText}>{item.price}</Text>
                          )}
                        </View>
                        {(() => {
                          const daysSaved = item.createdAt ? Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86400000) : 0
                          const needsRecheck = daysSaved > 90
                          const recommendBuy = daysSaved > 7 && daysSaved <= 90
                          return (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {daysSaved > 0 && (
                                <View style={styles.savedDaysBadge}>
                                  <Text style={styles.savedDaysBadgeText}>נשמר לפני {daysSaved} ימים</Text>
                                </View>
                              )}
                              {recommendBuy && (
                                <View style={styles.recommendBuyBadge}>
                                  <Text style={styles.recommendBuyBadgeText}>מומלץ לרכישה עכשיו 🛍️</Text>
                                </View>
                              )}
                              {needsRecheck && (
                                <View style={styles.recheckBadge}>
                                  <Text style={styles.recheckBadgeText}>בדיקת מידה מחדש מומלצת ⚠️</Text>
                                </View>
                              )}
                            </View>
                          )
                        })()}
                      </View>
                      <View style={styles.wardrobeSizeBadge}>
                        <Text style={styles.wardrobeSizeText}>{item.recommendedSize}</Text>
                        <Text style={styles.wardrobeMatchText}>{item.matchPercentage}%</Text>
                      </View>
                      <TouchableOpacity
                        onPress={(event) => { setDeleteAnchorPos(captureClickPos(event)); setDeleteTarget(item) }}
                        activeOpacity={0.6}
                        style={styles.wardrobeDeleteBtn}
                      >
                        <Text style={styles.wardrobeDeleteBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleWardrobeExpand(item.id)}
                      activeOpacity={0.7}
                      style={styles.wardrobeExpandBtn}
                    >
                      <Text style={styles.wardrobeExpandBtnText}>
                        {expanded ? 'הסתר פרטי התאמה 🔼' : 'הצג פרטי התאמה 🔽'}
                      </Text>
                    </TouchableOpacity>
                    {expanded && (
                      <View style={styles.wardrobeExpanded}>
                        <View style={styles.wardrobeDetailRow}>
                          <Text style={styles.wardrobeDetailLabel}>המידה הרגילה שלך:</Text>
                          <Text style={styles.wardrobeDetailValue}>{baseSize}</Text>
                        </View>
                        <View style={styles.wardrobeDetailRow}>
                          <Text style={styles.wardrobeDetailLabel}>המידה לבחירה ב-{item.platform}:</Text>
                          <Text style={styles.wardrobeDetailValue}>{item.recommendedSize}</Text>
                        </View>
                        {item.fitBreakdown && (
                          <View style={styles.wardrobeBreakdownSection}>
                            <Text style={styles.wardrobeBreakdownTitle}>טבלת מידות והתאמה</Text>
                            {[
                              { label: 'חזה', data: item.fitBreakdown.chest },
                              { label: 'מותן', data: item.fitBreakdown.waist },
                              { label: 'אורך', data: item.fitBreakdown.length },
                            ].map(({ label, data }) => (
                              <View key={label} style={styles.wardrobeBreakdownRow}>
                                <Text style={styles.wardrobeBreakdownLabel}>{label}</Text>
                                <Text style={styles.wardrobeBreakdownFit}>{data.fit}</Text>
                                <View style={styles.wardrobeBreakdownScoreBar}>
                                  <View style={[styles.wardrobeBreakdownScoreFill, { width: `${data.score}%`, backgroundColor: data.score >= 85 ? '#00CC52' : '#FFE566' }]} />
                                </View>
                                <Text style={styles.wardrobeBreakdownScoreText}>{data.score}%</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        <View style={styles.wardrobeInsightsBox}>
                          <Text style={styles.wardrobeInsightsText}>{buyerInsights}</Text>
                        </View>
                        <View style={styles.wardrobeProfileTag}>
                          <Text style={styles.wardrobeProfileTagText}>{profileTag}{item.isWishlist ? ' 🎁' : ''}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => window.open(ensureAffiliateWrapped(item.affiliateUrl || item.productUrl), '_blank', 'noopener,noreferrer')}
                          activeOpacity={0.8}
                          style={styles.wardrobeCheckBtn}
                        >
                          <Text style={styles.wardrobeCheckBtnText}>בדוק זמינות ומחיר מעודכן 🛒</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => window.open(ensureAffiliateWrapped(item.affiliateUrl), '_blank', 'noopener,noreferrer')}
                          activeOpacity={0.8}
                          style={styles.wardrobeBuyBtn}
                        >
                          <Text style={styles.wardrobeBuyBtnText}>קנה עכשיו במידה {item.recommendedSize} 🛒</Text>
                        </TouchableOpacity>
                        <View style={styles.wardrobeComparisonRow}>
                          <TouchableOpacity
                            onPress={() => {
                              const url = buildComparisonAffiliateUrl(decodeHtmlEntities(item.productName))
                              if (url) window.open(url, '_blank', 'noopener,noreferrer')
                            }}
                            activeOpacity={0.8}
                            style={styles.wardrobeCompareAffBtn}
                          >
                            <Text style={styles.wardrobeCompareAffBtnText}>מצא באליאקספרס / SHEIN 🛒</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              if (item.productImage) {
                                const lensUrl = buildGoogleLensUrl(item.productImage)
                                if (lensUrl) window.open(lensUrl, '_blank', 'noopener,noreferrer')
                              }
                            }}
                            activeOpacity={0.8}
                            style={styles.wardrobeCompareLensBtn}
                          >
                            <Text style={styles.wardrobeCompareLensBtnText}>חפש תמונה בגוגל לנס 🔍</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )
          })()}
        </View>

        {deleteTarget && (
          <View style={styles.deleteOverlay}>
            <TouchableOpacity onPress={() => setDeleteTarget(null)} activeOpacity={1} style={styles.deleteBackdrop} />
            <View style={[styles.deleteDialog, deleteAnchorPos ? { position: 'fixed', ...computePopupStyle(deleteAnchorPos, 320, 240), width: 320, maxWidth: 'calc(100vw - 32px)' } as React.CSSProperties : null]}>
              <Text style={styles.deleteDialogIcon}>🗑️</Text>
              <Text style={styles.deleteDialogTitle}>להסיר את המוצר מהארון? 🗑️</Text>
              <Text style={styles.deleteDialogSub} numberOfLines={2}>{decodeHtmlEntities(deleteTarget.productName)}</Text>
              <View style={styles.deleteDialogBtns}>
                <TouchableOpacity
                  onPress={() => { setDeleteTarget(null); setDeleteAnchorPos(null) }}                  activeOpacity={0.7}
                  style={styles.deleteCancelBtn}
                >
                  <Text style={styles.deleteCancelBtnText}>ביטול</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleDeleteWardrobeItem(deleteTarget.id)}
                  activeOpacity={0.7}
                  style={styles.deleteConfirmBtn}
                >
                  <Text style={styles.deleteConfirmBtnText}>הסר 🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}


      </ScrollView>

      {wardrobeToast && (
        <View style={{ position: 'fixed', bottom: 80, left: 0, right: 0, alignItems: 'center', zIndex: 10000, pointerEvents: 'none' } as React.CSSProperties}>
          <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 2, borderColor: '#00CC52', boxShadow: '3px 3px 0 #00CC52' } as React.CSSProperties}>
            <Text style={{ color: '#00CC52', fontSize: 15, fontWeight: '800', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' }}>{wardrobeToast}</Text>
          </View>
        </View>
      )}

      <BottomNav current="hub" onNav={onNav} isAdmin={user?.is_admin === true} />

      {result && (
        <SizingResultModal
          visible={result.visible}
          productName={result.productName}
          productImage={result.productImage}
          price={result.price}
          platform={result.platform}
          category={result.category ?? 'clothing'}
          recommendedSize={result.recommendedSize}
          matchPercentage={result.matchPercentage}
          fitBreakdown={result.fitBreakdown}
          affiliateUrl={result.affiliateUrl}
          onClose={() => { setResult(null); setResultProfileName(null); setResultDefaultProfileId(null); setAnalyzeAnchorPos(null) }}
          anchorPos={analyzeAnchorPos}
          onBuy={handleBuy}
          onSave={handleSaveToWardrobe}
          familyMembers={familyMembers ?? []}
          userName={user?.name}
          profileName={resultProfileName}
          defaultProfileId={resultDefaultProfileId}
          onProfileChange={handleResultProfileChange}
          recalculating={recalculating}
          profileAgeGroup={result.profileAgeGroup}
          productAgeRange={result.productAgeRange}
          productDemographic={result.productDemographic}
          fitExplanation={result.fitExplanation}
        />
      )}

      <GalleryPreviewModal
        visible={galleryModalVisible}
        photos={galleryPhotos}
        onApprove={handleGalleryApprove}
        onCancel={handleGalleryCancel}
        processing={galleryProcessing}
        anchorPos={galleryAnchorPos}
      />

      {showPermissionModal && (
        <View style={styles.permissionOverlay}>
          <TouchableOpacity onPress={() => setShowPermissionModal(false)} activeOpacity={1} style={styles.permissionBackdrop} />
          <View style={[styles.permissionDialog, galleryAnchorPos ? { position: 'fixed', ...computePopupStyle(galleryAnchorPos, 360, 300), width: 360, maxWidth: 'calc(100vw - 32px)' } as React.CSSProperties : null]}>
            <Text style={styles.permissionIcon}>📸</Text>
            <Text style={styles.permissionTitle}>גישה לגלריה</Text>
            <Text style={styles.permissionDesc}>
              כדי להתאים מידות באופן אוטומטי, פיטגורה צריכה גישה לתמונות במכשיר. התמונות נשארות בטלפון בלבד! 🔒
            </Text>
            <View style={styles.permissionBtns}>
              <TouchableOpacity
                onPress={() => setShowPermissionModal(false)}
                activeOpacity={0.7}
                style={styles.permissionCancelBtn}
              >
                <Text style={styles.permissionCancelBtnText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowPermissionModal(false)
                  permissionCallback?.()
                }}
                activeOpacity={0.7}
                style={styles.permissionGrantBtn}
              >
                <Text style={styles.permissionGrantBtnText}>אפשר גישה 🔒</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#FFE566', borderBottomWidth: 2, borderBottomColor: '#1A1A1A', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 16, boxShadow: '0 3px 0 #1A1A1A' as any } as any,
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileSection: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FFFEF5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any } as any,
  avatarText: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  userName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  accuracyText: { fontSize: 12, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accuracyGauge: { backgroundColor: '#1A1A1A', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFFEF5' as any } as any,
  accuracyGaugeText: { fontSize: 16, fontWeight: '800', color: '#FFE566', fontFamily: "'Permanent Marker', cursive" },
  profileSelectorCard: { backgroundColor: '#FFFACC', borderRadius: 16, padding: 18, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, gap: 12 } as any,
  profileSelectorTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', fontFamily: "'Permanent Marker', cursive" },
  profilePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5' } as any,
  profilePillActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566', boxShadow: '2px 2px 0 #1A1A1A' as any },
  profilePillEmoji: { fontSize: 22 },
  profilePillName: { fontSize: 14, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Permanent Marker', cursive" },
  profilePillNameActive: { color: '#1A1A1A' },
  hubTitle: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', fontFamily: "'Permanent Marker', cursive" },
  hubSub: { fontSize: 15, color: '#4A4A4A', textAlign: 'center', marginBottom: 4, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  urlCard: { backgroundColor: '#FFFEF5', borderRadius: 16, padding: 18, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, gap: 12 } as any,
  urlLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  platformRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  platformChip: { backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: '#FFE566' },
  platformChipText: { fontSize: 11, fontWeight: '600', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  urlInput: { backgroundColor: '#FFFACC', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#1A1A1A', fontSize: 14, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  analyzeBtn: { backgroundColor: '#00CC52', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any } as any,
  analyzeBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '800', fontFamily: "'Permanent Marker', cursive" },
  btnDisabled: { opacity: 0.5 },
  guideCard: { backgroundColor: '#FFFACC', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#FFE566', boxShadow: '2px 2px 0 #1A1A1A' as any } as any,
  guideTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 12, fontFamily: "'Permanent Marker', cursive" },
  guideSteps: { gap: 10 },
  guideStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  guideStepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1A1A1A', color: '#FFE566', textAlign: 'center', textAlignVertical: 'center', fontSize: 13, fontWeight: '800', lineHeight: 26, marginTop: 2 },
  guideStepText: { fontSize: 14, color: '#1A1A1A', flex: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", lineHeight: 22 },
  guideStepBold: { fontWeight: '800', color: '#1A1A1A' },
  wardrobeSection: { gap: 10 },
  wardrobeFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wardrobeFilterPill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5' } as any,
  wardrobeFilterPillActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566' },
  wardrobeFilterPillText: { fontSize: 13, color: '#4A4A4A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeFilterPillTextActive: { color: '#1A1A1A', fontWeight: '700' },
  savedSectionLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  wardrobeTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  wardrobeEmpty: { alignItems: 'center', gap: 8, paddingVertical: 32, backgroundColor: '#FFFEF5', borderRadius: 14, borderWidth: 1.5, borderColor: '#9A9A9A' },
  wardrobeEmptyText: { fontSize: 15, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Permanent Marker', cursive" },
  wardrobeEmptySub: { fontSize: 13, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFEF5', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any } as any,
  wardrobeThumbWrap: { width: 56, height: 56, borderRadius: 10, borderWidth: 1.5, borderColor: '#1A1A1A', overflow: 'hidden' as any, flexShrink: 0 },
  wardrobeThumb: { width: '100%', height: '100%', resizeMode: 'cover' as any },
  wardrobeThumbPlaceholder: { width: '100%', height: '100%', backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center' },
  wardrobeThumbPlaceholderText: { fontSize: 24 },
  wardrobeItemName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", lineHeight: 18, marginBottom: 4 },
  wardrobeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wardrobeStoreBadge: { backgroundColor: '#FFFACC', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: '#FFE566' },
  wardrobeStoreText: { fontSize: 10, fontWeight: '600', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobePriceText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  wardrobeSizeBadge: { backgroundColor: '#E0FFF0', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#00CC52', alignItems: 'center' },
  wardrobeSizeText: { fontSize: 16, fontWeight: '800', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  wardrobeMatchText: { fontSize: 11, color: '#00CC52', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeCard: { backgroundColor: '#FFFEF5', borderRadius: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any, overflow: 'hidden' as any } as any,
  wardrobeItemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  wardrobeExpandBtn: { paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E5E0CC', backgroundColor: '#FFFACC' },
  wardrobeExpandBtnText: { fontSize: 12, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeExpanded: { padding: 12, gap: 8, backgroundColor: '#FFFEF5' },
  wardrobeDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  wardrobeDetailLabel: { fontSize: 13, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeDetailValue: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  wardrobeBreakdownSection: { gap: 6, marginTop: 4 },
  wardrobeBreakdownTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  wardrobeBreakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wardrobeBreakdownLabel: { fontSize: 12, color: '#4A4A4A', width: 50, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeBreakdownFit: { fontSize: 11, color: '#1A1A1A', width: 55, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeBreakdownScoreBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#F5F0E0', overflow: 'hidden' as any },
  wardrobeBreakdownScoreFill: { height: '100%', borderRadius: 3 },
  wardrobeBreakdownScoreText: { fontSize: 11, fontWeight: '700', color: '#4A4A4A', width: 34, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeInsightsBox: { backgroundColor: '#FFFACC', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#FFE566' },
  wardrobeInsightsText: { fontSize: 12, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", lineHeight: 18 },
  wardrobeProfileTag: { alignSelf: 'flex-start', backgroundColor: '#E0F2FE', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: '#0891B2' },
  wardrobeProfileTagText: { fontSize: 12, color: '#0891B2', fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeBuyBtn: { backgroundColor: '#00CC52', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any, marginTop: 4 } as any,
  wardrobeBuyBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', fontFamily: "'Permanent Marker', cursive" },
  wardrobeCheckBtn: { backgroundColor: '#FFE566', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any, marginTop: 6 } as any,
  wardrobeCheckBtnText: { color: '#1A1A1A', fontSize: 13, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  savedDaysBadge: { backgroundColor: '#F5F0E0', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: '#9A9A9A' },
  savedDaysBadgeText: { fontSize: 10, color: '#6B6B6B', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  recommendBuyBadge: { backgroundColor: '#E0FFF0', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: '#00CC52' },
  recommendBuyBadgeText: { fontSize: 10, color: '#00CC52', fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  recheckBadge: { backgroundColor: '#FFF0F0', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: '#DC2626' },
  recheckBadgeText: { fontSize: 10, color: '#DC2626', fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeComparisonRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  wardrobeCompareAffBtn: { flex: 1, backgroundColor: '#0891B2', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' } as any,
  wardrobeCompareAffBtnText: { color: '#FFFEF5', fontSize: 11, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  wardrobeCompareLensBtn: { flex: 1, backgroundColor: '#FFFEF5', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#4A4A4A' } as any,
  wardrobeCompareLensBtnText: { color: '#4A4A4A', fontSize: 11, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  wardrobeDeleteBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 4 },
  wardrobeDeleteBtnText: { fontSize: 16 },
  deleteOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'center', alignItems: 'center', padding: 16, backdropFilter: 'blur(2px)' } as any,
  deleteBackdrop: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  deleteDialog: { backgroundColor: '#FFFEF5', borderRadius: 18, padding: 24, width: '100%', maxWidth: 380, maxHeight: '90vh', alignItems: 'center', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, gap: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' } as any,
  deleteDialogIcon: { fontSize: 36 },
  deleteDialogTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', fontFamily: "'Permanent Marker', cursive" },
  deleteDialogSub: { fontSize: 13, color: '#6B6B6B', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deleteDialogBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  deleteCancelBtn: { flex: 1, backgroundColor: '#FFFACC', borderRadius: 12, paddingVertical: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFE566' },
  deleteCancelBtnText: { fontSize: 16, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deleteConfirmBtn: { flex: 1, backgroundColor: '#FF4444', borderRadius: 12, paddingVertical: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  deleteConfirmBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFEF5', fontFamily: "'Permanent Marker', cursive" },
  permissionOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'center', alignItems: 'center', padding: 16, backdropFilter: 'blur(2px)' } as any,
  permissionBackdrop: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  permissionDialog: { backgroundColor: '#FFFEF5', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, maxHeight: '90vh', alignItems: 'center', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, gap: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' } as any,
  permissionIcon: { fontSize: 40 },
  permissionTitle: { fontSize: 19, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', fontFamily: "'Permanent Marker', cursive" },
  permissionDesc: { fontSize: 14, color: '#4A4A4A', textAlign: 'center', lineHeight: 20, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  permissionBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  permissionCancelBtn: { flex: 1, backgroundColor: '#FFFACC', borderRadius: 12, paddingVertical: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFE566' },
  permissionCancelBtnText: { fontSize: 14, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  permissionGrantBtn: { flex: 1, backgroundColor: '#0891B2', borderRadius: 12, paddingVertical: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  permissionGrantBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFEF5', fontFamily: "'Permanent Marker', cursive" },
})
