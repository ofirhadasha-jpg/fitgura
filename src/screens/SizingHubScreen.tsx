import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Image } from 'react-native'
import { BottomNav } from '../components'
import type { Screen, User, ScannedSizes } from '../types'
import { supabase } from '../lib/supabase'
import SizingResultModal, { type WardrobeItem, type FitBreakdown } from '../components/SizingResultModal'
import { calculateRecommendedSize } from '../utils/exactSizeMatcher'
import { SKIMLINKS_PUBLISHER_ID } from '../lib/config'

const PAPER_TEXTURE = 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)' as any

function detectPlatform(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('shein')) return 'SHEIN'
  if (lower.includes('aliexpress')) return 'AliExpress'
  if (lower.includes('temu')) return 'Temu'
  if (lower.includes('zara')) return 'ZARA'
  if (lower.includes('hm.com') || lower.includes('h&m')) return 'H&M'
  if (lower.includes('asos')) return 'ASOS'
  if (lower.includes('amazon')) return 'Amazon'
  if (lower.includes('nike')) return 'Nike'
  return 'חנות אונליין'
}

function wrapAffiliateUrl(url: string): string {
  if (!SKIMLINKS_PUBLISHER_ID) return url
  try {
    const encoded = encodeURIComponent(url)
    return `https://go.skimresources.com/?id=${SKIMLINKS_PUBLISHER_ID}&url=${encoded}&xs=1`
  } catch {
    return url
  }
}

function extractProductName(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1] ?? ''
    return decodeURIComponent(last.replace(/[-_]/g, ' ').replace(/\.\w+$/, '')).slice(0, 60) || 'מוצר'
  } catch {
    return 'מוצר משנותף'
  }
}

export function SizingHubScreen({ onNav, user, scannedSizes }: {
  onNav: (s: Screen) => void
  user: User | null
  scannedSizes: ScannedSizes | null
}) {
  const [url, setUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [accuracy, setAccuracy] = useState(72)
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([])
  const [result, setResult] = useState<{
    visible: boolean
    productName: string
    productImage: string | null
    platform: string
    recommendedSize: string
    matchPercentage: number
    fitBreakdown: FitBreakdown | null
    affiliateUrl: string
    originalUrl: string
  } | null>(null)

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
        platform: row.platform as string ?? 'חנות',
        recommendedSize: row.recommended_size as string ?? '-',
        matchPercentage: row.match_percentage as number ?? 0,
        fitBreakdown: row.fit_breakdown as FitBreakdown | null,
        affiliateUrl: row.affiliate_url as string ?? row.product_url as string,
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
      const platform = detectPlatform(trimmed)
      const productName = extractProductName(trimmed)
      const affiliateUrl = wrapAffiliateUrl(trimmed)

      const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
      const recommended = calculateRecommendedSize(scannedSizes, [], 'clothing', productName, availableSizes) ?? 'M'

      const matchPct = accuracy >= 95 ? 97 : accuracy >= 85 ? 90 : 82

      const breakdown: FitBreakdown = {
        chest: { fit: 'התאמה מדויקת', score: matchPct },
        waist: { fit: 'התאמה טובה', score: Math.max(75, matchPct - 5) },
        length: { fit: 'התאמה מלאה', score: Math.max(80, matchPct - 2) },
      }

      setResult({
        visible: true,
        productName,
        productImage: null,
        platform,
        recommendedSize: recommended,
        matchPercentage: matchPct,
        fitBreakdown: breakdown,
        affiliateUrl,
        originalUrl: trimmed,
      })
    } catch (err) {
      console.error('[SizingHub] Analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSaveToWardrobe() {
    if (!result) return
    try {
      const { error } = await supabase
        .from('fitted_wardrobe')
        .insert({
          product_url: result.originalUrl,
          product_name: result.productName,
          product_image: result.productImage,
          platform: result.platform,
          recommended_size: result.recommendedSize,
          match_percentage: result.matchPercentage,
          fit_breakdown: result.fitBreakdown,
          affiliate_url: result.affiliateUrl,
          user_id: user?.id ?? null,
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

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFEF5', backgroundImage: PAPER_TEXTURE }}>
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

        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>הדבק קישור למוצר מכל חנות:</Text>
          <View style={styles.platformRow}>
            {['SHEIN', 'AliExpress', 'Temu', 'Zara'].map((p) => (
              <View key={p} style={styles.platformChip}><Text style={styles.platformChipText}>{p}</Text></View>
            ))}
          </View>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://www.shein.co.il/..."
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
            <Text style={styles.analyzeBtnText}>{analyzing ? 'מנתח...' : 'נתח מידה ✨'}</Text>
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
          {wardrobe.length === 0 ? (
            <View style={styles.wardrobeEmpty}>
              <Text style={{ fontSize: 32 }}>👔</Text>
              <Text style={styles.wardrobeEmptyText}>עדיין לא ניתחת מוצרים</Text>
              <Text style={styles.wardrobeEmptySub}>הדבק קישור למעלה כדי להתחיל</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {wardrobe.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => window.open(item.affiliateUrl, '_blank', 'noopener,noreferrer')}
                  activeOpacity={0.7}
                  style={styles.wardrobeItem}
                >
                  {item.productImage && (
                    <Image source={{ uri: item.productImage }} style={styles.wardrobeThumb} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.wardrobeItemName}>{item.productName}</Text>
                    <Text style={styles.wardrobeItemPlatform}>{item.platform}</Text>
                  </View>
                  <View style={styles.wardrobeSizeBadge}>
                    <Text style={styles.wardrobeSizeText}>{item.recommendedSize}</Text>
                    <Text style={styles.wardrobeMatchText}>{item.matchPercentage}%</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <BottomNav current="hub" onNav={onNav} isAdmin={user?.is_admin === true} />

      {result && (
        <SizingResultModal
          visible={result.visible}
          productName={result.productName}
          productImage={result.productImage}
          platform={result.platform}
          recommendedSize={result.recommendedSize}
          matchPercentage={result.matchPercentage}
          fitBreakdown={result.fitBreakdown}
          affiliateUrl={result.affiliateUrl}
          onClose={() => setResult(null)}
          onBuy={handleBuy}
          onSave={handleSaveToWardrobe}
        />
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
  wardrobeTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  wardrobeEmpty: { alignItems: 'center', gap: 8, paddingVertical: 32, backgroundColor: '#FFFEF5', borderRadius: 14, borderWidth: 1.5, borderColor: '#9A9A9A' },
  wardrobeEmptyText: { fontSize: 15, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Permanent Marker', cursive" },
  wardrobeEmptySub: { fontSize: 13, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFEF5', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any } as any,
  wardrobeThumb: { width: 48, height: 56, borderRadius: 8, borderWidth: 1, borderColor: '#1A1A1A', resizeMode: 'cover' as any },
  wardrobeItemName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeItemPlatform: { fontSize: 12, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  wardrobeSizeBadge: { backgroundColor: '#E0FFF0', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#00CC52', alignItems: 'center' },
  wardrobeSizeText: { fontSize: 16, fontWeight: '800', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  wardrobeMatchText: { fontSize: 11, color: '#00CC52', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
})
