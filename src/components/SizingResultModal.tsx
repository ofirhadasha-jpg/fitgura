import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import type { FamilyMember } from '../types'
import { buildComparisonAffiliateUrl, buildGoogleLensUrl } from '../services/affiliateService'

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
  onSave?: (profileId: string, isWishlist?: boolean) => void
  saving?: boolean
  familyMembers?: FamilyMember[]
  userName?: string | null
  profileName?: string | null
  defaultProfileId?: string | null
}

export default function SizingResultModal({
  visible,
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
  saving,
  familyMembers = [],
  userName,
  profileName,
  defaultProfileId,
}: SizingResultModalProps) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(defaultProfileId ?? 'self')
  const [showProfileSelector, setShowProfileSelector] = useState(false)
  const [isWishlist, setIsWishlist] = useState(false)

  useEffect(() => {
    if (defaultProfileId) setSelectedProfileId(defaultProfileId)
  }, [defaultProfileId])

  if (!visible) return null

  const matchColor = matchPercentage >= 90 ? '#00CC52' : matchPercentage >= 75 ? '#FFE566' : '#F59E0B'
  const decodedName = decodeHtmlEntities(productName)

  const profileOptions: SaveProfileOption[] = [
    { id: 'self', name: userName ?? 'אני' },
    ...familyMembers.map((m) => ({ id: m.id, name: m.name })),
  ]

  const selectedProfile = profileOptions.find((p) => p.id === selectedProfileId)
  const saveBtnText = saving
    ? 'שומר...'
    : isWishlist
      ? (selectedProfileId === 'self' ? 'שמור ברשימת משאלות 🎁' : `שמור ברשימת משאלות של ${selectedProfile?.name ?? ''} 🎁`)
      : (selectedProfileId === 'self' ? 'שמור בארון שלי' : `שמור בארון של ${selectedProfile?.name ?? ''}`)

  function handleSave() {
    onSave?.(selectedProfileId, isWishlist)
  }

  return (
    <View style={styles.overlay}>
      <TouchableOpacity onPress={onClose} activeOpacity={1} style={styles.backdrop} />
      <View style={styles.panel}>
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

        {productImage && (
          <View style={styles.imageWrap}>
            <Image source={{ uri: productImage }} style={styles.productImage} />
          </View>
        )}

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
              if (productImage) {
                const lensUrl = buildGoogleLensUrl(productImage)
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
          <View>
            {profileOptions.length > 1 && (
              <TouchableOpacity
                onPress={() => setShowProfileSelector((v) => !v)}
                activeOpacity={0.7}
                style={styles.profileToggleBtn}
              >
                <Text style={styles.profileToggleText}>
                  למי לשמור? {selectedProfile?.name ?? 'אני'} {showProfileSelector ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
            )}
            {showProfileSelector && profileOptions.length > 1 && (
              <View style={styles.profileSelectorRow}>
                {profileOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => { setSelectedProfileId(opt.id); setShowProfileSelector(false) }}
                    activeOpacity={0.7}
                    style={[
                      styles.profileOptionBtn,
                      selectedProfileId === opt.id && styles.profileOptionBtnActive,
                    ]}
                  >
                    <Text style={[
                      styles.profileOptionText,
                      selectedProfileId === opt.id && styles.profileOptionTextActive,
                    ]}>
                      {opt.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
              onPress={handleSave}
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
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400, justifyContent: 'center', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.65)' },
  panel: { backgroundColor: '#FFFEF5', borderRadius: 22, padding: 20, width: '90%', maxWidth: 440, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, maxHeight: '90%' } as any,
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  closeText: { color: '#1A1A1A', fontSize: 22, lineHeight: 22 },
  imageWrap: { alignItems: 'center', marginBottom: 12 },
  productImage: { width: 120, height: 140, borderRadius: 12, borderWidth: 1.5, borderColor: '#1A1A1A', resizeMode: 'cover' as any },
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
  buyBtn: { backgroundColor: '#00CC52', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any, marginBottom: 8 } as any,
  buyBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '800', fontFamily: "'Permanent Marker', cursive" },
  comparisonRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  compareAffiliateBtn: { flex: 1, backgroundColor: '#0891B2', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' } as any,
  compareAffiliateBtnText: { color: '#FFFEF5', fontSize: 12, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  compareLensBtn: { flex: 1, backgroundColor: '#FFFEF5', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#4A4A4A' } as any,
  compareLensBtnText: { color: '#4A4A4A', fontSize: 12, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  profileToggleBtn: { alignSelf: 'center', marginBottom: 8, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#E0F2FE', borderWidth: 1, borderColor: '#0891B2' },
  profileToggleText: { fontSize: 13, color: '#0891B2', fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  profileSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 10 },
  profileOptionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5' } as any,
  profileOptionBtnActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566' },
  profileOptionText: { fontSize: 12, color: '#4A4A4A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  profileOptionTextActive: { color: '#1A1A1A', fontWeight: '700' },
  saveBtn: { backgroundColor: '#FFFACC', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFE566' },
  wishlistToggle: { alignSelf: 'center', marginBottom: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F5F0E0', borderWidth: 1.5, borderColor: '#9A9A9A' } as any,
  wishlistToggleActive: { borderColor: '#1A1A1A', backgroundColor: '#FFD6E0' },
  wishlistToggleText: { fontSize: 13, color: '#4A4A4A', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wishlistToggleTextActive: { color: '#1A1A1A', fontWeight: '700' },
  saveBtnText: { color: '#4A4A4A', fontSize: 14, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  btnDisabled: { opacity: 0.5 },
  fitBadge: { backgroundColor: '#00CC52', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#1A1A1A', marginTop: 8, alignSelf: 'center' },
  fitBadgeText: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
})
