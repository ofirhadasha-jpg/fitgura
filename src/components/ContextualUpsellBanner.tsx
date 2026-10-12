import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface ContextualUpsellBannerProps {
  accuracy: number
  onTrigger: () => void
  variant?: 'feed' | 'profile'
}

export default function ContextualUpsellBanner({ accuracy, onTrigger, variant = 'feed' }: ContextualUpsellBannerProps) {
  if (accuracy >= 95) return null

  const isFeed = variant === 'feed'

  return (
    <View style={[styles.banner, isFeed ? styles.feedVariant : styles.profileVariant]}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>✨</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>רוצה שהמידות שלך יהיו מדויקות ב-95%+ באופן אוטומטי בלי למדוד כלום? ✨</Text>
        <Text style={styles.subtext}>הורד את אחוז הטעויות במידות בלחיצה אחת דרך הגלריה שלך.</Text>
      </View>
      <TouchableOpacity onPress={onTrigger} activeOpacity={0.8} style={styles.ctaBtn}>
        <Text style={styles.ctaText}>דיוק אוטומטי מהגלריה 📸</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #1A1A1A' as any,
  } as any,
  feedVariant: {
    backgroundColor: '#FFFACC',
    marginHorizontal: 2,
  },
  profileVariant: {
    backgroundColor: '#FFFEF5',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFE566',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 24 },
  textWrap: { flex: 1, gap: 4 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'right',
    lineHeight: 20,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  subtext: {
    fontSize: 13,
    color: '#4A4A4A',
    textAlign: 'right',
    lineHeight: 18,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  ctaBtn: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '2px 2px 0 #FFE566' as any,
    flexShrink: 0,
  } as any,
  ctaText: {
    color: '#FFE566',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: "'Permanent Marker', cursive",
  },
})
