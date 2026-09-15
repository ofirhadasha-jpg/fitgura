import React, { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Image } from 'react-native'
import { type DeviceIdentificationResult, identifyDevice } from '../types'

const DEV_TYPE_EMOJI: Record<string, string> = { 'טלפון': '📱', 'טאבלט': '📟', 'אוזניות': '🎧', 'שעון': '⌚', 'אחר': '🔧' }

export interface AddDeviceModalProps {
  visible: boolean
  onClose: () => void
  onAdd: (deviceName: string) => void
}

export function AddDeviceModal({ visible, onClose, onAdd }: AddDeviceModalProps) {
  const [addStep, setAddStep] = useState<'options' | 'scanning' | 'result' | 'form'>('options')
  const [scannedAccessories, setScannedAccessories] = useState<string[]>([])
  const [devPhotoUrl, setDevPhotoUrl] = useState<string | null>(null)
  const [addScanProgress, setAddScanProgress] = useState(0)
  const [newDevType, setNewDevType] = useState('טלפון')
  const [newDevBrand, setNewDevBrand] = useState('')
  const [newDevModel, setNewDevModel] = useState('')
  const [newDevExtra, setNewDevExtra] = useState('')
  const [showDevCameraChoice, setShowDevCameraChoice] = useState(false)
  const devCameraInputRef = useRef<HTMLInputElement>(null)
  const devGalleryInputRef = useRef<HTMLInputElement>(null)
  const devScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const devPhotoFileRef = useRef<File | null>(null)

  if (!visible) return null

  function handleClose() {
    resetState()
    onClose()
  }

  function resetState() {
    setAddStep('options')
    setScannedAccessories([])
    if (devPhotoUrl) { URL.revokeObjectURL(devPhotoUrl); setDevPhotoUrl(null) }
    devPhotoFileRef.current = null
    setNewDevBrand(''); setNewDevModel(''); setNewDevExtra(''); setNewDevType('טלפון')
    setShowDevCameraChoice(false)
    setAddScanProgress(0)
    if (devScanTimerRef.current) { clearInterval(devScanTimerRef.current); devScanTimerRef.current = null }
  }

  function handleDevPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (devPhotoUrl) URL.revokeObjectURL(devPhotoUrl)
    setDevPhotoUrl(URL.createObjectURL(file))
    devPhotoFileRef.current = file
    setShowDevCameraChoice(false)
    startDeviceScan()
    runDeviceAI(file)
    e.target.value = ''
  }

  function startDeviceScan() {
    setAddStep('scanning')
    setAddScanProgress(0)
    let p = 0
    devScanTimerRef.current = setInterval(() => {
      p += Math.random() * 8 + 3
      setAddScanProgress(Math.min(p, 90))
    }, 180)
  }

  async function runDeviceAI(file: File) {
    try {
      const result: DeviceIdentificationResult = await identifyDevice(file)
      setNewDevBrand(result.brand)
      setNewDevModel(result.model)
      setNewDevExtra(result.extra)
      setNewDevType(result.device_type)
      setScannedAccessories(result.compatible_accessories)
    } catch {
      setNewDevBrand('')
      setNewDevModel('')
      setNewDevExtra('')
      setScannedAccessories([])
    } finally {
      if (devScanTimerRef.current) {
        clearInterval(devScanTimerRef.current)
        devScanTimerRef.current = null
      }
      setAddScanProgress(100)
      setTimeout(() => setAddStep('result'), 300)
    }
  }

  function confirmAdd() {
    if (!newDevBrand || !newDevModel) return
    const deviceName = `${newDevBrand} ${newDevModel}`.trim()
    onAdd(deviceName)
    resetState()
    onClose()
  }

  return (
    <View style={modalStyles.sheetOverlay}>
      <TouchableOpacity
        onPress={handleClose}
        activeOpacity={1}
        style={modalStyles.sheetBackdrop}
      />
      <View style={modalStyles.sheet}>
        <input ref={devCameraInputRef} type="file" accept="image/*" capture="environment" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none', zIndex: -1 }} onChange={handleDevPhoto} />
        <input ref={devGalleryInputRef} type="file" accept="image/*" style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none', zIndex: -1 }} onChange={handleDevPhoto} />

        <View style={modalStyles.sheetHeaderRow}>
          <Text style={modalStyles.sheetTitle}>הוסף מכשיר</Text>
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.7}
            style={modalStyles.sheetCloseBtn}
          >
            <Text style={{ color: '#4A4A4A', fontSize: 15 }}>✕</Text>
          </TouchableOpacity>
        </View>

        {addStep === 'options' && (
          <View style={{ gap: 12 }}>
            <Text style={modalStyles.sheetDesc}>כיצד תרצה להוסיף את המכשיר?</Text>
            {!showDevCameraChoice ? (
              <TouchableOpacity
                onPress={() => setShowDevCameraChoice(true)}
                activeOpacity={0.8}
                style={modalStyles.scanOptionBtn}
              >
                <Text style={{ fontSize: 28 }}>📷</Text>
                <View>
                  <Text style={modalStyles.scanOptionTitle}>העלה את תמונת המכשיר</Text>
                  <Text style={modalStyles.scanOptionSub}>AI יזהה את המכשיר אוטומטית</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={modalStyles.cameraChoiceBox}>
                <View style={modalStyles.cameraChoiceHeader}>
                  <Text style={{ fontSize: 20 }}>📷</Text>
                  <Text style={modalStyles.cameraChoiceTitle}>בחר מקור תמונה</Text>
                </View>
                <View style={modalStyles.cameraChoiceRow}>
                  <TouchableOpacity onPress={() => devCameraInputRef.current?.click()} activeOpacity={0.7} style={modalStyles.cameraChoiceBtn}>
                    <Text style={{ fontSize: 26 }}>📸</Text>
                    <Text style={modalStyles.cameraChoiceLabel}>מצלמה</Text>
                    <Text style={modalStyles.cameraChoiceSub}>צלם עכשיו</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => devGalleryInputRef.current?.click()} activeOpacity={0.7} style={[modalStyles.cameraChoiceBtn, { borderLeftWidth: 1, borderLeftColor: '#1A1A1A' }]}>
                    <Text style={{ fontSize: 26 }}>🖼️</Text>
                    <Text style={modalStyles.cameraChoiceLabel}>גלריה</Text>
                    <Text style={modalStyles.cameraChoiceSub}>בחר תמונה</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setAddStep('form')}
              activeOpacity={0.8}
              style={modalStyles.manualOptionBtn}
            >
              <Text style={{ fontSize: 28 }}>✏️</Text>
              <View>
                <Text style={modalStyles.manualOptionTitle}>הזן ידנית</Text>
                <Text style={modalStyles.manualOptionSub}>מלא יצרן, דגם, ופרטים</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {addStep === 'scanning' && (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <View style={modalStyles.scanningIconBox}>
              {devPhotoUrl
                ? <Image source={{ uri: devPhotoUrl }} style={modalStyles.scanningPhoto} />
                : <Text style={{ fontSize: 36 }}>📷</Text>}
            </View>
            <Text style={modalStyles.scanningTitle}>AI סורק ומזהה...</Text>
            <Text style={modalStyles.scanningSub}>מנתח את התמונה ושואב פרטי מכשיר מהרשת</Text>
            <View style={modalStyles.scanningBar}>
              <View style={[modalStyles.scanningBarFill, { width: `${addScanProgress}%` }]} />
            </View>
            <Text style={modalStyles.scanningPct}>{Math.round(addScanProgress)}%</Text>
          </View>
        )}

        {addStep === 'result' && (
          <View style={{ gap: 16 }}>
            <View style={modalStyles.resultBox}>
              <View style={modalStyles.resultIconBox}>
                {devPhotoUrl
                  ? <Image source={{ uri: devPhotoUrl }} style={modalStyles.resultPhoto} />
                  : <Text style={{ fontSize: 26 }}>{DEV_TYPE_EMOJI[newDevType] ?? '📱'}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <View style={modalStyles.resultBadgeRow}>
                  <View style={modalStyles.resultBadge}><Text style={modalStyles.resultBadgeText}>✓ זוהה</Text></View>
                </View>
                <Text style={modalStyles.resultDeviceName}>{newDevBrand} {newDevModel}</Text>
                <Text style={modalStyles.resultDeviceExtra}>{newDevExtra}</Text>
              </View>
            </View>
            <View>
              <Text style={modalStyles.accessoriesTitle}>🛍️ אביזרים מומלצים ({scannedAccessories.length})</Text>
              <View style={{ gap: 8 }}>
                {scannedAccessories.map((acc, i) => (
                  <View key={i} style={modalStyles.accessoryRow}>
                    <View style={modalStyles.accessoryIcon}>
                      <Text style={{ fontSize: 14 }}>{['🛡️', '🔍', '✏️', '⌨️', '🔌'][i % 5]}</Text>
                    </View>
                    <Text style={modalStyles.accessoryText}>{acc}</Text>
                    <View style={modalStyles.accessoryAddBtn}><Text style={{ fontSize: 11 }}>+</Text></View>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setAddStep('form')} activeOpacity={0.7} style={modalStyles.editDetailsBtn}>
                <Text style={modalStyles.editDetailsBtnText}>ערוך פרטים</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmAdd} activeOpacity={0.8} style={modalStyles.addDeviceConfirmBtn}>
                <Text style={modalStyles.addDeviceConfirmBtnText}>הוסף למכשירים שלי ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {addStep === 'form' && (
          <View style={{ gap: 14 }}>
            {newDevBrand && (
              <View style={modalStyles.aiDetectedBox}>
                <Text style={{ fontSize: 16 }}>✅</Text>
                <Text style={modalStyles.aiDetectedText}>AI זיהה: {newDevBrand} {newDevModel}</Text>
              </View>
            )}
            <View>
              <Text style={modalStyles.formLabel}>סוג מכשיר</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['טלפון', 'טאבלט', 'אוזניות', 'שעון', 'אחר'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setNewDevType(t)}
                    activeOpacity={0.7}
                    style={[modalStyles.typeBtn, newDevType === t && modalStyles.typeBtnActive]}
                  >
                    <Text style={[modalStyles.typeBtnText, newDevType === t && modalStyles.typeBtnTextActive]}>
                      {DEV_TYPE_EMOJI[t]} {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.formLabel}>יצרן</Text>
                <TextInput value={newDevBrand} onChangeText={setNewDevBrand} placeholder="Apple, Samsung..." style={modalStyles.formInput} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.formLabel}>דגם</Text>
                <TextInput value={newDevModel} onChangeText={setNewDevModel} placeholder="Tab P12, S24..." style={modalStyles.formInput} />
              </View>
            </View>
            <View>
              <Text style={modalStyles.formLabel}>פרטים נוספים (גודל, שנה, שבב...)</Text>
              <TextInput value={newDevExtra} onChangeText={setNewDevExtra} placeholder='12.7" · Snapdragon · 2024' style={modalStyles.formInput} />
            </View>
            <TouchableOpacity
              onPress={confirmAdd}
              disabled={!newDevBrand || !newDevModel}
              activeOpacity={0.8}
              style={[modalStyles.formSubmitBtn, (!newDevBrand || !newDevModel) && modalStyles.formSubmitBtnDisabled]}
            >
              <Text style={modalStyles.formSubmitBtnText}>הוסף למכשירים שלי</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}

const modalStyles = StyleSheet.create({
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 300, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 80 },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.55)' },
  sheet: { backgroundColor: '#FFFEF5', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', padding: 28, maxHeight: '80%', width: '92%', maxWidth: 420, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', backgroundColor: '#F5F0E0', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  sheetDesc: { fontSize: 14, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', borderWidth: 2, borderColor: '#1A1A1A', backgroundColor: '#FFFACC', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  scanOptionTitle: { fontWeight: '700', fontSize: 16, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  scanOptionSub: { fontSize: 13, color: '#4A4A4A', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  cameraChoiceBox: { borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', borderWidth: 2, borderColor: '#1A1A1A', backgroundColor: '#FFFACC', overflow: 'hidden', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  cameraChoiceHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cameraChoiceTitle: { fontWeight: '700', fontSize: 15, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  cameraChoiceRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  cameraChoiceBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  cameraChoiceLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  cameraChoiceSub: { fontSize: 11, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  manualOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  manualOptionTitle: { fontWeight: '700', fontSize: 16, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  manualOptionSub: { fontSize: 13, color: '#9A9A9A', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanningIconBox: { width: 80, height: 80, borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', backgroundColor: '#FFFACC', alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  scanningPhoto: { width: '100%', height: '100%' },
  scanningTitle: { fontWeight: '700', fontSize: 18, color: '#1A1A1A', marginBottom: 6, fontFamily: "'Permanent Marker', cursive" },
  scanningSub: { fontSize: 14, color: '#9A9A9A', marginBottom: 20, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  scanningBar: { height: 8, backgroundColor: '#F5F0E0', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', overflow: 'hidden', width: '100%', borderWidth: 1, borderColor: '#1A1A1A' } as React.CSSProperties,
  scanningBarFill: { height: '100%', backgroundColor: '#00FF66', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px' } as React.CSSProperties,
  scanningPct: { fontSize: 13, color: '#1A1A1A', fontWeight: '700', marginTop: 8, fontFamily: "'Permanent Marker', cursive" },
  resultBox: { backgroundColor: '#E0FFF0', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', padding: 14, borderWidth: 1.5, borderColor: '#00CC52', flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  resultIconBox: { width: 56, height: 56, borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', backgroundColor: '#00FF66', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  resultPhoto: { width: '100%', height: '100%' },
  resultBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  resultBadge: { backgroundColor: '#E0FFF0', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', paddingVertical: 1, paddingHorizontal: 7, borderWidth: 1, borderColor: '#00CC52' } as React.CSSProperties,
  resultBadgeText: { fontSize: 13, fontWeight: '700', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  resultDeviceName: { fontWeight: '700', fontSize: 16, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  resultDeviceExtra: { fontSize: 12, color: '#00CC52', marginTop: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accessoriesTitle: { fontWeight: '700', fontSize: 15, color: '#1A1A1A', marginBottom: 10, fontFamily: "'Permanent Marker', cursive" },
  accessoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFEF5', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', padding: 10, borderWidth: 1, borderColor: '#9A9A9A', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  accessoryIcon: { width: 28, height: 28, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', backgroundColor: '#FFFACC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1A1A1A' } as React.CSSProperties,
  accessoryText: { fontSize: 14, color: '#1A1A1A', flex: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  accessoryAddBtn: { width: 20, height: 20, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', backgroundColor: '#FFE566', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1A1A1A' } as React.CSSProperties,
  editDetailsBtn: { flex: 1, padding: 13, borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5', alignItems: 'center', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  editDetailsBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  addDeviceConfirmBtn: { flex: 2, padding: 13, borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', backgroundColor: '#00FF66', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  addDeviceConfirmBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  aiDetectedBox: { backgroundColor: '#E0FFF0', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#00CC52' } as React.CSSProperties,
  aiDetectedText: { fontSize: 14, color: '#00CC52', fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  formLabel: { fontSize: 13, fontWeight: '700', color: '#4A4A4A', marginBottom: 6, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  formInput: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', borderWidth: 1.5, borderColor: '#9A9A9A', fontSize: 15, backgroundColor: '#FFFEF5', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" } as React.CSSProperties,
  typeBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', borderWidth: 1.5, borderColor: '#9A9A9A', backgroundColor: '#FFFEF5' } as React.CSSProperties,
  typeBtnActive: { borderColor: '#1A1A1A', backgroundColor: '#FFE566' },
  typeBtnText: { fontSize: 14, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  typeBtnTextActive: { color: '#1A1A1A' },
  formSubmitBtn: { padding: 16, borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', backgroundColor: '#00FF66', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  formSubmitBtnDisabled: { backgroundColor: '#F5F0E0' },
  formSubmitBtnText: { color: '#1A1A1A', fontSize: 17, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
})
