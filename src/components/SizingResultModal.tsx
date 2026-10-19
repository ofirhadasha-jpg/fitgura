import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import type { AgeGroup, FamilyMember } from '../types'
import { type AnchorPos, computePopupStyle } from '../utils/popupPosition'
import { useEscToDismiss } from '../utils/useEscToDismiss'
import { buildComparisonAffiliateUrl, buildGoogleLensUrl } from '../services/affiliateService'
import { normalizeProductImageUrl } from '../utils/productImages'
import { captureClickPos } from '../utils/popupPosition'

export interface FitBreakdown {
  chest: { fit: string; score: number }
  waist: { fit: string; score: number }
  length: { fit: string; score: number }
}

export interface WardrobeItem {
  id: string
  productUrl: string
  productName: string
  productImage: string | null
  price: string | null
  platform: string
  recommendedSize: string
  matchPercentage: number
  fitBreakdown: FitBreakdown | null
  affiliateUrl: string
  profileId?: string | null
  isWishlist?: boolean
  createdAt?: string | null
}

export interface SaveProfileOption {
  id: string
  name: string
}

export function decodeHtmlEntities(text: string): string {
  if (!text) return text
  const entities: Record<string, string> = {
    '&#39;': "'",
    '&apos;': "'",
    '&quot;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
  }
  let decoded = text
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char)
  }
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
  return decoded
}

interface SizingResultModalProps {
  visible: boolean
  anchorPos?: AnchorPos
  productName: string
  productImage: string | null
  price: string | null
  platform: string
  recommendedSize: string
  matchPercentage: number
  fitBreakdown: FitBreakdown | null
  affiliateUrl: string
  onClose: () => void
  onBuy: (url: string) => void
  onSave?: (profileId: string, isWishlist?: boolean, overrideImage?: string | null, anchorPos?: AnchorPos) => void
  onProfileChange?: (profileId: string) => void
  recalculating?: boolean
  saving?: boolean
  familyMembers?: FamilyMember[]
  userName?: string | null
  profileName?: string | null
  defaultProfileId?: string | null
  category?: string
  profileAgeGroup?: AgeGroup
  productAgeRange?: 'adult' | 'children' | 'unknown'
}

