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
        <input ref={devCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleDevPhoto} />
        <input ref={devGalleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleDevPhoto} />

        <View style={modalStyles.sheetHeaderRow}>
          <Text style={modalStyles.sheetTitle}>הוסף מכשיר</Text>
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.7}
            style={modalStyles.sheetCloseBtn}
          >
            <Text style={{ color: '#64748B', fontSize: 15 }}>✕</Text>
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
                  <TouchableOpacity onPress={() => devGalleryInputRef.current?.click()} activeOpacity={0.7} style={[modalStyles.cameraChoiceBtn, { borderLeftWidth: 1, borderLeftColor: 'rgba(46,91,255,0.15)' }]}>
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
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,20,55,0.55)' },
  sheet: { backgroundColor: '#fff', borderRadius: 24, padding: 28, maxHeight: '80%', width: '92%', maxWidth: 420, boxShadow: '0 8px 30px rgba(0,0,0,0.18)' },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  sheetDesc: { fontSize: 13, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: 18, borderWidth: 2, borderColor: '#2E5BFF', backgroundColor: '#EEF2FF' },
  scanOptionTitle: { fontWeight: '700', fontSize: 15, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanOptionSub: { fontSize: 12, color: '#64748B', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  cameraChoiceBox: { borderRadius: 18, borderWidth: 2, borderColor: '#2E5BFF', backgroundColor: '#EEF2FF', overflow: 'hidden' },
  cameraChoiceHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cameraChoiceTitle: { fontWeight: '700', fontSize: 14, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  cameraChoiceRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(46,91,255,0.15)' },
  cameraChoiceBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  cameraChoiceLabel: { fontSize: 12, fontWeight: '700', color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  cameraChoiceSub: { fontSize: 10, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  manualOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: 18, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  manualOptionTitle: { fontWeight: '700', fontSize: 15, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  manualOptionSub: { fontSize: 12, color: '#94A3B8', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanningIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden' },
  scanningPhoto: { width: '100%', height: '100%' },
  scanningTitle: { fontWeight: '700', fontSize: 17, color: '#1E293B', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanningSub: { fontSize: 13, color: '#94A3B8', marginBottom: 20, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  scanningBar: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', width: '100%' },
  scanningBarFill: { height: '100%', backgroundColor: '#2E5BFF', borderRadius: 4 },
  scanningPct: { fontSize: 12, color: '#2E5BFF', fontWeight: '700', marginTop: 8 },
  resultBox: { backgroundColor: '#F0FFF6', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: 'rgba(46,213,115,0.35)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultIconBox: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#2ED573', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(46,213,115,0.4)' },
  resultPhoto: { width: '100%', height: '100%' },
  resultBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  resultBadge: { backgroundColor: '#BBF7D0', borderRadius: 6, paddingVertical: 1, paddingHorizontal: 7 },
  resultBadgeText: { fontSize: 12, fontWeight: '700', color: '#15803D' },
  resultDeviceName: { fontWeight: '700', fontSize: 15, color: '#166534' },
  resultDeviceExtra: { fontSize: 11, color: '#16A34A', marginTop: 1 },
  accessoriesTitle: { fontWeight: '700', fontSize: 14, color: '#1E293B', marginBottom: 10, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  accessoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  accessoryIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  accessoryText: { fontSize: 13, color: '#374151', flex: 1, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  accessoryAddBtn: { width: 20, height: 20, borderRadius: 6, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  editDetailsBtn: { flex: 1, padding: 13, borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', alignItems: 'center' },
  editDetailsBtnText: { color: '#475569', fontSize: 14, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  addDeviceConfirmBtn: { flex: 2, padding: 13, borderRadius: 14, backgroundColor: '#2E5BFF', alignItems: 'center' },
  addDeviceConfirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  aiDetectedBox: { backgroundColor: '#F0FFF6', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(46,213,115,0.3)' },
  aiDetectedText: { fontSize: 13, color: '#15803D', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  formLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  formInput: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', fontSize: 14, backgroundColor: '#F8FAFC', color: '#1E293B' },
  typeBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  typeBtnActive: { borderColor: '#2E5BFF', backgroundColor: '#EEF2FF' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#475569', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  typeBtnTextActive: { color: '#2E5BFF' },
  formSubmitBtn: { padding: 16, borderRadius: 18, backgroundColor: '#2E5BFF', alignItems: 'center' },
  formSubmitBtnDisabled: { backgroundColor: '#E2E8F0' },
  formSubmitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
