import React from 'react'
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native'

export function SplashScreen({ onNext }: { onNext: () => void }) {
  return (
    <TouchableOpacity
      onPress={onNext}
      activeOpacity={0.96}
      accessibilityRole="button"
      accessibilityLabel="הקש להתחלה"
      style={splashStyles.container}
    >
      <View style={splashStyles.orbTop} />
      <View style={splashStyles.content}>
        <View style={splashStyles.logoMark}>
          <View style={splashStyles.logoLineShort} />
          <View style={splashStyles.logoLineLong} />
        </View>
        <Text style={splashStyles.wordmark}>FITGURA</Text>
        <Text style={splashStyles.tagline}>הסטייל שלך. המידה שלך.</Text>
        <View style={splashStyles.divider} />
        <Text style={splashStyles.instruction}>הקש כדי להתחיל</Text>
      </View>
      <View style={splashStyles.orbBottom} />
    </TouchableOpacity>
  )
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F0E6',
    overflow: 'hidden',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  logoMark: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
    marginBottom: 22,
  },
  logoLineShort: {
    width: 28,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#5CC8A8',
    transform: [{ rotate: '-35deg' }],
    marginLeft: -10,
    marginBottom: 8,
  },
  logoLineLong: {
    width: 42,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F5D547',
    transform: [{ rotate: '-35deg' }],
    marginLeft: 5,
  },
  wordmark: {
    color: '#1A1A1A',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: "'Outfit', sans-serif",
  },
  tagline: {
    color: '#6B6155',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 10,
    fontFamily: "'Heebo', sans-serif",
  },
  divider: {
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E84B35',
    marginTop: 34,
    marginBottom: 18,
  },
  instruction: {
    color: '#8B8175',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: "'Heebo', sans-serif",
  },
  orbTop: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(92, 200, 168, 0.16)',
    top: -110,
    right: -90,
  },
  orbBottom: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(232, 75, 53, 0.08)',
    bottom: -150,
    left: -130,
  },
})
