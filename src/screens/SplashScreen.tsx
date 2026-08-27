import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from '../components'

export function SplashScreen({ onNext }: { onNext: () => void }) {
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 1200)
    return () => clearInterval(t)
  }, [])

  return (
    <TouchableOpacity
      onPress={onNext}
      activeOpacity={1}
      style={{ flex: 1 }}
    >
      <LinearGradient
        colors={['#0B1437', '#1A2F7A', '#0B1437']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={splashStyles.container}
      >
        {/* ambient orbs */}
        <View style={[splashStyles.orb, { top: '8%', right: '-15%', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(46,91,255,0.25)' }]} />
        <View style={[splashStyles.orb, { bottom: '12%', left: '-10%', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,107,107,0.18)' }]} />
        <View style={[splashStyles.orb, { top: '38%', left: '10%', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(46,213,115,0.15)' }]} />

        <View style={splashStyles.logoWrap}>
          <View style={splashStyles.logoContainer}>
            <View style={[
              splashStyles.pulseRing,
              { borderColor: pulse ? 'rgba(46,91,255,0.5)' : 'rgba(46,91,255,0.15)' },
            ]} />
            <LinearGradient
              colors={['#2E5BFF', '#1a38c8']}
              style={splashStyles.logoBox}
            >
              <Text style={splashStyles.logoText}>F</Text>
            </LinearGradient>
            <View style={[
              splashStyles.aiDot,
              { shadowColor: '#2ED573', shadowOpacity: pulse ? 0.9 : 0.4 },
            ]} />
          </View>

          <View style={splashStyles.titleWrap}>
            <Text style={splashStyles.title}>Fitgura</Text>
            <View style={splashStyles.subtitleRow}>
              <View style={splashStyles.subtitleLine} />
              <Text style={splashStyles.subtitle}>AI POWERED</Text>
              <View style={splashStyles.subtitleLine} />
            </View>
            <Text style={splashStyles.tagline}>בדיוק מה שחיפשת</Text>
          </View>

          <View style={splashStyles.scanBadge}>
            <View style={[
              splashStyles.scanDot,
              { shadowColor: '#2ED573', shadowOpacity: pulse ? 1 : 0.3 },
            ]} />
            <Text style={splashStyles.scanText}>AI Fit Engine Active</Text>
          </View>
        </View>

        <Text style={splashStyles.tapHint}>הקש להתחיל</Text>
      </LinearGradient>
    </TouchableOpacity>
  )
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
  },
  logoWrap: {
    alignItems: 'center',
    gap: 28,
  },
  logoContainer: {
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    top: -16, left: -16, right: -16, bottom: -16,
    borderRadius: 36,
    borderWidth: 2,
  },
  logoBox: {
    width: 100, height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 46,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 46,
  },
  aiDot: {
    position: 'absolute',
    bottom: -6, right: -6,
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: '#2ED573',
    borderWidth: 3,
    borderColor: '#0B1437',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  titleWrap: {
    alignItems: 'center',
  },
  title: {
    fontSize: 44,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  subtitleLine: {
    width: 30,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 19,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
  scanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(46,213,115,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(46,213,115,0.3)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  scanDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: '#2ED573',
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  scanText: {
    fontSize: 12,
    color: '#2ED573',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tapHint: {
    position: 'absolute',
    bottom: 44,
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
})
