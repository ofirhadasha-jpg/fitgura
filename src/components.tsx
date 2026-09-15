import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native'
import type { Screen, User } from './types'
import { supabase } from './lib/supabase'

/* ─── LINEAR GRADIENT HELPER (web fallback) ─────────────────────────────── */

export function LinearGradient({ colors, start, end, style, children }: {
  colors: string[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  style?: any
  children?: React.ReactNode
}) {
  const angle = React.useMemo(() => {
    if (!start || !end) return '145deg'
    const dx = end.x - start.x
    const dy = end.y - start.y
    return `${Math.atan2(dy, dx) * 180 / Math.PI}deg`
  }, [start, end])

  return (
    <View style={[style, { backgroundImage: `linear-gradient(${angle}, ${colors.join(', ')})` }]}>
      {children}
    </View>
  )
}

/* ─── BOTTOM NAV ─────────────────────────────────────────────────────────── */

export function BottomNav({ current, onNav, isAdmin }: { current: Screen; onNav: (s: Screen) => void; isAdmin?: boolean }) {
  const items: { screen: Screen; icon: string; label: string }[] = [
    { screen: 'feed', icon: '🏠', label: 'פיד' },
    { screen: 'events', icon: '🗓️', label: 'אירועים' },
    { screen: 'wishlist', icon: '❤️', label: 'שמורים' },
    ...(isAdmin ? [{ screen: 'admin' as Screen, icon: '⚙️', label: 'ניהול' }] : []),
    { screen: 'profile', icon: '🤖', label: 'פרופיל' },
  ]

  return (
    <View style={styles.bottomNav}>
      {items.map(({ screen, icon, label }) => {
        const active = current === screen
        return (
          <TouchableOpacity
            key={screen}
            onPress={() => onNav(screen)}
            style={styles.navItem}
            activeOpacity={0.6}
          >
            <View style={[
              styles.navIconWrap,
              active && styles.navIconActive,
            ]}>
              <Text style={{ fontSize: 20, opacity: active ? 1 : 0.6 }}>{icon}</Text>
              {active && <View style={styles.navActiveDot} />}
            </View>
            <Text style={[
              styles.navLabel,
              active && styles.navLabelActive,
            ]}>{label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(232,226,213,0.8)',
    paddingTop: 10,
    paddingBottom: 28,
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 50,
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  } as React.CSSProperties,
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 6,
  },
  navIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  } as React.CSSProperties,
  navIconActive: {
    backgroundColor: '#FAF7F0',
  },
  navActiveDot: {
    position: 'absolute',
    bottom: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1A1A1A',
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '400',
    color: '#8B8175',
    marginTop: 4,
    fontFamily: "'Heebo', sans-serif",
  } as React.CSSProperties,
  navLabelActive: {
    fontWeight: '700',
    color: '#1A1A1A',
  },
})

/* ─── AUTH MODAL ─────────────────────────────────────────────────────────── */

export function AuthModal({ onAuth, onDismiss }: { onAuth: (u: User) => void; onDismiss: () => void }) {
  const [emailStep, setEmailStep] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  async function handleGoogleLogin() {
    setLoading(true)
    setAuthError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) {
        setAuthError(error.message)
        setLoading(false)
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google login failed')
      setLoading(false)
    }
  }

  async function handleEmailAuth() {
    if (!email || !password) return
    setLoading(true)
    setAuthError(null)
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) { setAuthError(error.message); setLoading(false); return }
        if (data.user) {
          onAuth({ id: data.user.id, name: email.split('@')[0] || 'משתמש', email, avatar: '✉' })
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { setAuthError(error.message); setLoading(false); return }
        if (data.user) {
          onAuth({ id: data.user.id, name: data.user.email?.split('@')[0] || 'משתמש', email: data.user.email ?? email, avatar: '✉' })
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={authStyles.overlay}>
      <TouchableOpacity
        onPress={onDismiss}
        activeOpacity={1}
        style={[authStyles.backdrop, 'fitgura-backdrop-in']}
      />
      <View style={[authStyles.sheet, 'fitgura-sheet-in']}>
        <LinearGradient colors={['#1A1A1A', '#2A2520']} style={authStyles.header}>
          <View style={authStyles.headerOrb1} />
          <View style={authStyles.headerOrb2} />
          <TouchableOpacity onPress={onDismiss} style={authStyles.closeBtn} activeOpacity={0.7}>
            <Text style={authStyles.closeText}>✕</Text>
          </TouchableOpacity>
          <View style={authStyles.headerContent}>
            <View style={authStyles.headerIcon}>
              <Text style={{ fontSize: 22 }}>❤️</Text>
            </View>
            <Text style={authStyles.headerTitle}>
              שמור את המידות והפריטים המועדפים שלך!
            </Text>
          </View>
        </LinearGradient>

        <View style={authStyles.body}>
          <Text style={authStyles.bodyDesc}>
            התחבר בלחיצה אחת כדי לשמור את תוצאות סריקת ה-AI וה-Wishlist שלך מכל מכשיר.
          </Text>

          {authError && (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1.5, borderColor: '#FECACA' }}>
              <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600', fontFamily: "'Heebo', sans-serif" }}>
                ⚠️ {authError}
              </Text>
            </View>
          )}

          {!emailStep ? (
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={handleGoogleLogin}
                disabled={loading}
                activeOpacity={0.8}
                style={authStyles.googleBtn}
              >
                {loading ? (
                  <View style={authStyles.spinner} />
                ) : (
                  <Text style={{ fontSize: 20 }}>🔵</Text>
                )}
                <Text style={authStyles.googleText}>
                  {loading ? 'מתחבר...' : 'התחבר במהירות עם Google'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setEmailStep(true)}
                disabled={loading}
                activeOpacity={0.8}
                style={authStyles.emailBtn}
              >
                <Text style={{ fontSize: 16 }}>✉️</Text>
                <Text style={authStyles.emailBtnText}>התחבר באמצעות אימייל</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <TextInput
                placeholder="your@email.com"
                value={email}
                onChangeText={setEmail}
                style={authStyles.emailInput}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                placeholder="סיסמה"
                value={password}
                onChangeText={setPassword}
                style={authStyles.emailInput}
                secureTextEntry
              />
              <TouchableOpacity
                onPress={handleEmailAuth}
                disabled={loading || !email || !password}
                activeOpacity={0.8}
                style={[authStyles.emailSubmit, (!email || !password || loading) && authStyles.emailSubmitDisabled]}
              >
                {loading
                  ? <View style={authStyles.spinnerWhite} />
                  : <Text style={authStyles.emailSubmitText}>{isSignUp ? 'הרשמה' : 'כניסה'}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} activeOpacity={0.7}>
                <Text style={authStyles.backText}>{isSignUp ? 'כבר יש לך חשבון? כניסה' : 'אין חשבון? הרשמה'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEmailStep(false)} activeOpacity={0.7}>
                <Text style={authStyles.backText}>← חזור</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={authStyles.guestBtn}>
            <Text style={authStyles.guestText}>המשך כאורח ושמור במכשיר הזה</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const authStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100,
    justifyContent: 'flex-start',
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,26,26,0.6)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  header: {
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  headerOrb1: {
    position: 'absolute',
    top: -30, left: -30,
    width: 120, height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  headerOrb2: {
    position: 'absolute',
    bottom: -20, right: -20,
    width: 80, height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(232,75,53,0.15)',
  },
  closeBtn: {
    position: 'absolute',
    top: 16, left: 16,
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, lineHeight: 16 },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 48, height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 22,
    flexShrink: 1,
    fontFamily: "'Heebo', sans-serif",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  bodyDesc: {
    fontSize: 13,
    color: '#6B6155',
    lineHeight: 21,
    marginBottom: 20,
    fontFamily: "'Heebo', sans-serif",
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E8E2D5',
    backgroundColor: '#fff',
  },
  googleText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#1A1A1A',
    fontFamily: "'Heebo', sans-serif",
  },
  emailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
  },
  emailBtnText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#fff',
    fontFamily: "'Heebo', sans-serif",
  },
  emailInput: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E2D5',
    fontSize: 15,
    color: '#1A1A1A',
    backgroundColor: '#F5F0E6',
  },
  emailSubmit: {
    paddingVertical: 15,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailSubmitDisabled: {
    backgroundColor: '#E8E2D5',
  },
  emailSubmitText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#fff',
    fontFamily: "'Heebo', sans-serif",
  },
  emailBtnDisabled: {
    backgroundColor: '#E8E2D5',
  },
  spinner: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E8E2D5',
    borderTopColor: '#1A1A1A',
  },
  spinnerWhite: {
    width: 18, height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    borderTopColor: '#fff',
  },
  backText: {
    color: '#8B8175',
    fontSize: 13,
    textAlign: 'center',
    fontFamily: "'Heebo', sans-serif",
  },
  guestBtn: {
    paddingVertical: 14,
    marginTop: 14,
    marginBottom: 28,
    alignItems: 'center',
  },
  guestText: {
    color: '#D4C9B5',
    fontSize: 13,
    textDecorationLine: 'underline',
    fontFamily: "'Heebo', sans-serif",
  },
})
