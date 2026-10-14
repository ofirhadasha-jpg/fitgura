import React, { useState, useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native'
import { supabase } from '../lib/supabase'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '@/lib/config'
import { analyzeBodyImage, aiAnalysisToScannedSizes, type ScannedSizes } from '../types'

type Phase = 'loading' | 'error' | 'ready' | 'scanning' | 'success' | 'accepting' | 'accepted' | 'share_error'

interface ProfileInfo {
  success: boolean
  member_name?: string
  category?: string
  gender?: string
  age_group?: string
  error?: string
  isShareLink?: boolean
  grantedProfileIds?: string[]
  sharerName?: string
  avatar_url?: string | null
  date_of_birth?: string | null
  top_size?: string | null
  bottom_size?: string | null
  shoe_size?: string | null
  fit?: string | null
  height_cm?: number | null
  weight_kg?: number | null
  chest_cm?: number | null
  waist_cm?: number | null
  hips_cm?: number | null
  shoulder_cm?: number | null
  accuracy?: number | null
  scan_preview?: string | null
}

export function RemoteUpdateScreen({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [scanProgress, setScanProgress] = useState(0)
  const [scanPhase, setScanPhase] = useState('')
  const [scannedSizes, setScannedSizes] = useState<ScannedSizes | null>(null)
  const [acceptError, setAcceptError] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [submitting, setSubmitting] = useState(false)
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

      const data: ProfileInfo = await res.json()
      if (data.success === false) {
        setErrorMsg(data.error ?? 'Invalid link')
        setPhase('error')
        return
      }

      setProfileInfo(data)
      if (data.date_of_birth) setDateOfBirth(data.date_of_birth)
      if (data.avatar_url) {
        const { data: signed } = await supabase.storage
          .from('profile-photos')
          .createSignedUrl(data.avatar_url, 3600)
        if (signed?.signedUrl) setPhotoUrl(signed.signedUrl)
      } else if (data.scan_preview) {
        setPhotoUrl(data.scan_preview)
      }

      if (data.isShareLink) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setPhase('share_error')
          setAcceptError('כדי לקבל את הפרופילים המשותפים, עליך להתחבר לחשבון הפיטגורה שלך. חזור לאפליקציה, התחבר, ואז פתח שוב את הקישור.')
          return
        }
        await acceptShare(session.access_token)
      } else {
        setPhase('ready')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid or expired link')
      setPhase('error')
    }
  }

  async function acceptShare(accessToken: string) {
    setPhase('accepting')
    try {
      const res = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/profile-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: 'accept', token }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Accept failed')
      }

      const data = await res.json()
      if (data.success === false) {
        throw new Error(data.error ?? 'Accept failed')
      }

      setPhase('accepted')
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'שגיאה בקבלת השיתוף')
      setPhase('share_error')
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setErrorMsg('בחר תמונה עד 10MB')
      setPhase('error')
      setTimeout(() => { if (profileInfo) setPhase('ready') }, 2000)
      return
    }
    if (photoUrl && photoUrl.startsWith('blob:')) URL.revokeObjectURL(photoUrl)
    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
    if (phase === 'error' && profileInfo) setPhase('ready')
  }

  async function handleScanAndSubmit() {
    if (!photoFile || submitting) return
    setSubmitting(true)
    setPhase('scanning')
    setScanProgress(0)
    setScanPhase('מעלה ומנתח תמונה...')

    const progressInterval = setInterval(() => {
      setScanProgress((p) => {
        if (p < 30) { setScanPhase('מעלה תמונה...'); return p + 4 }
        if (p < 70) { setScanPhase('AI מנתח מידות...'); return p + 3 }
        if (p < 95) { setScanPhase('מסנכרן פרופיל...'); return p + 3 }
        clearInterval(progressInterval)
        return p
      })
    }, 80)

    try {
      const { analysis, preview } = await analyzeBodyImage(photoFile)
      const sizes = aiAnalysisToScannedSizes(analysis, preview)
      setScannedSizes(sizes)

      setScanPhase('מסנכרן מידות...')
      setScanProgress(92)

      const profileId = profileInfo?.profile_id
      let avatarPath: string | null = null

      if (profileId) {
        const filePath = `family/${profileId}/avatar.${photoFile.name.split('.').pop() || 'jpg'}`
        const { error: uploadError } = await supabase.storage
          .from('profile-photos')
          .upload(filePath, photoFile, { upsert: true, contentType: photoFile.type })
        if (!uploadError) avatarPath = filePath
      }

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
          dateOfBirth: dateOfBirth || null,
          avatarUrl: avatarPath,
          scanPreview: preview,
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
      setSubmitting(false)
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

  if (phase === 'accepting') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.loadingIcon}>⏳</Text>
          <Text style={styles.loadingText}>מוסיף פרופילים משותפים לחשבון שלך...</Text>
        </View>
      </View>
    )
  }

  if (phase === 'accepted') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.successIconWrap}>
            <Text style={styles.successIcon}>✅</Text>
          </View>
          <Text style={styles.successTitle}>הפרופילים נוספו בהצלחה!</Text>
          <Text style={styles.successBody}>
            {profileInfo?.grantedProfileIds?.length ?? 0} פרופילים משפחתיים נוספו לחשבון שלך. עכשיו תוכל/י לראות את המידות, הארון והיסטוריית הסריקות שלהם.
          </Text>
          <Text style={styles.privacyNote}>חזור לאפליקציית פיטגורה כדי לראות את הפרופילים המשותפים ✨</Text>
        </View>
      </View>
    )
  }

  if (phase === 'share_error') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>לא ניתן לקבל את השיתוף</Text>
          <Text style={styles.errorBody}>{acceptError}</Text>
          {profileInfo?.sharerName && (
            <Text style={styles.errorHint}>הקישור נשלח על ידי: {profileInfo.sharerName}</Text>
          )}
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
          {scannedSizes?.sizing.bodyMetrics?.estimated_height_cm != null && (
            <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>גובה</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.sizing.bodyMetrics.estimated_height_cm} ס"מ</Text></View>
          )}
          {scannedSizes && (
            <View style={styles.sizesSummary}>
              <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>חולצה</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.sizing.top}</Text></View>
              <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>מכנסיים</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.sizing.bottom}</Text></View>
              {scannedSizes.shoeSize && <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>נעליים</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.shoeSize}</Text></View>}
              <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>דיוק</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.confidence}%</Text></View>
            </View>
          )}
          <Text style={styles.privacyNote}>המידות עודכנו בהצלחה! התמונות נשמרות בפרופיל ✨</Text>
        </View>
      </View>
    )
  }

  if (phase === 'scanning') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
          <View style={styles.card}>
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
          </View>
        </ScrollView>
      </View>
    )
  }

  // --- READY: full onboarding form ---
  const categoryEmoji = profileInfo?.category === 'baby' ? '👶' : profileInfo?.category === 'child' ? '🧒' : profileInfo?.category === 'partner' ? '💖' : '💑'
  const hasExistingSizes = !!(profileInfo?.top_size || profileInfo?.bottom_size)

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.appTitle}>פיטגורה</Text>
            <Text style={styles.appSub}>הצטרפות לארון המשפחתי</Text>
          </View>

          <View style={styles.welcomeBanner}>
            <Text style={styles.welcomeEmoji}>{categoryEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.welcomeTitle}>היי {profileInfo?.member_name ?? ''}! 💖</Text>
              <Text style={styles.welcomeText}>הצטרף/י לארון המשפחתי — עדכנ/י את הפרטים שלך</Text>
            </View>
          </View>

          <View style={styles.privacyBanner}>
            <Text style={styles.privacyIcon}>🔒</Text>
            <Text style={styles.privacyText}>
              התמונה והמידות נשמרות בפרופיל המשפחתי. רק בן/בת הזוג יכולים לראות אותן.
            </Text>
          </View>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1, zIndex: -1 }}
            onChange={handlePhotoSelect}
          />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>תמונת פרופיל וסריקה</Text>
            <TouchableOpacity
              onPress={() => fileInputRef.current?.click()}
              activeOpacity={0.8}
              style={styles.photoPicker}
            >
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={{ fontSize: 32 }}>📸</Text>
                  <Text style={styles.photoPlaceholderText}>בחר תמונה מהגלריה או המצלמה</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.photoPickerTitle}>
                  {photoUrl ? 'החלף תמונה' : 'העלה תמונה לסריקת מידות'}
                </Text>
                <Text style={styles.photoPickerSub}>
                  התמונה תשמש לזיהוי מידות AI ותוצג בפרופיל
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>תאריך לידה (אופציונלי)</Text>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              style={styles.dateInput}
            />
          </View>

          {hasExistingSizes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>המידות הנוכחיות</Text>
              <View style={styles.existingSizesRow}>
                {profileInfo?.top_size && <View style={styles.sizeChip}><Text style={styles.sizeChipLabel}>חולצה</Text><Text style={styles.sizeChipValue}>{profileInfo.top_size}</Text></View>}
                {profileInfo?.bottom_size && <View style={styles.sizeChip}><Text style={styles.sizeChipLabel}>מכנסיים</Text><Text style={styles.sizeChipValue}>{profileInfo.bottom_size}</Text></View>}
                {profileInfo?.shoe_size && <View style={styles.sizeChip}><Text style={styles.sizeChipLabel}>נעליים</Text><Text style={styles.sizeChipValue}>{profileInfo.shoe_size}</Text></View>}
                {profileInfo?.fit && <View style={styles.sizeChip}><Text style={styles.sizeChipLabel}>פיט</Text><Text style={styles.sizeChipValue}>{profileInfo.fit}</Text></View>}
              </View>
              <Text style={styles.existingSizesHint}>סרוק תמונה חדשה כדי לעדכן את המידות</Text>
            </View>
          )}

          {scannedSizes && (
            <View style={styles.scannedSizesBox}>
              <Text style={styles.sectionTitle}>המידות שנסרקו</Text>
              <View style={styles.sizesSummary}>
                <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>חולצה</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.sizing.top}</Text></View>
                <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>מכנסיים</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.sizing.bottom}</Text></View>
                {scannedSizes.shoeSize && <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>נעליים</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.shoeSize}</Text></View>}
                <View style={styles.sizeBadge}><Text style={styles.sizeBadgeLabel}>דיוק</Text><Text style={styles.sizeBadgeValue}>{scannedSizes.confidence}%</Text></View>
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={handleScanAndSubmit}
            disabled={!photoFile || submitting}
            activeOpacity={0.8}
            style={[styles.confirmBtn, (!photoFile || submitting) && styles.confirmBtnDisabled]}
          >
            <Text style={styles.confirmBtnText}>
              {submitting ? 'סורק ושומר...' : 'אישור והצטרפות לארון המשפחתי 💖'}
            </Text>
          </TouchableOpacity>

          <View style={styles.instructionsList}>
            <View style={styles.instructionStep}><Text style={styles.stepNum}>1</Text><Text style={styles.stepText}>בחר/י תמונה מהגלריה או המצלמה</Text></View>
            <View style={styles.instructionStep}><Text style={styles.stepNum}>2</Text><Text style={styles.stepText}>ה-AI מנתח את המידות מהתמונה</Text></View>
            <View style={styles.instructionStep}><Text style={styles.stepNum}>3</Text><Text style={styles.stepText}>המידות והתמונה נשמרות בפרופיל המשפחתי</Text></View>
            <View style={styles.instructionStep}><Text style={styles.stepNum}>4</Text><Text style={styles.stepText}>בן/בת הזוג מקבלים הודעה על העדכון ✨</Text></View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFEF5' },
  card: { backgroundColor: '#FFFEF5', borderRadius: 20, padding: 24, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, gap: 16 } as any,
  loadingIcon: { fontSize: 40 },
  loadingText: { fontSize: 16, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  errorIcon: { fontSize: 40, marginBottom: 8 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive", textAlign: 'center' },
  errorBody: { fontSize: 15, color: '#4A4A4A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  errorHint: { fontSize: 13, color: '#9A9A9A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", marginTop: 8 },
  headerRow: { alignItems: 'center', gap: 4 },
  appTitle: { fontSize: 26, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  appSub: { fontSize: 14, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  welcomeBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFACC', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#FFE566' },
  welcomeEmoji: { fontSize: 40 },
  welcomeTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  welcomeText: { fontSize: 14, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", marginTop: 2 },
  privacyBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E0FFF0', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#00CC52' },
  privacyIcon: { fontSize: 22 },
  privacyText: { fontSize: 14, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", flex: 1, lineHeight: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  photoPicker: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5', borderStyle: 'dashed' as any },
  photoPreview: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#1A1A1A' },
  photoPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderText: { fontSize: 10, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  photoPickerTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  photoPickerSub: { fontSize: 11, color: '#6B6B6B', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  dateInput: { padding: '11px 12px', borderRadius: 8, borderWidth: 1.5, borderStyle: 'solid', borderColor: '#9A9A9A', fontSize: 14, backgroundColor: '#FFFEF5', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", width: '100%' } as React.CSSProperties,
  existingSizesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeChip: { backgroundColor: '#F5F0E0', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#9A9A9A', alignItems: 'center' },
  sizeChipLabel: { fontSize: 10, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizeChipValue: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  existingSizesHint: { fontSize: 12, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scannedSizesBox: { backgroundColor: '#E0FFF0', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#00CC52' },
  confirmBtn: { backgroundColor: '#00CC52', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any } as any,
  confirmBtnDisabled: { backgroundColor: '#F5F0E0' },
  confirmBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '800', fontFamily: "'Permanent Marker', cursive", textAlign: 'center' },
  scanningBox: { alignItems: 'center', gap: 12 },
  scanningIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFE566', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1A1A1A' },
  scanningIcon: { fontSize: 32 },
  scanningPhase: { fontSize: 15, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  progressBar: { width: '80%', height: 8, borderRadius: 4, backgroundColor: '#E5E0CC', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00CC52', borderRadius: 4 },
  progressPct: { fontSize: 14, fontWeight: '700', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  instructionsList: { gap: 10 },
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
