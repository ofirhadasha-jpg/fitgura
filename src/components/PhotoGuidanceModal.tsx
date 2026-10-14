import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useEscToDismiss } from '../utils/useEscToDismiss'

type PhotoGuidanceModalProps = {
  visible: boolean
  onContinue: () => void
  onClose: () => void
}

export default function PhotoGuidanceModal({ visible, onContinue, onClose }: PhotoGuidanceModalProps) {
  useEscToDismiss(visible, onClose)

  if (!visible) return null

  return (
    <View style={styles.overlay}>
      <TouchableOpacity onPress={onClose} activeOpacity={1} style={styles.backdrop} />
      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>איך מעלים תמונה לסריקה מדויקת? 📸</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>תמונה ברורה של כל הגוף עוזרת ל-AI לזהות מידות בצורה מדויקת יותר.</Text>

        <View style={styles.mockupRow}>
          <View style={[styles.mockupCard, styles.correctCard]}>
            <Text style={styles.mockupLabel}>מומלץ</Text>
            <View style={styles.mockupScene}>
              <Text style={styles.mockupPerson}>🧍</Text>
              <View style={styles.groundLine} />
            </View>
            <Text style={styles.mockupCaption}>גוף מלא, ישר ומול המצלמה</Text>
          </View>
          <View style={[styles.mockupCard, styles.incorrectCard]}>
            <Text style={styles.mockupLabel}>להימנע</Text>
            <View style={styles.mockupScene}>
              <Text style={styles.mockupPerson}>🚶</Text>
              <Text style={styles.warningMark}>↗</Text>
            </View>
            <Text style={styles.mockupCaption}>זווית חדה או צילום חלקי</Text>
          </View>
        </View>

        <View style={styles.checklist}>
          <Text style={styles.checklistTitle}>שלושה דברים קטנים שעושים הבדל גדול</Text>
          <Text style={styles.checkItem}>📐 לעמוד ישר מול המצלמה במרחק מתאים</Text>
          <Text style={styles.checkItem}>💡 תאורה טובה וללא צללים כבדים</Text>
          <Text style={styles.checkItem}>👕 ביגוד צמוד להשגת דיוק מקסימלי</Text>
        </View>

        <TouchableOpacity onPress={onContinue} activeOpacity={0.8} style={styles.cta}>
          <Text style={styles.ctaText}>הבנתי, בחר תמונה מהגלריה 🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>ביטול</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'center', alignItems: 'center', padding: 16, backdropFilter: 'blur(2px)' } as React.CSSProperties,
  backdrop: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' } as React.CSSProperties,
  sheet: { width: '100%', maxWidth: 430, maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#FFFEF5', borderRadius: 22, padding: 20, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '5px 5px 0 #1A1A1A' as any, display: 'flex', flexDirection: 'column' } as any,
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  title: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '800', color: '#1A1A1A', textAlign: 'right', fontFamily: "'Permanent Marker', cursive" },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E0', borderWidth: 1.5, borderColor: '#1A1A1A' },
  closeText: { fontSize: 14, color: '#1A1A1A', fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 21, color: '#4A4A4A', textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", marginBottom: 14 },
  mockupRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  mockupCard: { flex: 1, borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1.5 },
  correctCard: { backgroundColor: '#E0FFF0', borderColor: '#00CC52' },
  incorrectCard: { backgroundColor: '#FFF0F0', borderColor: '#DC2626' },
  mockupLabel: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  mockupScene: { height: 92, width: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  mockupPerson: { fontSize: 54 },
  groundLine: { position: 'absolute', bottom: 8, width: '70%', height: 3, borderRadius: 2, backgroundColor: '#00CC52' },
  warningMark: { position: 'absolute', top: 8, right: 8, fontSize: 24, color: '#DC2626', fontWeight: '800' },
  mockupCaption: { fontSize: 11, lineHeight: 15, color: '#1A1A1A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  checklist: { backgroundColor: '#FFFACC', borderRadius: 14, padding: 14, gap: 7, borderWidth: 1.5, borderColor: '#FFE566', marginBottom: 14 },
  checklistTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', textAlign: 'right', fontFamily: "'Permanent Marker', cursive", marginBottom: 2 },
  checkItem: { fontSize: 14, lineHeight: 20, color: '#1A1A1A', textAlign: 'right', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  cta: { backgroundColor: '#00CC52', borderRadius: 13, paddingVertical: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any } as any,
  ctaText: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, minHeight: 48, marginTop: 2 },
  cancelText: { fontSize: 13, color: '#6B6B6B', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
})
