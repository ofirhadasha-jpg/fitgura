import React, { useState } from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'

export interface PreviewablePhoto {
  id: string
  url: string
  file: File
}

interface GalleryPreviewModalProps {
  visible: boolean
  photos: PreviewablePhoto[]
  onApprove: (approvedPhotos: PreviewablePhoto[]) => void
  onCancel: () => void
  processing?: boolean
}

export default function GalleryPreviewModal({
  visible,
  photos,
  onApprove,
  onCancel,
  processing = false,
}: GalleryPreviewModalProps) {
  const [removed, setRemoved] = useState<Set<string>>(new Set())

  if (!visible) return null

  const visiblePhotos = photos.filter((p) => !removed.has(p.id))
  const count = visiblePhotos.length

  function toggleRemove(id: string) {
    setRemoved((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleApprove() {
    onApprove(visiblePhotos)
  }

  return (
    <View style={styles.overlay}>
      <TouchableOpacity onPress={() => !processing && onCancel()} activeOpacity={1} style={styles.backdrop} />
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>מצאנו {count} תמונות שמתאימות לניתוח המידות שלך! 📸</Text>
          </View>
          <TouchableOpacity onPress={() => !processing && onCancel()} style={styles.closeBtn}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.privacyNote}>
          אל דאגה, התמונות נשארות אצלך בטלפון. ה-AI רק מציץ, מודד ונעלם 🙈🔒
        </Text>

        <View style={styles.thumbRow}>
          {photos.map((photo) => {
            const isRemoved = removed.has(photo.id)
            return (
              <View key={photo.id} style={[styles.thumbWrap, isRemoved && styles.thumbRemoved]}>
                <Image source={{ uri: photo.url }} style={styles.thumb} />
                <TouchableOpacity
                  onPress={() => toggleRemove(photo.id)}
                  activeOpacity={0.7}
                  style={styles.thumbX}
                >
                  <Text style={styles.thumbXText}>{isRemoved ? '↩' : '×'}</Text>
                </TouchableOpacity>
                {isRemoved && <View style={styles.thumbOverlay}><Text style={styles.thumbOverlayText}>הוסר</Text></View>}
              </View>
            )
          })}
        </View>

        {processing && (
          <View style={styles.processingBox}>
            <Text style={styles.processingText}>DeepSeek AI מנתח את התמונות שאישרת...</Text>
            <View style={styles.processingBar}>
              <View style={styles.processingBarFill} />
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={handleApprove}
            disabled={processing || count === 0}
            activeOpacity={0.8}
            style={[styles.approveBtn, (processing || count === 0) && styles.btnDisabled]}
          >
            <Text style={styles.approveBtnText}>אשר ושלח לדיוק AI ✨</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onCancel}
            disabled={processing}
            activeOpacity={0.7}
            style={[styles.cancelBtn, processing && styles.btnDisabled]}
          >
            <Text style={styles.cancelBtnText}>ביטול / בחירה ידנית</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 380,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,26,26,0.65)',
  },
  panel: {
    backgroundColor: '#FFFEF5',
    borderRadius: 22,
    padding: 20,
    width: '90%',
    maxWidth: 440,
    borderWidth: 2,
    borderColor: '#1A1A1A',
    boxShadow: '4px 4px 0 #1A1A1A' as any,
  } as any,
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'right',
    lineHeight: 22,
    fontFamily: "'Permanent Marker', cursive",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F5F0E0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    flexShrink: 0,
  },
  closeText: { color: '#1A1A1A', fontSize: 22, lineHeight: 22 },
  privacyNote: {
    fontSize: 13,
    color: '#4A4A4A',
    textAlign: 'right',
    marginBottom: 14,
    lineHeight: 18,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    justifyContent: 'center',
  },
  thumbWrap: {
    width: 100,
    height: 120,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    overflow: 'visible' as any,
    position: 'relative' as any,
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    resizeMode: 'cover' as any,
  },
  thumbRemoved: {
    opacity: 0.4,
    borderColor: '#9A9A9A',
  },
  thumbX: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFEF5',
    zIndex: 2,
  },
  thumbXText: { color: '#FFFEF5', fontSize: 16, fontWeight: '700' },
  thumbOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,26,26,0.55)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbOverlayText: { color: '#FFFEF5', fontSize: 12, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  processingBox: {
    backgroundColor: '#E0FFF0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#00CC52',
  },
  processingText: {
    fontSize: 13,
    color: '#1A1A1A',
    textAlign: 'right',
    marginBottom: 8,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  processingBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#F5F0E0',
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  processingBarFill: {
    height: '100%',
    backgroundColor: '#00FF66',
    borderRadius: 4,
  },
  actions: { gap: 10 },
  approveBtn: {
    backgroundColor: '#00CC52',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '2px 2px 0 #1A1A1A' as any,
  } as any,
  approveBtnText: {
    color: '#1A1A1A',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: "'Permanent Marker', cursive",
  },
  cancelBtn: {
    backgroundColor: '#F5F0E0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#9A9A9A',
  },
  cancelBtnText: {
    color: '#4A4A4A',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  btnDisabled: { opacity: 0.5 },
})
