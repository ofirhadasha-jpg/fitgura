import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native'
import { LinearGradient } from '../components'
import { fetchAliExpressProducts } from '../lib/aliexpress'
import { deviceOptions, detectDevice, type DetectedDevice } from '../types'

export function DeviceDetectionScreen({ onNext, onDetected }: { onNext: () => void; onDetected: (d: DetectedDevice) => void }) {
  const [phase, setPhase] = useState<'detecting' | 'confirmed'>('detecting')
  const [scanPct, setScanPct] = useState(0)
  const [changing, setChanging] = useState(false)
  const [selected, setSelected] = useState(0)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [customBrand, setCustomBrand] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customYear, setCustomYear] = useState('')
  const [detected, setDetected] = useState<DetectedDevice | null>(null)
  const [accessoryCounts, setAccessoryCounts] = useState<{ cases: number; protectors: number; charging: number; total: number } | null>(null)
  const [accessoryLoadError, setAccessoryLoadError] = useState(false)

  const filteredDevices = deviceOptions.filter((d) => {
    const q = deviceSearch.toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q) || d.chip.toLowerCase().includes(q)
  })

  useEffect(() => {
    if (phase !== 'detecting') return
    const d = detectDevice()
    setDetected(d)
    onDetected(d)
    let active = true
    setAccessoryCounts(null)
    setAccessoryLoadError(false)
    const searchKeywords = d.brand === 'Desktop'
      ? `${d.model} laptop case cover sleeve charger stand`
      : `${d.model} case cover screen protector charger cable`
    void fetchAliExpressProducts(searchKeywords, 1, 50, undefined, '5090301,509')
      .then((products) => {
        if (!active) return
        const productNames = products.map((product) => product.name.toLowerCase())
        const cases = productNames.filter((name) => /case|cover|sleeve|pouch|bag|כיסוי/.test(name)).length
        const protectors = productNames.filter((name) => /screen protector|tempered|glass|film|מגן/.test(name)).length
        const charging = productNames.filter((name) => /charger|charging|cable|adapter|dock|power bank|טעינה|מטען/.test(name)).length
        setAccessoryCounts({ cases, protectors, charging, total: products.length })
      })
      .catch(() => {
        if (active) setAccessoryLoadError(true)
      })
    const t = setInterval(() => {
      setScanPct((p) => {
        if (p >= 100) { clearInterval(t); setTimeout(() => setPhase('confirmed'), 300); return 100 }
        return p + 4
      })
    }, 60)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [phase])

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <LinearGradient colors={['#0B1437', '#1A2F7A']} style={devStyles.header}>
        <View style={devStyles.progressRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[devStyles.progressBar, { backgroundColor: i < 2 ? '#2ED573' : (phase === 'confirmed' ? '#2ED573' : '#2E5BFF') }]} />
          ))}
        </View>
        <Text style={devStyles.headerTitle}>
          {phase === 'detecting' ? 'מזהה את המכשיר שלך...' : 'זיהינו את סוג מכשיר הטלפון שלך!'}
        </Text>
        <Text style={devStyles.headerSub}>
          {phase === 'detecting' ? 'AI סורק את פרטי הסביבה שלך' : 'ההתאמה לאביזרים הושלמה אוטומטית'}
        </Text>
      </LinearGradient>

      <ScrollView style={{ flex: 1, padding: 28 }} contentContainerStyle={{ gap: 20 }}>
        {phase === 'detecting' && (
          <View style={{ alignItems: 'center', gap: 28, paddingTop: 20 }}>
            <View style={devStyles.phoneWrap}>
              <View style={[devStyles.phoneGlow, { borderTopColor: '#2E5BFF', borderTopWidth: scanPct * 3.6 }]} />
              <View style={devStyles.phoneBody}>
                <View style={devStyles.scanBeam} />
                <Text style={devStyles.phoneLabel}>
                  {scanPct < 35 ? 'Reading signals...' : scanPct < 70 ? 'Matching model...' : 'Verifying...'}
                </Text>
              </View>
            </View>

            <View style={{ width: '100%' }}>
              <View style={devStyles.progressLabelRow}>
                <Text style={devStyles.progressLabel}>מזהה דגם מכשיר...</Text>
                <Text style={devStyles.progressPct}>{scanPct}%</Text>
              </View>
              <View style={devStyles.progressTrack}>
                <View style={[devStyles.progressFill, { width: `${scanPct}%` }]} />
              </View>
            </View>

            <View style={{ width: '100%', gap: 8 }}>
              {[
                { label: 'קריאת נתוני מכשיר', done: scanPct > 20 },
                { label: 'זיהוי יצרן ודגם', done: scanPct > 50 },
                { label: 'התאמת אביזרים', done: scanPct > 80 },
              ].map(({ label, done }) => (
                <View key={label} style={[devStyles.signalRow, { borderColor: done ? 'rgba(46,213,115,0.4)' : '#F1F5F9' }]}>
                  <View style={[devStyles.signalDot, { backgroundColor: done ? '#2ED573' : '#E2E8F0' }]}>
                    {done && <Text style={{ fontSize: 11, color: '#fff' }}>✓</Text>}
                  </View>
                  <Text style={[devStyles.signalText, { color: done ? '#15803D' : '#94A3B8', fontWeight: done ? '600' : '400' }]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {phase === 'confirmed' && !changing && detected && (
          <View style={{ gap: 20 }}>
            <LinearGradient colors={['#0B1437', '#1E3A8A']} style={devStyles.deviceCard}>
              <View style={devStyles.deviceCardOrb1} />
              <View style={devStyles.deviceCardOrb2} />
              <View style={devStyles.deviceCardContent}>
                <View style={devStyles.phoneIconBox}>
                  <Text style={devStyles.phoneIconText}>{detected.brand.slice(0, 4)}</Text>
                  <View style={devStyles.phoneCheck}><Text style={{ fontSize: 14, color: '#fff' }}>✓</Text></View>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={devStyles.detectedBadge}>
                    <Text style={devStyles.detectedBadgeText}>✓ זוהה אוטומטית · {Math.round(detected.confidence * 100)}% דיוק</Text>
                  </View>
                  <Text style={devStyles.deviceName}>{detected.model}</Text>
                  <Text style={devStyles.deviceChip}>{detected.brand} · {detected.chip} · {detected.year}</Text>
                  <View style={devStyles.deviceTags}>
                    {[
                      detected.screen_size_inches ? `${detected.screen_size_inches}" מסך` : null,
                      detected.camera_layout,
                      'כיסויים',
                      'מגיני מסך',
                    ].filter(Boolean).map((tag) => (
                      <View key={tag!} style={devStyles.deviceTag}><Text style={devStyles.deviceTagText}>{tag}</Text></View>
                    ))}
                  </View>
                </View>
              </View>
            </LinearGradient>

            <View style={devStyles.matchBadge}>
              <View style={devStyles.matchIcon}><Text style={{ fontSize: 22 }}>🛡️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={devStyles.matchTitle}>התאמה מלאה לאביזרי מגן, כיסויים וטעינה</Text>
                <Text style={devStyles.matchSub}>המוצרים מחפשים התאמה ל-{detected.model}</Text>
              </View>
            </View>

            <View style={devStyles.accessoryCard}>
              <Text style={devStyles.accessoryTitle}>אביזרים תואמים שנמצאו:</Text>
              {accessoryCounts ? (
                <View style={devStyles.accessoryRow}>
                  {[
                    { icon: '📱', label: 'כיסויים', count: accessoryCounts.cases },
                    { icon: '🛡️', label: 'מגני מסך', count: accessoryCounts.protectors },
                    { icon: '⚡', label: 'טעינה', count: accessoryCounts.charging },
                  ].map(({ icon, label, count }) => (
                    <View key={label} style={devStyles.accessoryItem}>
                      <Text style={{ fontSize: 22, marginBottom: 4 }}>{icon}</Text>
                      <Text style={devStyles.accessoryCount}>{count}</Text>
                      <Text style={devStyles.accessoryLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={devStyles.accessoryLoading}>
                  {accessoryLoadError ? 'לא ניתן לטעון כרגע את תוצאות האביזרים' : `מחפש אביזרים ל-${detected.model}...`}
                </Text>
              )}
            </View>

            <View style={{ gap: 10 }}>
              <TouchableOpacity onPress={onNext} activeOpacity={0.8} style={devStyles.continueBtn}>
                <Text style={devStyles.continueBtnText}>המשך לפיד ההתאמות</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setChanging(true)} activeOpacity={0.7}>
                <Text style={devStyles.changeBtnText}>החלף מכשיר / דגם אחר</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'confirmed' && changing && (
          <View style={{ gap: 16 }}>
            <Text style={devStyles.manualTitle}>בחר דגם ידנית:</Text>

            {!customMode && (
              <View style={devStyles.searchBox}>
                <Text style={{ fontSize: 16 }}>🔍</Text>
                <TextInput
                  value={deviceSearch}
                  onChangeText={setDeviceSearch}
                  placeholder="חפש לפי שם, יצרן, שבב..."
                  style={devStyles.searchInput}
                />
              </View>
            )}

            {customMode ? (
              <View style={devStyles.customForm}>
                <Text style={devStyles.customFormTitle}>הזן את פרטי המכשיר שלך:</Text>
                <TextInput value={customBrand} onChangeText={setCustomBrand} placeholder="יצרן (Apple, Samsung, Xiaomi...)" style={devStyles.customInput} />
                <TextInput value={customModel} onChangeText={setCustomModel} placeholder="דגם (Galaxy A54, Redmi 12...)" style={devStyles.customInput} />
                <TextInput value={customYear} onChangeText={setCustomYear} placeholder="שנת ייצור (2023, 2024...)" style={devStyles.customInput} />
                <TouchableOpacity onPress={() => setCustomMode(false)} activeOpacity={0.7}>
                  <Text style={devStyles.customBackText}>← חזור לרשימה</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 8, maxHeight: 320 }}>
                {filteredDevices.length === 0 ? (
                  <Text style={devStyles.noResults}>לא נמצאו תוצאות ל-"{deviceSearch}"</Text>
                ) : (
                  filteredDevices.map((d) => {
                    const realIdx = deviceOptions.indexOf(d)
                    return (
                      <TouchableOpacity
                        key={realIdx}
                        onPress={() => { setSelected(realIdx); setCustomMode(false) }}
                        activeOpacity={0.7}
                        style={[devStyles.deviceListItem, { borderColor: selected === realIdx ? '#2E5BFF' : '#E2E8F0', backgroundColor: selected === realIdx ? '#EEF2FF' : '#fff' }]}
                      >
                        <View>
                          <Text style={[devStyles.deviceListItemName, { color: selected === realIdx ? '#2E5BFF' : '#1E293B' }]}>{d.name}</Text>
                          <Text style={devStyles.deviceListItemSub}>{d.brand} · {d.chip} · {d.year}</Text>
                        </View>
                        <View style={[devStyles.deviceListRadio, { borderColor: selected === realIdx ? '#2E5BFF' : '#CBD5E1', backgroundColor: selected === realIdx ? '#2E5BFF' : 'transparent' }]}>
                          {selected === realIdx && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}
                        </View>
                      </TouchableOpacity>
                    )
                  })
                )}
                <TouchableOpacity
                  onPress={() => { setCustomMode(true); setDeviceSearch('') }}
                  activeOpacity={0.7}
                  style={devStyles.notFoundBtn}
                >
                  <Text style={{ fontSize: 18 }}>➕</Text>
                  <View>
                    <Text style={devStyles.notFoundTitle}>המכשיר שלי לא ברשימה</Text>
                    <Text style={devStyles.notFoundSub}>הזן פרטים ידנית</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              onPress={onNext}
              disabled={customMode && (!customBrand || !customModel)}
              activeOpacity={0.8}
              style={[devStyles.confirmDeviceBtn, (customMode && (!customBrand || !customModel)) && devStyles.confirmDeviceBtnDisabled]}
            >
              <Text style={devStyles.confirmDeviceBtnText}>
                {customMode ? `אשר — ${customBrand || 'יצרן'} ${customModel || 'דגם'}` : `אשר את ${deviceOptions[selected].name}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const devStyles = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 24 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  headerTitle: { color: '#fff', fontSize: 21, fontWeight: '700', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  phoneWrap: { width: 140, height: 240, position: 'relative' },
  phoneGlow: { position: 'absolute', top: -20, left: -20, right: -20, bottom: -20, borderRadius: 44, borderTopWidth: 0 },
  phoneBody: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0F172A', borderRadius: 28, borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 },
  scanBeam: { position: 'absolute', left: 0, right: 0, top: '50%', height: 2, backgroundColor: '#2ED573' },
  phoneLabel: { fontSize: 10, color: 'rgba(46,213,115,0.8)', fontWeight: '600' },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  progressPct: { fontSize: 14, fontWeight: '700', color: '#2E5BFF' },
  progressTrack: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#2E5BFF', borderRadius: 4 },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5 },
  signalDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  signalText: { fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deviceCard: { borderRadius: 28, padding: 28, position: 'relative', overflow: 'hidden' },
  deviceCardOrb1: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(46,213,115,0.2)' },
  deviceCardOrb2: { position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(46,91,255,0.3)' },
  deviceCardContent: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  phoneIconBox: { width: 80, height: 130, backgroundColor: '#0F172A', borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10, position: 'relative' },
  phoneIconText: { fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4 },
  phoneCheck: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#2ED573', alignItems: 'center', justifyContent: 'center' },
  detectedBadge: { backgroundColor: 'rgba(46,213,115,0.15)', borderWidth: 1, borderColor: 'rgba(46,213,115,0.35)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start', marginBottom: 10 },
  detectedBadgeText: { fontSize: 11, fontWeight: '700', color: '#2ED573' },
  deviceName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  deviceChip: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 },
  deviceTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  deviceTag: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 9 },
  deviceTagText: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  matchBadge: { backgroundColor: '#F0FFF6', borderWidth: 1.5, borderColor: 'rgba(46,213,115,0.4)', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  matchIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#2ED573', alignItems: 'center', justifyContent: 'center' },
  matchTitle: { fontWeight: '700', fontSize: 14, color: '#15803D', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  matchSub: { fontSize: 12, color: '#16A34A', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  accessoryCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16 },
  accessoryTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 12, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  accessoryRow: { flexDirection: 'row', gap: 10 },
  accessoryItem: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0' },
  accessoryCount: { fontSize: 18, fontWeight: '800', color: '#2E5BFF' },
  accessoryLabel: { fontSize: 11, color: '#94A3B8', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  continueBtn: { padding: 18, borderRadius: 20, backgroundColor: '#2E5BFF', alignItems: 'center' },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  changeBtnText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', textAlign: 'center', textDecorationLine: 'underline', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  manualTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0', paddingVertical: 12, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 14, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  customForm: { gap: 12, backgroundColor: '#EEF2FF', borderRadius: 18, padding: 18, borderWidth: 2, borderColor: '#2E5BFF' },
  customFormTitle: { fontSize: 13, fontWeight: '700', color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  customInput: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#C7D2FE', fontSize: 14, backgroundColor: '#fff', color: '#1E293B' },
  customBackText: { color: '#2E5BFF', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif", textDecorationLine: 'underline' },
  noResults: { textAlign: 'center', paddingVertical: 24, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif", fontSize: 13 },
  deviceListItem: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deviceListItemName: { fontWeight: '600', fontSize: 13 },
  deviceListItemSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  deviceListRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  notFoundBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  notFoundTitle: { fontWeight: '700', color: '#475569', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  notFoundSub: { fontSize: 11, color: '#94A3B8', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  confirmDeviceBtn: { padding: 18, borderRadius: 20, backgroundColor: '#2E5BFF', alignItems: 'center' },
  confirmDeviceBtnDisabled: { backgroundColor: '#E2E8F0' },
  confirmDeviceBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
