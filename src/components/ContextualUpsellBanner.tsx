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
      <Text style={styles.title}>רוצה שהמידות שלך יהיו מדויקות ב-95%+ באופן אוטומטי בלי למדוד כלום?</Text>
      <TouchableOpacity onPress={onTrigger} activeOpacity={0.8} style={styles.ctaBtn}>
        <Text style={styles.ctaText}>דיוק אוטומטי מהגלריה</Text>
      </TouchableOpacity>
      <Text style={styles.subtext}>הורד את אחוז הטעויות במידות בלחיצה אחת דרך הגלריה שלך.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'relative',
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 20,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '4px 4px 0 #1A1A1A' as any,
  } as any,
  feedVariant: {
    backgroundColor: '#FFFACC',
    marginHorizontal: 2,
  },
  profileVariant: {
    backgroundColor: '#FFFEF5',
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFE566',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '2px 2px 0 #1A1A1A' as any,
  } as any,
  icon: { fontSize: 28 },
  title: {
    width: '100%',
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 28,
    fontFamily: "'Permanent Marker', 'Noto Sans Hebrew', cursive",
  },
  subtext: {
    width: '100%',
    fontSize: 15,
    color: '#5B5B5B',
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  ctaBtn: {
    minWidth: 210,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #FFE566' as any,
  } as any,
  ctaText: {
    color: '#FFE566',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: "'Permanent Marker', 'Noto Sans Hebrew', cursive",
  },
})
