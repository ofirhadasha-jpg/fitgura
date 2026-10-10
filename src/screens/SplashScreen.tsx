import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { supabase } from '../lib/supabase'
import { AuthModal } from '../components'
import type { User } from '../types'

export function SplashScreen({ onNext, onAuth }: { onNext: () => void; onAuth: (user: User) => void }) {
  const [pulse, setPulse] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showEmailAuth, setShowEmailAuth] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 1200)
    return () => clearInterval(t)
  }, [])

  async function handleGoogleLogin() {
    setAuthLoading(true)
    setAuthError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) {
        setAuthError(error.message)
        setAuthLoading(false)
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google login failed')
      setAuthLoading(false)
    }
  }

  return (
    <View style={splashStyles.container}>
      <View style={splashStyles.logoWrap}>
        <View style={splashStyles.logoContainer}>
          <View style={[
            splashStyles.pulseRing,
            { borderColor: pulse ? 'rgba(255,229,102,0.6)' : 'rgba(255,229,102,0.2)' },
          ]} />
          <View style={splashStyles.logoBox}>
            <Text style={splashStyles.logoText}>F</Text>
          </View>
          <View style={[
            splashStyles.aiDot,
            { shadowColor: '#00FF66', shadowOpacity: pulse ? 0.9 : 0.4 },
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
            { shadowColor: '#00FF66', shadowOpacity: pulse ? 1 : 0.3 },
          ]} />
          <Text style={splashStyles.scanText}>AI Fit Engine Active</Text>
        </View>
      </View>

      <View style={splashStyles.authSection}>
        {authError && (
          <View style={splashStyles.authErrorBox}>
            <Text style={splashStyles.authErrorText}>⚠️ {authError}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleGoogleLogin}
          disabled={authLoading}
          activeOpacity={0.8}
          style={splashStyles.googleBtn}
        >
          {authLoading ? (
            <View style={splashStyles.spinner} />
          ) : (
            <Text style={{ fontSize: 20 }}>🔵</Text>
          )}
          <Text style={splashStyles.googleBtnText}>
            {authLoading ? 'מתחבר...' : 'התחבר עם Google'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowEmailAuth(true)}
          disabled={authLoading}
          activeOpacity={0.7}
          style={splashStyles.emailBtn}
        >
          <Text style={splashStyles.emailBtnText}>התחבר עם אימייל</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNext}
          disabled={authLoading}
          activeOpacity={0.7}
          style={splashStyles.guestBtn}
        >
          <Text style={splashStyles.guestBtnText}>המשך כאורח</Text>
        </TouchableOpacity>

        <Text style={splashStyles.guestHint}>
          חוזר? התחבר עם Google כדי לראות את המידות והפריטים השמורים שלך
        </Text>
      </View>

      {showEmailAuth && (
        <AuthModal
          onAuth={(user) => { setShowEmailAuth(false); onAuth(user) }}
          onDismiss={() => setShowEmailAuth(false)}
        />
      )}
    </View>
  )
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFEF5',
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)',
  } as React.CSSProperties,
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
    borderRadius: 14,
    borderWidth: 2,
  },
  logoBox: {
    width: 100, height: 100,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE566',
    borderWidth: 2,
    borderColor: '#1A1A1A',
    boxShadow: '4px 4px 0 #1A1A1A',
  } as React.CSSProperties,
  logoText: {
    fontSize: 48,
    fontFamily: "'Permanent Marker', cursive",
    color: '#1A1A1A',
    lineHeight: 48,
  },
  aiDot: {
    position: 'absolute',
    bottom: -6, right: -6,
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: '#00FF66',
    borderWidth: 3,
    borderColor: '#1A1A1A',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  titleWrap: {
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontFamily: "'Permanent Marker', cursive",
    color: '#1A1A1A',
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
    backgroundColor: '#1A1A1A',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A4A4A',
    letterSpacing: 3,
    fontFamily: "'Permanent Marker', cursive",
  },
  tagline: {
    fontSize: 22,
    fontWeight: '500',
    color: '#2D2D2D',
    textAlign: 'center',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  scanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E0FFF0',
    borderWidth: 1.5,
    borderColor: '#00FF66',
    borderRadius: '10px 10px 10px 2px',
    paddingVertical: 8,
    paddingHorizontal: 16,
    boxShadow: '2px 2px 0 #1A1A1A',
  } as React.CSSProperties,
  scanDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: '#00FF66',
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  scanText: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  authSection: {
    width: '100%',
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 10,
  },
  authErrorBox: {
    backgroundColor: '#FFF0F0',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '2px 2px 0 #1A1A1A',
  } as React.CSSProperties,
  authErrorText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    backgroundColor: '#FFFEF5',
    boxShadow: '3px 3px 0 #1A1A1A',
  } as React.CSSProperties,
  googleBtnText: {
    fontWeight: '700',
    fontSize: 16,
    color: '#1A1A1A',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  emailBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFACC',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
  } as React.CSSProperties,
  emailBtnText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#1A1A1A',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  guestBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00FF66',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #1A1A1A',
  } as React.CSSProperties,
  guestBtnText: {
    fontWeight: '700',
    fontSize: 16,
    color: '#1A1A1A',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  guestHint: {
    fontSize: 14,
    color: '#6B6B6B',
    textAlign: 'center',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
    lineHeight: 20,
  },
  spinner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#1A1A1A',
    borderTopColor: 'transparent',
  },
})
