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
      {items.map(({ screen, icon, label }) => (
        <TouchableOpacity
          key={screen}
          onPress={() => onNav(screen)}
          style={styles.navItem}
          activeOpacity={0.7}
        >
          <View style={[
            styles.navIconWrap,
            current === screen && styles.navIconActive,
          ]}>
            <Text style={{ fontSize: 20 }}>{icon}</Text>
          </View>
          <Text style={[
            styles.navLabel,
            current === screen && styles.navLabelActive,
          ]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row-reverse',
    backgroundColor: '#FFFEF5',
    borderTopWidth: 1.5,
    borderTopColor: '#1A1A1A',
    paddingTop: 10,
    paddingBottom: 28,
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 50,
  } as React.CSSProperties,
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 6,
  },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconActive: {
    backgroundColor: '#FFFACC',
    borderWidth: 1.5,
    borderColor: '#FFE566',
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#9A9A9A',
    marginTop: 4,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
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
        style={authStyles.backdrop}
      />
      <View style={authStyles.sheet}>
        <View style={authStyles.header}>
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
        </View>

        <View style={authStyles.body}>
          <Text style={authStyles.bodyDesc}>
            התחבר בלחיצה אחת כדי לשמור את תוצאות סריקת ה-AI וה-Wishlist שלך מכל מכשיר.
          </Text>

          {authError && (
            <View style={{ backgroundColor: '#FFF0F0', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', padding: 10, marginBottom: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' }}>
              <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>
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
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 200,
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,26,26,0.6)',
    animation: 'fadeIn 0.2s ease-out both',
  },
  sheet: {
    backgroundColor: '#FFFEF5',
    borderRadius: '3px 14px 5px 12px / 12px 4px 13px 4px',
    overflow: 'hidden',
    width: 340,
    maxHeight: '90%',
    animation: 'popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
    boxShadow: '6px 6px 0 #1A1A1A',
    borderWidth: 2,
    borderColor: '#1A1A1A',
  } as React.CSSProperties,
  header: {
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFE566',
  },
  closeBtn: {
    position: 'absolute',
    top: 16, left: 16,
    width: 32, height: 32,
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    backgroundColor: '#FFFEF5',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeText: { color: '#1A1A1A', fontSize: 16, lineHeight: 16, fontWeight: '700' },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 48, height: 48,
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    backgroundColor: '#FFFEF5',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 24,
    flexShrink: 1,
    fontFamily: "'Permanent Marker', cursive",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  bodyDesc: {
    fontSize: 16,
    color: '#4A4A4A',
    lineHeight: 24,
    marginBottom: 20,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    backgroundColor: '#FFFEF5',
    boxShadow: '3px 3px 0 #1A1A1A',
  },
  googleText: {
    fontWeight: '700',
    fontSize: 16,
    color: '#1A1A1A',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  emailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    backgroundColor: '#00FF66',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #1A1A1A',
  },
  emailBtnText: {
    fontWeight: '700',
    fontSize: 16,
    color: '#1A1A1A',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  emailInput: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#FFFACC',
  },
  emailSubmit: {
    paddingVertical: 15,
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #FFE566',
  },
  emailSubmitDisabled: {
    backgroundColor: '#9A9A9A',
  },
  emailSubmitText: {
    fontWeight: '700',
    fontSize: 16,
    color: '#FFE566',
    fontFamily: "'Permanent Marker', cursive",
  },
  emailBtnDisabled: {
    backgroundColor: '#9A9A9A',
  },
  spinner: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#1A1A1A',
    borderTopColor: '#1A1A1A',
  },
  spinnerWhite: {
    width: 18, height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(255,229,102,0.4)',
    borderTopColor: '#FFE566',
  },
  backText: {
    color: '#6B6B6B',
    fontSize: 15,
    textAlign: 'center',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
  guestBtn: {
    paddingVertical: 14,
    marginTop: 14,
    marginBottom: 28,
    alignItems: 'center',
  },
  guestText: {
    color: '#6B6B6B',
    fontSize: 15,
    textDecorationLine: 'underline',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  },
})
