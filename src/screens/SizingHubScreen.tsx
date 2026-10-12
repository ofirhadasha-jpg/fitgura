import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Image } from 'react-native'
import { BottomNav } from '../components'
import ContextualUpsellBanner from '../components/ContextualUpsellBanner'
import GalleryPreviewModal, { type PreviewablePhoto } from '../components/GalleryPreviewModal'
import type { Screen, User, ScannedSizes, ScanEntry, Product, FamilyMember } from '../types'
import { supabase } from '../lib/supabase'
import SizingResultModal, { type WardrobeItem, type FitBreakdown, decodeHtmlEntities } from '../components/SizingResultModal'
import CategoryMismatchModal, { detectProductTarget, checkCategoryMismatch, type CategoryMismatch, type SmartMatch } from '../components/CategoryMismatchModal'
import { analyzeProductUrl } from '../services/analyzeProductUrl'
import { runGalleryScan, persistSizingToSupabase, type MergedSizingResult } from '../services/sizingService'
import { SKIMLINKS_PUBLISHER_ID } from '../lib/config'

const PAPER_TEXTURE = 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)' as any

function wrapAffiliateUrl(url: string): string {
  if (!SKIMLINKS_PUBLISHER_ID) return url
  try {
    const encoded = encodeURIComponent(url)
    return `https://go.skimresources.com/?id=${SKIMLINKS_PUBLISHER_ID}&url=${encoded}&xs=1`
  } catch {
    return url
  }
}