export default function SizingResultModal({
  visible,
  anchorPos,
  productName,
  productImage,
  price,
  platform,
  recommendedSize,
  matchPercentage,
  fitBreakdown,
  affiliateUrl,
  onClose,
  onBuy,
  onSave,
  onProfileChange,
  recalculating = false,
  saving,
  familyMembers = [],
  userName,
  profileName,
  defaultProfileId,
  category = 'clothing',
  profileAgeGroup,
  productAgeRange = 'unknown',
}: SizingResultModalProps) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(defaultProfileId ?? 'self')
  const [isWishlist, setIsWishlist] = useState(false)
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [manualImageUrl, setManualImageUrl] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)
  const [overrideImage, setOverrideImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (defaultProfileId) setSelectedProfileId(defaultProfileId)
  }, [defaultProfileId])

  useEffect(() => {
    setImgError(false)
    setOverrideImage(null)
    setManualImageUrl('')
    setShowManualInput(false)
  }, [productImage, visible])

  useEscToDismiss(visible, onClose)

  if (!visible) return null

  const matchColor = matchPercentage >= 90 ? '#00CC52' : matchPercentage >= 75 ? '#FFE566' : '#F59E0B'
  const decodedName = decodeHtmlEntities(productName)

  const normalizedImage = normalizeProductImageUrl(overrideImage ?? productImage)
  const imageFailed = imgError && !overrideImage
  const displayImage = normalizedImage ?? null
  const showNoImagePrompt = !displayImage || imageFailed

  const profileOptions: SaveProfileOption[] = [
    { id: 'self', name: userName ?? 'אני' },
    ...familyMembers.map((m) => ({ id: m.id, name: m.name })),
  ]

  const selectedProfile = profileOptions.find((p) => p.id === selectedProfileId)
  const isChildProfile = profileAgeGroup === 'baby' || profileAgeGroup === 'toddler' || profileAgeGroup === 'child'
  const profileMismatch = (isChildProfile && productAgeRange === 'adult') || (!isChildProfile && productAgeRange === 'children')

  const saveBtnText = saving
    ? 'שומר...'
    : isWishlist
      ? (selectedProfileId === 'self' ? 'שמור ברשימת משאלות 🎁' : `שמור ברשימת משאלות של ${selectedProfile?.name ?? ''} 🎁`)
      : (selectedProfileId === 'self' ? 'שמור בארון שלי' : `שמור בארון של ${selectedProfile?.name ?? ''}`)

  function handleProfileSelect(profileId: string) {
    setSelectedProfileId(profileId)
    onProfileChange?.(profileId)
  }

  function handleSave(event?: unknown) {
    const anchor = captureClickPos(event)
    onSave?.(selectedProfileId, isWishlist, normalizedImage ?? overrideImage ?? productImage, anchor)
  }

  function handleSaveToWardrobe(event?: unknown) {
    const anchor = captureClickPos(event)
    onSave?.(selectedProfileId, false, normalizedImage ?? overrideImage ?? productImage, anchor)
  }

  function handleManualFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setOverrideImage(dataUrl)
      setImgError(false)
      setShowManualInput(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleManualUrlSubmit() {
    const trimmed = manualImageUrl.trim()
    if (!trimmed) return
    setOverrideImage(trimmed)
    setImgError(false)
    setShowManualInput(false)
  }

  return (
    <View style={styles.overlay}>
      <TouchableOpacity onPress={onClose} activeOpacity={1} style={styles.backdrop} />
      <View style={[styles.panel, anchorPos ? { position: 'fixed' as React.CSSProperties, ...computePopupStyle(anchorPos, 360, 500) } : null]}>
        <View style={styles.header}>
          <Text style={styles.title}>{profileName ? `תוצאת ניתוח מידה עבור ${profileName}` : 'תוצאת ניתוח מידה'}</Text>
          {matchPercentage >= 90 && (
            <View style={styles.fitBadge}>
              <Text style={styles.fitBadgeText}>בול בשבילך! 👌</Text>
            </View>
          )}
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        {displayImage && !imageFailed ? (
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: displayImage }}
              style={styles.productImage}
              onError={() => { if (!overrideImage) setImgError(true) }}
            />
            {!overrideImage && (
              <TouchableOpacity
                onPress={() => setShowManualInput((v) => !v)}
                activeOpacity={0.7}
                style={styles.manualImageToggle}
              >
                <Text style={styles.manualImageToggleText}>תמונה לא נכונה? החלף 📷</Text>
              </TouchableOpacity>
            )}
            {overrideImage && (
              <TouchableOpacity
                onPress={() => { setOverrideImage(null); setImgError(false) }}
                activeOpacity={0.7}
                style={styles.manualImageToggle}
              >
                <Text style={styles.manualImageToggleText}>חזור לתמונה המקורית ↩️</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : showNoImagePrompt ? (
          <View style={styles.imageWrap}>
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderIcon}>📸</Text>
              <Text style={styles.imagePlaceholderText}>לא הצלחנו למשוך את תמונת המוצר</Text>
              <TouchableOpacity
                onPress={() => fileInputRef.current?.click()}
                activeOpacity={0.7}
                style={[styles.manualImageToggle, { marginTop: 8 } as React.CSSProperties]}
              >
                <Text style={styles.manualImageToggleText}>לחץ כאן להעלאת תמונה/צילום מסך 📸</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {showManualInput && (
          <View style={styles.manualImageBox}>
            <Text style={styles.manualImageLabel}>הדבק קישור לתמונה או העלה קובץ:</Text>
            <View style={styles.manualImageRow}>
              <input
                type="text"
                value={manualImageUrl}
                onChange={(e) => setManualImageUrl(e.target.value)}
                placeholder="https://..."
                style={styles.manualImageInput as React.CSSProperties}
              />
              <TouchableOpacity
                onPress={handleManualUrlSubmit}
                activeOpacity={0.7}
                style={styles.manualImageBtn}
              >
                <Text style={styles.manualImageBtnText}>אישור ✓</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => fileInputRef.current?.click()}
              activeOpacity={0.7}
              style={styles.manualUploadBtn}
            >
              <Text style={styles.manualUploadBtnText}>בחר תמונה מהמכשיר 📁</Text>
            </TouchableOpacity>
          </View>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 } as React.CSSProperties}
          onChange={handleManualFileSelect}
        />

        <Text style={styles.productName}>{decodedName}</Text>
        <View style={styles.productMetaRow}>
          <View style={styles.platformBadge}>
            <Text style={styles.platformText}>{platform}</Text>
          </View>
          {price && (
            <Text style={styles.priceText}>{price}</Text>
          )}
        </View>

        <View style={[styles.sizeCard, { borderColor: matchColor }]}>
          <Text style={styles.sizeLabel}>המידה המומלצת</Text>
          <Text style={[styles.sizeValue, { color: matchColor }]}>{recommendedSize}</Text>
          <View style={styles.matchBar}>
            <View style={[styles.matchBarFill, { width: `${matchPercentage}%`, backgroundColor: matchColor }]} />
          </View>
          <Text style={[styles.matchPct, { color: matchColor }]}>{matchPercentage >= 90 ? `מידה ${recommendedSize} תונח עלייך מושלם` : `${matchPercentage}% התאמה`}</Text>
        </View>

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            {"\u05e9\u05d9\u05de\u05d5 \u05dc\u05d1: \u05e4\u05d9\u05d8\u05d2\u05d5\u05e8\u05d4 \u05de\u05e1\u05e4\u05e7\u05ea \u05d4\u05de\u05dc\u05e6\u05ea \u05de\u05d9\u05d3\u05d4 \u05de\u05d1\u05d5\u05e1\u05e1\u05ea AI \u05d5\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05d1\u05dc\u05d1\u05d3. \u05d4\u05d4\u05d7\u05dc\u05d8\u05d4 \u05d4\u05e1\u05d5\u05e4\u05d9\u05ea \u05d5\u05d4\u05e8\u05db\u05d9\u05e9\u05d4 \u05d4\u05df \u05d1\u05d0\u05d7\u05e8\u05d9\u05d5\u05ea \u05d4\u05de\u05e9\u05ea\u05de\u05e9/\u05ea."}
          </Text>
        </View>

        {profileMismatch && (
          <View style={[styles.disclaimerBox, styles.mismatchBox]}>
            <Text style={styles.mismatchText}>
              המוצר אינו מתאים לנתוני הפרופיל הנבחר (טווח מידות ילדים בלבד)
            </Text>
          </View>
        )}

        {fitBreakdown && (
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownTitle}>פירוט התאמה</Text>
            {[
              { label: 'חזה', data: fitBreakdown.chest },
              { label: 'מותן', data: fitBreakdown.waist },
              { label: 'אורך', data: fitBreakdown.length },
            ].map(({ label, data }) => (
              <View key={label} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{label}</Text>
                <Text style={styles.breakdownFit}>{data.fit}</Text>
                <View style={styles.breakdownScoreBar}>
                  <View style={[styles.breakdownScoreFill, { width: `${data.score}%`, backgroundColor: data.score >= 85 ? '#00CC52' : '#FFE566' }]} />
                </View>
                <Text style={styles.breakdownScoreText}>{data.score}%</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={() => onBuy(affiliateUrl)}
          activeOpacity={0.8}
          style={styles.buyBtn}
        >
          <Text style={styles.buyBtnText}>🛒 קנה עכשיו במידה {recommendedSize}</Text>
        </TouchableOpacity>

        {matchPercentage >= 95 && (
          <View style={styles.commitmentBadge}>
            <Text style={styles.commitmentBadgeIcon}>✅</Text>
            <Text style={styles.commitmentBadgeText}>
              מידה מאומתת ב-95%+ דיוק עבור {profileName ?? userName ?? 'אני'}. בטוח להזמין!
            </Text>
          </View>
        )}

        <View style={styles.comparisonRow}>
          <TouchableOpacity
            onPress={() => {
              const url = buildComparisonAffiliateUrl(decodedName)
              if (url) window.open(url, '_blank', 'noopener,noreferrer')
            }}
            activeOpacity={0.8}
            style={styles.compareAffiliateBtn}
          >
            <Text style={styles.compareAffiliateBtnText}>מצא באליאקספרס / SHEIN 🛒</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const imgForLens = normalizedImage ?? productImage
              if (imgForLens) {
                const lensUrl = buildGoogleLensUrl(imgForLens)
                if (lensUrl) window.open(lensUrl, '_blank', 'noopener,noreferrer')
              }
            }}
            activeOpacity={0.8}
            style={styles.compareLensBtn}
          >
            <Text style={styles.compareLensBtnText}>חפש תמונה בגוגל לנס 🔍</Text>
          </TouchableOpacity>
        </View>

        {onSave && (
          <View style={styles.wardrobeSection}>
            <TouchableOpacity
              onPress={() => setShowProfileDropdown((v) => !v)}
              activeOpacity={0.7}
              style={styles.wardrobeDropdownBtn}
            >
              <Text style={styles.wardrobeDropdownBtnText}>
                הוסף לארון של {selectedProfile?.name ?? '...'} 🔻
              </Text>
            </TouchableOpacity>
            {showProfileDropdown && (
              <View style={styles.wardrobeDropdownList}>
                {profileOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      handleProfileSelect(opt.id)
                      setShowProfileDropdown(false)
                    }}
                    activeOpacity={0.7}
                    style={[
                      styles.wardrobeDropdownItem,
                      opt.id === selectedProfileId && styles.wardrobeDropdownItemActive,
                    ]}
                  >
                    <Text style={[
                      styles.wardrobeDropdownItemText,
                      opt.id === selectedProfileId && styles.wardrobeDropdownItemTextActive,
                    ]}>
                      {opt.name} {opt.id === selectedProfileId ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={(e) => handleSaveToWardrobe(e)}
              disabled={saving}
              activeOpacity={0.7}
              style={[styles.wardrobeSaveBtn, saving && styles.btnDisabled]}
            >
              <Text style={styles.wardrobeSaveBtnText}>
                {saving ? 'שומר...' : `הוסף לארון של ${selectedProfile?.name ?? ''} 👕`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {onSave && (
          <View>
            <TouchableOpacity
              onPress={() => setIsWishlist((v) => !v)}
              activeOpacity={0.7}
              style={[styles.wishlistToggle, isWishlist && styles.wishlistToggleActive]}
            >
              <Text style={[styles.wishlistToggleText, isWishlist && styles.wishlistToggleTextActive]}>
                {isWishlist ? '🎁 רשימת משאלות למתנות' : 'הפוך לרשימת משאלות 🎁'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => handleSave(e)}
              disabled={saving}
              activeOpacity={0.7}
              style={[styles.saveBtn, saving && styles.btnDisabled]}
            >
              <Text style={styles.saveBtnText}>{saveBtnText}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'center', alignItems: 'center', padding: 16, backdropFilter: 'blur(2px)' } as React.CSSProperties,
  backdrop: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: { backgroundColor: '#FFFEF5', borderRadius: 22, padding: 20, width: '100%', maxWidth: 440, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' } as any,
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  closeText: { color: '#1A1A1A', fontSize: 22, lineHeight: 22 },
  imageWrap: { alignItems: 'center', marginBottom: 12 },
  productImage: { width: 120, height: 140, borderRadius: 12, borderWidth: 1.5, borderColor: '#1A1A1A', resizeMode: 'contain' as any, objectPosition: 'center' } as React.CSSProperties,
  imagePlaceholder: { width: 160, minHeight: 140, borderRadius: 12, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6 } as React.CSSProperties,
  imagePlaceholderIcon: { fontSize: 32 },
  imagePlaceholderText: { fontSize: 13, color: '#4A4A4A', marginTop: 4, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  manualImageToggle: { marginTop: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F5F0E0', borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  manualImageToggleText: { fontSize: 11, color: '#4A4A4A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  manualImageBox: { backgroundColor: '#FFFACC', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1.5, borderColor: '#FFE566' } as React.CSSProperties,
  manualImageLabel: { fontSize: 12, fontWeight: '700', color: '#4A4A4A', marginBottom: 6, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  manualImageRow: { flexDirection: 'row', gap: 6, marginBottom: 8 } as React.CSSProperties,
  manualImageInput: { flex: 1, borderRadius: 8, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5', paddingVertical: 8, paddingHorizontal: 10, fontSize: 13, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", outlineStyle: 'none' } as React.CSSProperties,
  manualImageBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#00CC52', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  manualImageBtnText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  manualUploadBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#E0F2FE', borderWidth: 1.5, borderColor: '#0891B2', alignItems: 'center' } as React.CSSProperties,
  manualUploadBtnText: { fontSize: 13, fontWeight: '700', color: '#0891B2', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  productName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', marginBottom: 6, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  platformBadge: { backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1, borderColor: '#FFE566' },
  productMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 14 },
  priceText: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  platformText: { fontSize: 12, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizeCard: { backgroundColor: '#FFFEF5', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 2, marginBottom: 14, boxShadow: '2px 2px 0 #1A1A1A' as any } as any,
  sizeLabel: { fontSize: 13, color: '#6B6B6B', marginBottom: 4, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizeValue: { fontSize: 36, fontWeight: '900', fontFamily: "'Permanent Marker', cursive" },
  matchBar: { width: '100%', height: 8, borderRadius: 4, backgroundColor: '#F5F0E0', marginTop: 10, overflow: 'hidden' as any, borderWidth: 1, borderColor: '#1A1A1A' },
  matchBarFill: { height: '100%', borderRadius: 4 },
  matchPct: { fontSize: 14, fontWeight: '700', marginTop: 6, fontFamily: "'Permanent Marker', cursive" },
  breakdownSection: { marginBottom: 14, gap: 8 },
  breakdownTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 4, fontFamily: "'Permanent Marker', cursive" },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLabel: { fontSize: 13, color: '#4A4A4A', width: 50, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  breakdownFit: { fontSize: 12, color: '#1A1A1A', width: 60, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  breakdownScoreBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#F5F0E0', overflow: 'hidden' as any },
  breakdownScoreFill: { height: '100%', borderRadius: 3 },
  breakdownScoreText: { fontSize: 11, fontWeight: '700', color: '#4A4A4A', width: 34, textAlign: 'left', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  buyBtn: { backgroundColor: '#00CC52', borderRadius: 14, paddingVertical: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any, marginBottom: 8 } as any,
  buyBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '800', fontFamily: "'Permanent Marker', cursive" },
  commitmentBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E0FFF0', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 2, borderColor: '#00CC52', marginBottom: 10, boxShadow: '2px 2px 0 #00CC52' as any } as any,
  commitmentBadgeIcon: { fontSize: 20 },
  commitmentBadgeText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#006633', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", lineHeight: 20 },
  comparisonRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  compareAffiliateBtn: { flex: 1, backgroundColor: '#0891B2', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' } as any,
  compareAffiliateBtnText: { color: '#FFFEF5', fontSize: 12, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  compareLensBtn: { flex: 1, backgroundColor: '#FFFEF5', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#4A4A4A' } as any,
  compareLensBtnText: { color: '#4A4A4A', fontSize: 12, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  profileSelectorCard: { backgroundColor: '#FFFACC', borderRadius: 14, padding: 12, marginBottom: 14, borderWidth: 1.5, borderColor: '#FFE566', gap: 8 } as any,
  profileSelectorLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  profileSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  profileOptionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5' } as any,
  profileOptionBtnActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566' },
  profileOptionText: { fontSize: 13, color: '#4A4A4A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  profileOptionTextActive: { color: '#1A1A1A', fontWeight: '700' },
  recalculatingBanner: { backgroundColor: '#E0F2FE', borderRadius: 10, padding: 10, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#0891B2' } as any,
  recalculatingText: { fontSize: 13, color: '#0891B2', fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeSection: { marginBottom: 12, gap: 8 },
  wardrobeDropdownBtn: { backgroundColor: '#E0F2FE', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any } as any,
  wardrobeDropdownBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', fontFamily: "'Permanent Marker', cursive" },
  wardrobeDropdownList: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 6, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any, gap: 4 } as any,
  wardrobeDropdownItem: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5' } as any,
  wardrobeDropdownItemActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566' },
  wardrobeDropdownItemText: { fontSize: 14, color: '#4A4A4A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  wardrobeDropdownItemTextActive: { color: '#1A1A1A', fontWeight: '800' },
  wardrobeSaveBtn: { backgroundColor: '#00CC52', borderRadius: 14, paddingVertical: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any } as any,
  wardrobeSaveBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', fontFamily: "'Permanent Marker', cursive" },
  saveBtn: { backgroundColor: '#FFFACC', borderRadius: 12, paddingVertical: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFE566' },
  wishlistToggle: { alignSelf: 'center', marginBottom: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F5F0E0', borderWidth: 1.5, borderColor: '#9A9A9A' } as any,
  wishlistToggleActive: { borderColor: '#1A1A1A', backgroundColor: '#FFD6E0' },
  wishlistToggleText: { fontSize: 13, color: '#4A4A4A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wishlistToggleTextActive: { color: '#1A1A1A', fontWeight: '700' },
  saveBtnText: { color: '#4A4A4A', fontSize: 14, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  btnDisabled: { opacity: 0.5 },
  fitBadge: { backgroundColor: '#00CC52', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#1A1A1A', marginTop: 8, alignSelf: 'center' },
  fitBadgeText: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  disclaimerBox: { backgroundColor: '#FFFACC', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FFE566' } as React.CSSProperties,
  disclaimerText: { fontSize: 11, lineHeight: 16, color: '#4A4A4A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  mismatchBox: { backgroundColor: '#FFF0F0', borderColor: '#DC2626' },
  mismatchText: { fontSize: 13, lineHeight: 19, color: '#991B1B', textAlign: 'center', fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
