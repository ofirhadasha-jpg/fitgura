import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native'
// LinearGradient removed for sketch theme
import { fetchAliExpressProducts } from '../lib/aliexpress'
import { deviceOptions, detectDevice, type DetectedDevice } from '../types'

interface AccessoryCategory {
  icon: string
  label: string
  examples: string
  count: number
}

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
  const [accessoryCounts, setAccessoryCounts] = useState<AccessoryCategory[] | null>(null)
  const [accessoryLoadError, setAccessoryLoadError] = useState(false)
  const [beamY, setBeamY] = useState(0)

  useEffect(() => {
    if (phase !== 'detecting') return
    const t = setInterval(() => setBeamY((y) => (y + 2) % 100), 30)
    return () => clearInterval(t)
  }, [phase])

  const filteredDevices = deviceOptions.filter((d) => {
    const q = deviceSearch.toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q) || d.chip.toLowerCase().includes(q)
  })

  useEffect(() => {
    if (phase !== 'detecting') return
    let active = true
    void detectDevice().then((d) => {
      if (!active) return
      setDetected(d)
      onDetected(d)
      setAccessoryCounts(null)
      setAccessoryLoadError(false)
      const searchKeywords = d.brand === 'Desktop'
        ? `${d.model} laptop case cover sleeve charger stand cable adapter dock`
        : `${d.model} case cover screen protector tempered glass charger cable adapter dock power bank earphones holder mount`
      void fetchAliExpressProducts(searchKeywords, 1, 50, undefined, '5090301,509')
        .then((products) => {
          if (!active) return
          const productNames = products.map((product) => product.name.toLowerCase())
          const categories: AccessoryCategory[] = [
            { icon: '📱', label: 'כיסויים', examples: 'סיליקון, פאייפ, עור, שקוף', count: productNames.filter((name) => /case|cover|כיסוי/.test(name)).length },
            { icon: '🛡️', label: 'מגני מסך', examples: 'זכוכית מחוסמת, פילם, מגן פרטיות', count: productNames.filter((name) => /screen protector|tempered|glass|film|מגן/.test(name)).length },
            { icon: '🔌', label: 'כבלי טעינה', examples: 'USB-C, Lightning, מיקרו-USB', count: productNames.filter((name) => /cable|כבל/.test(name)).length },
            { icon: '⚡', label: 'מטענים', examples: 'מטען קיר, אלחוטי, מהיר', count: productNames.filter((name) => /charger|charging|מטען|טעינה/.test(name)).length },
            { icon: '🔋', label: 'סוללות ניידות', examples: 'Power Bank, מטען נייד', count: productNames.filter((name) => /power bank|powerbank|סוללה/.test(name)).length },
            { icon: '🎵', label: 'אוזניות', examples: 'אלחוטיות, חוטיות, אינ-אר', count: productNames.filter((name) => /earphone|earbud|headphone|אוזני/.test(name)).length },
            { icon: '🔗', label: 'מתאמים וחיבורים', examples: 'USB-C ל-USB, AUX, HDMI', count: productNames.filter((name) => /adapter|connector|hub|מתאם/.test(name)).length },
            { icon: '🚗', label: 'מחזיקים ומתקנים', examples: 'לרכב, לשולחן, מעמד', count: productNames.filter((name) => /holder|mount|stand|dock|מחזיק|מעמד/.test(name)).length },
          ].filter((cat) => cat.count > 0)
          setAccessoryCounts(categories.length > 0 ? categories : null)
        })
        .catch(() => {
          if (active) setAccessoryLoadError(true)
        })
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
    <View style={{ flex: 1, backgroundColor: '#FFFEF5', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)' } as React.CSSProperties}>
      <View style={devStyles.header}>
        <View style={devStyles.progressRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[devStyles.progressBar, { backgroundColor: i < 2 ? '#00FF66' : (phase === 'confirmed' ? '#00FF66' : '#FFE566') }]} />
          ))}
        </View>
        <Text style={devStyles.headerTitle}>
          {phase === 'detecting' ? 'מזהה את המכשיר שלך...' : 'זיהינו את סוג מכשיר הטלפון שלך!'}
        </Text>
        <Text style={devStyles.headerSub}>
          {phase === 'detecting' ? 'AI סורק את פרטי הסביבה שלך' : 'ההתאמה לאביזרים הושלמה אוטומטית'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 28 }} contentContainerStyle={{ gap: 20 }}>
        {phase === 'detecting' && (
          <View style={{ alignItems: 'center', gap: 28, paddingTop: 20 }}>
            <View style={devStyles.phoneWrap}>
              <View style={[devStyles.phoneProgressBorder, { opacity: scanPct / 100 }]} />
              <View style={devStyles.phoneBody}>
                <View style={[devStyles.scanBeam, { top: `${beamY}%` }]} />
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
                  <View style={[devStyles.signalDot, { backgroundColor: done ? '#00FF66' : '#F5F0E0' }]}>
                    {done && <Text style={{ fontSize: 11, color: '#fff' }}>✓</Text>}
                  </View>
                  <Text style={[devStyles.signalText, { color: done ? '#00CC52' : '#9A9A9A', fontWeight: done ? '600' : '400' }]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {phase === 'confirmed' && !changing && detected && (
          <View style={{ gap: 20 }}>
            <View style={devStyles.deviceCard}>
              <View style={devStyles.deviceCardContent}>
                <View style={devStyles.phoneIconBox}>
                  <Text style={devStyles.phoneIconText}>{detected.brand.slice(0, 4)}</Text>
                  <View style={devStyles.phoneCheck}><Text style={{ fontSize: 14, color: '#1A1A1A' }}>✓</Text></View>
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
                      'מגני מסך',
                      'כבלים',
                      'מטענים',
                    ].filter(Boolean).map((tag) => (
                      <View key={tag!} style={devStyles.deviceTag}><Text style={devStyles.deviceTagText}>{tag}</Text></View>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            <View style={devStyles.matchBadge}>
              <View style={devStyles.matchIcon}><Text style={{ fontSize: 22 }}>🛡️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={devStyles.matchTitle}>התאמה מלאה לאביזרי מגן, כיסויים וטעינה</Text>
                <Text style={devStyles.matchSub}>המוצרים מחפשים התאמה ל-{detected.model}</Text>
              </View>
            </View>

            <View style={devStyles.accessoryCard}>
              <Text style={devStyles.accessoryTitle}>אביזרים תואמים שנמצאו ל-{detected.model}:</Text>
              {accessoryCounts ? (
                <View style={devStyles.accessoryList}>
                  {accessoryCounts.map(({ icon, label, examples, count }) => (
                    <View key={label} style={devStyles.accessoryItemRow}>
                      <View style={devStyles.accessoryIconBox}><Text style={{ fontSize: 18 }}>{icon}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={devStyles.accessoryItemLabel}>{label}</Text>
                        <Text style={devStyles.accessoryItemExamples}>{examples}</Text>
                      </View>
                      <View style={devStyles.accessoryCountBadge}><Text style={devStyles.accessoryCountText}>{count}</Text></View>
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
                        style={[devStyles.deviceListItem, { borderColor: selected === realIdx ? '#FFE566' : '#9A9A9A', backgroundColor: selected === realIdx ? '#FFFACC' : '#FFFEF5' }]}
                      >
                        <View>
                          <Text style={[devStyles.deviceListItemName, { color: selected === realIdx ? '#1A1A1A' : '#1A1A1A' }]}>{d.name}</Text>
                          <Text style={devStyles.deviceListItemSub}>{d.brand} · {d.chip} · {d.year}</Text>
                        </View>
                        <View style={[devStyles.deviceListRadio, { borderColor: selected === realIdx ? '#1A1A1A' : '#9A9A9A', backgroundColor: selected === realIdx ? '#FFE566' : 'transparent' }]}>
                          {selected === realIdx && <Text style={{ color: '#1A1A1A', fontSize: 10 }}>✓</Text>}
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
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 24, backgroundColor: '#FFE566', borderBottomWidth: 1.5, borderBottomColor: '#1A1A1A' },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  headerTitle: { color: '#1A1A1A', fontSize: 21, fontWeight: '700', marginBottom: 6, fontFamily: "'Permanent Marker', cursive" },
  headerSub: { color: '#4A4A4A', fontSize: 16, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  phoneWrap: { width: 140, height: 240, position: 'relative' },
  phoneBody: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1.5, borderColor: '#1A1A1A', overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 },
  phoneProgressBorder: { position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: 12, borderWidth: 2, borderColor: '#FFE566', opacity: 0.5 },
  scanBeam: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: '#00FF66', shadowColor: '#00FF66', shadowRadius: 16, shadowOpacity: 0.6 },
  phoneLabel: { fontSize: 12, color: 'rgba(0,255,102,0.8)', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  progressPct: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  progressTrack: { height: 8, backgroundColor: '#F5F0E0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFE566', borderRadius: 4 },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFEF5', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  signalDot: { width: 20, height: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1A1A1A' },
  signalText: { fontSize: 15, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deviceCard: { borderRadius: 12, padding: 28, position: 'relative', overflow: 'hidden', backgroundColor: '#1A1A1A', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #FFE566' } as React.CSSProperties,
  deviceCardContent: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  phoneIconBox: { width: 80, height: 130, backgroundColor: '#2D2D2D', borderRadius: 8, borderWidth: 1.5, borderColor: '#FFE566', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10, position: 'relative' },
  phoneIconText: { fontSize: 10, color: 'rgba(255,229,102,0.4)', marginBottom: 4, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  phoneCheck: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#00FF66', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  detectedBadge: { backgroundColor: 'rgba(0,255,102,0.15)', borderWidth: 1, borderColor: 'rgba(0,255,102,0.35)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start', marginBottom: 10 },
  detectedBadgeText: { fontSize: 12, fontWeight: '700', color: '#00FF66', fontFamily: "'Permanent Marker', cursive" },
  deviceName: { fontSize: 22, fontWeight: '700', color: '#FFE566', marginBottom: 4, fontFamily: "'Permanent Marker', cursive" },
  deviceChip: { fontSize: 14, color: 'rgba(255,229,102,0.5)', marginBottom: 12, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deviceTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  deviceTag: { backgroundColor: 'rgba(255,229,102,0.08)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9, borderWidth: 1, borderColor: 'rgba(255,229,102,0.2)' },
  deviceTagText: { fontSize: 13, color: 'rgba(255,229,102,0.65)', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  matchBadge: { backgroundColor: '#E0FFF0', borderWidth: 1.5, borderColor: '#00FF66', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  matchIcon: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#00FF66', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  matchTitle: { fontWeight: '700', fontSize: 15, color: '#00CC52', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  matchSub: { fontSize: 14, color: '#00CC52', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accessoryCard: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  accessoryTitle: { fontSize: 15, fontWeight: '700', color: '#4A4A4A', marginBottom: 12, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accessoryList: { gap: 10 },
  accessoryItemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFACC', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#FFE566' },
  accessoryIconBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFFEF5', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  accessoryItemLabel: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accessoryItemExamples: { fontSize: 12, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accessoryCountBadge: { backgroundColor: '#FFE566', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, minWidth: 32, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' },
  accessoryCountText: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  accessoryLoading: { fontSize: 15, color: '#9A9A9A', textAlign: 'center', paddingVertical: 16, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  continueBtn: { padding: 18, borderRadius: 12, backgroundColor: '#00FF66', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  continueBtnText: { color: '#1A1A1A', fontSize: 17, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  changeBtnText: { color: '#6B6B6B', fontSize: 15, fontWeight: '600', textAlign: 'center', textDecorationLine: 'underline', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  manualTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFACC', borderRadius: 8, borderWidth: 1.5, borderColor: '#1A1A1A', paddingVertical: 12, paddingHorizontal: 14, boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  customForm: { gap: 12, backgroundColor: '#FFFACC', borderRadius: 12, padding: 18, borderWidth: 1.5, borderColor: '#FFE566', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  customFormTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  customInput: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1.5, borderColor: '#1A1A1A', fontSize: 15, backgroundColor: '#FFFEF5', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  customBackText: { color: '#4A4A4A', fontSize: 15, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textDecorationLine: 'underline' },
  noResults: { textAlign: 'center', paddingVertical: 24, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", fontSize: 15 },
  deviceListItem: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  deviceListItemName: { fontWeight: '600', fontSize: 15, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deviceListItemSub: { fontSize: 13, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  deviceListRadio: { width: 20, height: 20, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  notFoundBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9A9A9A', backgroundColor: '#F5F0E0', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  notFoundTitle: { fontWeight: '700', color: '#4A4A4A', fontSize: 15, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  notFoundSub: { fontSize: 13, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  confirmDeviceBtn: { padding: 18, borderRadius: 12, backgroundColor: '#00FF66', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  confirmDeviceBtnDisabled: { backgroundColor: '#F5F0E0' },
  confirmDeviceBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
})