export function SizingHubScreen({ onNav, user, scannedSizes, setScannedSizes, scanGallery, setScanGallery, wishlistItems, feedCatalog, budget, onToggleWishlist, familyMembers }: {
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
    recommendedSize: string
    matchPercentage: number
    fitBreakdown: FitBreakdown | null
    affiliateUrl: string
    originalUrl: string
  } | null>(null)

  const [galleryPhotos, setGalleryPhotos] = useState<PreviewablePhoto[]>([])
  const [galleryModalVisible, setGalleryModalVisible] = useState(false)
  const [galleryProcessing, setGalleryProcessing] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [mismatch, setMismatch] = useState<CategoryMismatch | null>(null)
  const [pendingResult, setPendingResult] = useState<typeof result>(null)
  const [overrideMismatch, setOverrideMismatch] = useState(false)
  const [galleryToast, setGalleryToast] = useState(false)

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
    try {
      const { data, error } = await supabase
        .from('fitted_wardrobe')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
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
      })))
    } catch {
      // Non-fatal
    }
  }, [])

  useEffect(() => { void loadWardrobe() }, [loadWardrobe])

  async function handleAnalyze() {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!scannedSizes) {
      onNav('profile')
      return
    }

    setAnalyzing(true)

    try {
      const analysisResult = await analyzeProductUrl(trimmed, scannedSizes, accuracy)
      const affiliateUrl = wrapAffiliateUrl(trimmed)

      const newResult = {
        visible: true,
        productName: analysisResult.productName,
        productImage: analysisResult.productImage,
        price: analysisResult.price,
        platform: analysisResult.platform,
        recommendedSize: analysisResult.recommendedSize,
        matchPercentage: analysisResult.matchPercentage,
        fitBreakdown: analysisResult.fitBreakdown,
        affiliateUrl,
        originalUrl: trimmed,
      }

      const productTarget = detectProductTarget(analysisResult.productName, analysisResult.category, trimmed)
      const detected = checkCategoryMismatch(
        productTarget,
        scannedSizes.gender,
        scannedSizes.ageGroup,
        user?.name ?? 'אני',
        familyMembers ?? [],
      )

      if (detected && !overrideMismatch) {
        setPendingResult(newResult)

        // Auto-run analysis against matching family profiles to find best fit
        const members = familyMembers ?? []
        const productTarget = detected.productTarget
        const candidateMembers = members.filter((m) => {
          if (!m.scannedSizes) return false
          const mg = m.scannedSizes.gender
          const ma = m.scannedSizes.ageGroup
          if (productTarget === 'women') return mg === 'female' && (ma === 'adult' || ma === 'teen')
          if (productTarget === 'men') return mg === 'male' && (ma === 'adult' || ma === 'teen')
          if (productTarget === 'boys' || productTarget === 'girls' || productTarget === 'kids') return ma === 'child' || ma === 'toddler'
          if (productTarget === 'baby') return ma === 'baby'
          return false
        })

        let bestMatch: SmartMatch | null = null

        if (candidateMembers.length > 0) {
          try {
            const results = await Promise.all(
              candidateMembers.map(async (m) => {
                try {
                  const r = await analyzeProductUrl(trimmed, m.scannedSizes!, m.accuracy)
                  return { member: m, result: r }
                } catch {
                  return null
                }
              })
            )
            const valid = results.filter((r): r is { member: typeof candidateMembers[0]; result: typeof analysisResult } => r !== null)
            if (valid.length > 0) {
              const best = valid.reduce((a, b) => b.result.matchPercentage > a.result.matchPercentage ? b : a)
              bestMatch = {
                profileId: best.member.id,
                profileName: best.member.name,
                recommendedSize: best.result.recommendedSize,
                matchPercentage: best.result.matchPercentage,
                emoji: best.member.category === 'baby' ? '👶' : best.member.category === 'child' ? '🧒' : '💍',
              }
            }
          } catch (err) {
            console.error('[SizingHub] Smart match failed:', err)
          }
        }

        setMismatch({ ...detected, smartMatch: bestMatch })
        setResult(null)
      } else {
        setResult(newResult)
      }
    } catch (err) {
      console.error('[SizingHub] Analysis failed:', err)
      if (err instanceof Error && err.message === 'NO_PROFILE') {
        onNav('profile')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSaveToWardrobe(profileId: string) {
    if (!result) return
    try {
      const { error } = await supabase
        .from('fitted_wardrobe')
        .insert({
          product_url: result.originalUrl,
          product_name: result.productName,
          product_image: result.productImage,
          price: result.price,
          platform: result.platform,
          recommended_size: result.recommendedSize,
          match_percentage: result.matchPercentage,
          fit_breakdown: result.fitBreakdown,
          affiliate_url: result.affiliateUrl,
          user_id: user?.id ?? null,
          profile_id: profileId === 'self' ? null : profileId,
        })
      if (error) console.error('[SizingHub] Save failed:', error)
      else void loadWardrobe()
    } catch (err) {
      console.error('[SizingHub] Save error:', err)
    }
    setResult((prev) => prev ? { ...prev, visible: false } : null)
  }

  function handleBuy(affiliateUrl: string) {
    window.open(affiliateUrl, '_blank', 'noopener,noreferrer')
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

  function handleMismatchSwitch(profileId: string) {
    const targetMember = (familyMembers ?? []).find((m) => m.id === profileId)
    if (!targetMember?.scannedSizes) {
      setMismatch(null)
      setPendingResult(null)
      return
    }

    void (async () => {
      const trimmed = url.trim()
      if (!trimmed || !pendingResult) {
        setMismatch(null)
        return
      }

      setAnalyzing(true)
      try {
        const reanalysis = await analyzeProductUrl(trimmed, targetMember.scannedSizes, targetMember.accuracy)
        const affiliateUrl = wrapAffiliateUrl(trimmed)
        setResult({
          visible: true,
          productName: reanalysis.productName,
          productImage: reanalysis.productImage,
          price: reanalysis.price,
          platform: reanalysis.platform,
          recommendedSize: reanalysis.recommendedSize,
          matchPercentage: reanalysis.matchPercentage,
          fitBreakdown: reanalysis.fitBreakdown,
          affiliateUrl,
          originalUrl: trimmed,
        })
      } catch (err) {
        console.error('[SizingHub] Re-analysis for switched profile failed:', err)
      } finally {
        setAnalyzing(false)
      }
    })()

    setMismatch(null)
    setPendingResult(null)
  }

  function handleMismatchOverride() {
    setOverrideMismatch(true)
    if (pendingResult) {
      setResult(pendingResult)
    }
    setMismatch(null)
    setPendingResult(null)
  }

  function handleMismatchClose() {
    setMismatch(null)
    setPendingResult(null)
  }

  function handleSmartMatchSave(profileId: string) {
    const targetMember = (familyMembers ?? []).find((m) => m.id === profileId)
    if (!targetMember) {
      setMismatch(null)
      setPendingResult(null)
      return
    }

    void (async () => {
      const trimmed = url.trim()
      if (!trimmed) {
        setMismatch(null)
        return
      }

      setAnalyzing(true)
      try {
        const reanalysis = await analyzeProductUrl(trimmed, targetMember.scannedSizes ?? scannedSizes!, targetMember.accuracy ?? accuracy)
        const affiliateUrl = wrapAffiliateUrl(trimmed)

        const { error } = await supabase.from('fitted_wardrobe').insert({
          product_url: trimmed,
          product_name: reanalysis.productName,
          product_image: reanalysis.productImage,
          price: reanalysis.price,
          platform: reanalysis.platform,
          recommended_size: reanalysis.recommendedSize,
          match_percentage: reanalysis.matchPercentage,
          fit_breakdown: reanalysis.fitBreakdown,
          affiliate_url: affiliateUrl,
          user_id: user?.id ?? null,
          profile_id: profileId,
        })
        if (error) console.error('[SizingHub] Smart match save failed:', error)
        else void loadWardrobe()
      } catch (err) {
        console.error('[SizingHub] Smart match save error:', err)
      } finally {
        setAnalyzing(false)
      }
    })()

    setMismatch(null)
    setPendingResult(null)
  }

  function handleUpsellTrigger() {
    if (scanGallery && scanGallery.length > 0) {
      const existingPhotos: PreviewablePhoto[] = scanGallery.slice(0, 6).map((entry) => ({
        id: `existing_${entry.id}`,
        url: entry.photoUrl,
      }))
      setGalleryPhotos(existingPhotos)
      setGalleryModalVisible(true)
      return
    }
    galleryInputRef.current?.click()
  }

  function handleGallerySync() {
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

        {accuracy < 95 && (
          <ContextualUpsellBanner accuracy={accuracy} onTrigger={handleUpsellTrigger} variant="feed" />
        )}

        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>מצאת משהו שווה ברשת? שים פה לינק ונפצח לך את המידה 🕵️‍♂️✨</Text>
          <View style={styles.platformRow}>
            {['SHEIN', 'AliExpress', 'Temu', 'Zara'].map((p) => (
              <View key={p} style={styles.platformChip}><Text style={styles.platformChipText}>{p}</Text></View>
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
            <Text style={styles.analyzeBtnText}>{analyzing ? 'מנתח...' : 'פצח לי מידה ✨'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>איך לשתף לפיטגורה</Text>
          <View style={styles.guideSteps}>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepNum}>1</Text>
              <Text style={styles.guideStepText}>פתח את המוצר באפליקציית החנות</Text>
            </View>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepNum}>2</Text>
              <Text style={styles.guideStepText}>לחץ על כפתור Share / שיתוף</Text>
            </View>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepNum}>3</Text>
              <Text style={styles.guideStepText}>בחר "פיטגורה" מרשימת האפליקציות</Text>
            </View>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepNum}>4</Text>
              <Text style={styles.guideStepText}>קבל את המידה המומלצת מיד</Text>
            </View>
          </View>
        </View>

        <View style={styles.wardrobeSection}>
          <Text style={styles.wardrobeTitle}>הארון שלי</Text>

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
          {wardrobe.length === 0 ? (
            <View style={styles.wardrobeEmpty}>
              <Text style={{ fontSize: 32 }}>👔</Text>
              <Text style={styles.wardrobeEmptyText}>עדיין לא ניתחת מוצרים</Text>
              <Text style={styles.wardrobeEmptySub}>הדבק קישור למעלה כדי להתחיל</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {wardrobe.map((item) => {
                const decodedName = decodeHtmlEntities(item.productName)
                const expanded = expandedWardrobe.has(item.id)
                const baseSize = getWardrobeBaseSize(item)
                const profileTag = getWardrobeProfileTag(item)
                const buyerInsights = getWardrobeBuyerInsights(item)
                return (
                  <View key={item.id} style={styles.wardrobeCard}>
                    <View style={styles.wardrobeItemRow}>
                      <View style={styles.wardrobeThumbWrap}>
                        {item.productImage ? (
                          <Image source={{ uri: item.productImage }} style={styles.wardrobeThumb} />
                        ) : (
                          <View style={styles.wardrobeThumbPlaceholder}>
                            <Text style={styles.wardrobeThumbPlaceholderText}>👕</Text>
                          </View>
                        )}
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
                      </View>
                      <View style={styles.wardrobeSizeBadge}>
                        <Text style={styles.wardrobeSizeText}>{item.recommendedSize}</Text>
                        <Text style={styles.wardrobeMatchText}>{item.matchPercentage}%</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setDeleteTarget(item)}
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
                          <Text style={styles.wardrobeProfileTagText}>{profileTag}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => window.open(item.affiliateUrl, '_blank', 'noopener,noreferrer')}
                          activeOpacity={0.8}
                          style={styles.wardrobeBuyBtn}
                        >
                          <Text style={styles.wardrobeBuyBtnText}>קנה עכשיו במידה {item.recommendedSize} 🛒</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {deleteTarget && (
          <View style={styles.deleteOverlay}>
            <TouchableOpacity onPress={() => setDeleteTarget(null)} activeOpacity={1} style={styles.deleteBackdrop} />
            <View style={styles.deleteDialog}>
              <Text style={styles.deleteDialogIcon}>🗑️</Text>
              <Text style={styles.deleteDialogTitle}>להסיר את המוצר מהארון? 🗑️</Text>
              <Text style={styles.deleteDialogSub} numberOfLines={2}>{decodeHtmlEntities(deleteTarget.productName)}</Text>
              <View style={styles.deleteDialogBtns}>
                <TouchableOpacity
                  onPress={() => setDeleteTarget(null)}
                  activeOpacity={0.7}
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

        <TouchableOpacity
          onPress={handleGallerySync}
          activeOpacity={0.8}
          style={styles.gallerySyncBtn}
        >
          <Text style={styles.gallerySyncBtnText}>סנכרון תמונות אוטומטי מהגלריה</Text>
        </TouchableOpacity>

        {galleryToast && (
          <View style={styles.galleryToast} pointerEvents="none">
            <Text style={styles.galleryToastText}>בחר 2-3 תמונות מהגלריה לניתוח ✨</Text>
          </View>
        )}
      </ScrollView>

      <BottomNav current="hub" onNav={onNav} isAdmin={user?.is_admin === true} />

      {result && (
        <SizingResultModal
          visible={result.visible}
          productName={result.productName}
          productImage={result.productImage}
          price={result.price}
          platform={result.platform}
          recommendedSize={result.recommendedSize}
          matchPercentage={result.matchPercentage}
          fitBreakdown={result.fitBreakdown}
          affiliateUrl={result.affiliateUrl}
          onClose={() => { setResult(null); setOverrideMismatch(false) }}
          onBuy={handleBuy}
          onSave={handleSaveToWardrobe}
          familyMembers={familyMembers ?? []}
          userName={user?.name}
        />
      )}

      <CategoryMismatchModal
        visible={mismatch !== null}
        mismatch={mismatch}
        onSwitchProfile={handleMismatchSwitch}
        onAddProfile={() => { handleMismatchClose(); onNav('profile') }}
        onSmartMatchSave={handleSmartMatchSave}
        onOverride={handleMismatchOverride}
        onClose={handleMismatchClose}
      />

      <GalleryPreviewModal
        visible={galleryModalVisible}
        photos={galleryPhotos}
        onApprove={handleGalleryApprove}
        onCancel={handleGalleryCancel}
        processing={galleryProcessing}
      />
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
  guideStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guideStepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1A1A1A', color: '#FFE566', textAlign: 'center', textAlignVertical: 'center', fontSize: 13, fontWeight: '800', lineHeight: 26 },
  guideStepText: { fontSize: 14, color: '#1A1A1A', flex: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeSection: { gap: 10 },
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
  wardrobeDeleteBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 4 },
  wardrobeDeleteBtnText: { fontSize: 16 },
  deleteOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500, justifyContent: 'center', alignItems: 'center' },
  deleteBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.65)' },
  deleteDialog: { backgroundColor: '#FFFEF5', borderRadius: 18, padding: 24, width: '85%', maxWidth: 380, alignItems: 'center', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, gap: 12 } as any,
  deleteDialogIcon: { fontSize: 36 },
  deleteDialogTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', fontFamily: "'Permanent Marker', cursive" },
  deleteDialogSub: { fontSize: 13, color: '#6B6B6B', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deleteDialogBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  deleteCancelBtn: { flex: 1, backgroundColor: '#FFFACC', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFE566' },
  deleteCancelBtnText: { fontSize: 14, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deleteConfirmBtn: { flex: 1, backgroundColor: '#FF4444', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  deleteConfirmBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFEF5', fontFamily: "'Permanent Marker', cursive" },
  gallerySyncBtn: { backgroundColor: '#0891B2', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any, marginTop: 4 } as any,
  gallerySyncBtnText: { color: '#FFFEF5', fontSize: 15, fontWeight: '800', fontFamily: "'Permanent Marker', cursive" },
  galleryToast: { position: 'absolute', bottom: 90, left: 20, right: 20, backgroundColor: '#1A1A1A', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', zIndex: 600, boxShadow: '2px 2px 0 #0891B2' as any } as any,
  galleryToastText: { color: '#FFE566', fontSize: 14, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
})
