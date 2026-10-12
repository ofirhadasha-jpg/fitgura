import React from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'

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
  platform: string
  recommendedSize: string
  matchPercentage: number
  fitBreakdown: FitBreakdown | null
  affiliateUrl: string
}

interface SizingResultModalProps {
  visible: boolean
  productName: string
  productImage: string | null
  platform: string
  recommendedSize: string
  matchPercentage: number
  fitBreakdown: FitBreakdown | null
  affiliateUrl: string
  onClose: () => void
  onBuy: (url: string) => void
  onSave?: () => void
  saving?: boolean
}

export default function SizingResultModal({
  visible,
  productName,
  productImage,
  platform,
  recommendedSize,
  matchPercentage,
  fitBreakdown,
  affiliateUrl,
  onClose,
  onBuy,
  onSave,
  saving,
}: SizingResultModalProps) {
  if (!visible) return null

  const matchColor = matchPercentage >= 90 ? '#00CC52' : matchPercentage >= 75 ? '#FFE566' : '#F59E0B'

  return (
    <View style={styles.overlay}>
      <TouchableOpacity onPress={onClose} activeOpacity={1} style={styles.backdrop} />
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>תוצאת ניתוח מידה</Text>
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

        <Text style={styles.productName}>{productName}</Text>
        <View style={styles.platformBadge}>
          <Text style={styles.platformText}>{platform}</Text>
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

        {onSave && (
          <TouchableOpacity
            onPress={onSave}
            disabled={saving}
            activeOpacity={0.7}
            style={[styles.saveBtn, saving && styles.btnDisabled]}
          >
            <Text style={styles.saveBtnText}>{saving ? 'שומר...' : 'שמור בארון שלי'}</Text>
          </TouchableOpacity>
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
  platformBadge: { alignSelf: 'center', backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1, borderColor: '#FFE566', marginBottom: 14 },
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
  saveBtn: { backgroundColor: '#FFFACC', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFE566' },
  saveBtnText: { color: '#4A4A4A', fontSize: 14, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  btnDisabled: { opacity: 0.5 },
  fitBadge: { backgroundColor: '#00CC52', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#1A1A1A', marginTop: 8, alignSelf: 'center' },
  fitBadgeText: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
})
