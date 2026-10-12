import React, { useState, useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native'
import { supabase } from '../lib/supabase'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '@/lib/config'
import { analyzeBodyImage, aiAnalysisToScannedSizes, type ScannedSizes } from '../types'

type Phase = 'loading' | 'error' | 'ready' | 'scanning' | 'success'

interface ProfileInfo {
  success: boolean
  member_name?: string
  category?: string
  gender?: string
  age_group?: string
  error?: string
}

export function RemoteUpdateScreen({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [scanProgress, setScanProgress] = useState(0)
  const [scanPhase, setScanPhase] = useState('')
  const [scannedSizes, setScannedSizes] = useState<ScannedSizes | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void verifyToken()
  }, [])

  async function verifyToken() {
    try {
      const res = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/profile-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'verify', token }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Invalid link')
      }

      const data = await res.json()
      if (data.success === false) {
        setErrorMsg(data.error ?? 'Invalid link')
        setPhase('error')
        return
      }

      setProfileInfo(data)
      setPhase('ready')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid or expired link')
      setPhase('error')
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setPhase('scanning')
    setScanProgress(0)
    setScanPhase('מעלה ומנתח תמונה...')

    const progressInterval = setInterval(() => {
      setScanProgress((p) => {
        if (p < 30) { setScanPhase('מעלה תמונה...'); return p + 4 }
        if (p < 70) { setScanPhase('AI מנתח מידות...'); return p + 3 }
        if (p < 95) { setScanPhase('מעדכן פרופיל...'); return p + 3 }
        clearInterval(progressInterval)
        return p
      })
    }, 80)

    try {
      const { analysis, preview } = await analyzeBodyImage(file)
      const sizes = aiAnalysisToScannedSizes(analysis, preview)
      setScannedSizes(sizes)

      setScanPhase('מסנכרן מידות...')
      setScanProgress(92)

      const bm = sizes.sizing.bodyMetrics
      const res = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/profile-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'submit',
          token,
          topSize: sizes.sizing.top,
          bottomSize: sizes.sizing.bottom,
          shoeSize: sizes.shoeSize,
          fit: sizes.sizing.fit,
          heightCm: bm?.estimated_height_cm ?? null,
          weightKg: bm?.estimated_weight_kg ?? null,
          chestCm: bm?.chest_circumference_cm ?? null,
          waistCm: bm?.waist_circumference_cm ?? null,
          hipsCm: bm?.hips_circumference_cm ?? null,
          shoulderCm: bm?.shoulder_width_cm ?? null,
          accuracy: sizes.confidence,
          gender: sizes.gender,
          ageGroup: sizes.ageGroup,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Sync failed')
      }

      const data = await res.json()
      if (data.success === false) {
        throw new Error(data.error ?? 'Sync failed')
      }

      setScanProgress(100)
      setTimeout(() => setPhase('success'), 500)
    } catch (err) {
      clearInterval(progressInterval)
      setErrorMsg(err instanceof Error ? err.message : 'הסריקה נכשלה')
      setPhase('error')
    } finally {
      clearInterval(progressInterval)
    }
  }

  if (phase === 'loading') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.loadingIcon}>⏳</Text>
          <Text style={styles.loadingText}>מאמת את הקישור...</Text>
        </View>
      </View>
    )
  }

  if (phase === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>הקישור לא תקין</Text>
          <Text style={styles.errorBody}>{errorMsg}</Text>
          <Text style={styles.errorHint}>בקש מבן המשפחה ששלח את הקישור ליצור קישור חדש</Text>
        </View>
      </View>
    )
  }

  if (phase === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.successIconWrap}>
            <Text style={styles.successIcon}>✅</Text>
          </View>
          <Text style={styles.successTitle}>המידות עודכנו בהצלחה!</Text>
          <Text style={styles.successBody}>
            המידות של {profileInfo?.member_name ?? 'בן המשפחה'} עודכנו בפרופיל המשפחתי.
          </Text>
          {scannedSizes && (
            <View style={styles.sizesSummary}>
              <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>חולצה</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.sizing.top}</Text></View>
              <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>מכנסיים</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.sizing.bottom}</Text></View>
              {scannedSizes.shoeSize && <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>נעליים</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.shoeSize}</Text></View>}
              <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>דיוק</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.confidence}%</Text></View>
            </View>
          )}
          <Text style={styles.privacyNote}>🔒 התמונות נשארו אצלך בטלפון בלבד. רק המידות נשלחו.</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.appTitle}>פיטגורה</Text>
            <Text style={styles.appSub}>עדכון מידות מרחוק</Text>
          </View>

          <View style={styles.profileBanner}>
            <Text style={styles.profileEmoji}>
              {profileInfo?.category === 'baby' ? '👶' : profileInfo?.category === 'child' ? '🧒' : '💑'}
            </Text>
            <View>
              <Text style={styles.profileName}>{profileInfo?.member_name ?? 'בן משפחה'}</Text>
              <Text style={styles.profileCategory}>
                {profileInfo?.category === 'partner' ? 'פרופיל זוגי' : profileInfo?.category === 'child' ? 'פרופיל ילד/ה' : profileInfo?.category === 'baby' ? 'פרופיל תינוק' : 'פרופיל משפחתי'}
              </Text>
            </View>
          </View>

          <View style={styles.privacyBanner}>
            <Text style={styles.privacyIcon}>🔒</Text>
            <Text style={styles.privacyText}>
              התמונות נשארות אצלך בטלפון בלבד! רק המידות המדוקדקות יעודכנו בפרופיל המשפחתי ✨
            </Text>
          </View>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }}
            onChange={handlePhotoSelect}
          />

          {phase === 'scanning' ? (
            <View style={styles.scanningBox}>
              <View style={styles.scanningIconWrap}>
                <Text style={styles.scanningIcon}>{scanProgress < 30 ? '📤' : scanProgress < 70 ? '🤖' : '✅'}</Text>
              </View>
              <Text style={styles.scanningPhase}>{scanPhase}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressBarFill, { width: `${scanProgress}%` }]} />
              </View>
              <Text style={styles.progressPct}>{Math.round(scanProgress)}%</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => fileInputRef.current?.click()}
              activeOpacity={0.8}
              style={styles.scanBtn}
            >
              <Text style={styles.scanBtnIcon}>📸</Text>
              <Text style={styles.scanBtnText}>צלם / העלה תמונה לעדכון מידות</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.instructionsTitle}>איך זה עובד?</Text>
          <View style={styles.instructionsList}>
            <View style={styles.instructionStep}><Text style={styles.stepNum}>1</Text><Text style={styles.stepText}>צלם תמונה במצב מלא (כמו תמונת פרופיל)</Text></View>
            <View style={styles.instructionStep}><Text style={styles.stepNum}>2</Text><Text style={styles.stepText}>ה-AI מנתח את המידות מקומית על המכשיר שלך</Text></View>
            <View style={styles.instructionStep}><Text style={styles.stepNum}>3</Text><Text style={styles.stepText}>רק המידות (חולצה, מכנסיים, נעליים) נשלחות לפרופיל</Text></View>
            <View style={styles.instructionStep}><Text style={styles.stepNum}>4</Text><Text style={styles.stepText}>התמונות נשארות אצלך — כלום לא מועלה לענן</Text></View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFEF5', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#FFFEF5', borderRadius: 20, padding: 24, width: '90%', maxWidth: 420, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, gap: 16, alignItems: 'center' } as any,
  loadingIcon: { fontSize: 40 },
  loadingText: { fontSize: 16, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  errorIcon: { fontSize: 40, marginBottom: 8 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive", textAlign: 'center' },
  errorBody: { fontSize: 15, color: '#4A4A4A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  errorHint: { fontSize: 13, color: '#9A9A9A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", marginTop: 8 },
  headerRow: { alignItems: 'center', gap: 4 },
  appTitle: { fontSize: 26, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  appSub: { fontSize: 14, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  profileBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFACC', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#FFE566', width: '100%' },
  profileEmoji: { fontSize: 36 },
  profileName: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  profileCategory: { fontSize: 13, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  privacyBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E0FFF0', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#00CC52', width: '100%' },
  privacyIcon: { fontSize: 22 },
  privacyText: { fontSize: 14, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", flex: 1, lineHeight: 20 },
  scanBtn: { backgroundColor: '#00CC52', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any, width: '100%', gap: 6 } as any,
  scanBtnIcon: { fontSize: 28 },
  scanBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', fontFamily: "'Permanent Marker', cursive", textAlign: 'center' },
  scanningBox: { alignItems: 'center', gap: 12, width: '100%' },
  scanningIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFE566', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1A1A1A' },
  scanningIcon: { fontSize: 32 },
  scanningPhase: { fontSize: 15, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  progressBar: { width: '80%', height: 8, borderRadius: 4, backgroundColor: '#E5E0CC', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00CC52', borderRadius: 4 },
  progressPct: { fontSize: 14, fontWeight: '700', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  instructionsTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive", alignSelf: 'flex-start' },
  instructionsList: { gap: 10, width: '100%' },
  instructionStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1A1A1A', color: '#FFE566', textAlign: 'center', textAlignVertical: 'center', fontSize: 13, fontWeight: '800', lineHeight: 26 },
  stepText: { fontSize: 14, color: '#1A1A1A', flex: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  successIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E0FFF0', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#00CC52' },
  successIcon: { fontSize: 36 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive", textAlign: 'center' },
  successBody: { fontSize: 15, color: '#4A4A4A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizesSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  sizeBadge: { backgroundColor: '#FFFACC', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#FFE566', alignItems: 'center' },
  sizeBadgeLabel: { fontSize: 11, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizeBadgeValue: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  privacyNote: { fontSize: 13, color: '#00CC52', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", marginTop: 4 },
})
