import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native'
import type { Screen, User } from './types'

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

export function BottomNav({ current, onNav }: { current: Screen; onNav: (s: Screen) => void }) {
  const items: { screen: Screen; icon: string; label: string }[] = [
    { screen: 'feed', icon: '🏠', label: 'פיד' },
    { screen: 'events', icon: '🗓️', label: 'אירועים' },
    { screen: 'wishlist', icon: '❤️', label: 'שמורים' },
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
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    paddingBottom: 28,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 6,
  },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconActive: {
    backgroundColor: '#EEF2FF',
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '400',
    color: '#94A3B8',
    marginTop: 4,
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
  navLabelActive: {
    fontWeight: '700',
    color: '#2E5BFF',
  },
})

/* ─── AUTH MODAL ─────────────────────────────────────────────────────────── */

export function AuthModal({ onAuth, onDismiss }: { onAuth: (u: User) => void; onDismiss: () => void }) {
  const [emailStep, setEmailStep] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  function mockLogin(via: 'google' | 'email') {
    setLoading(true)
    setTimeout(() => {
      onAuth({
        name: via === 'google' ? 'עופר כהן' : (email.split('@')[0] || 'משתמש'),
        email: via === 'google' ? 'ofer@gmail.com' : email,
        avatar: via === 'google' ? 'G' : '✉',
      })
      setLoading(false)
    }, 1100)
  }

  return (
    <View style={authStyles.overlay}>
      <TouchableOpacity
        onPress={onDismiss}
        activeOpacity={1}
        style={authStyles.backdrop}
      />
      <View style={authStyles.sheet}>
        <LinearGradient colors={['#2E5BFF', '#1A3399']} style={authStyles.header}>
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

          {!emailStep ? (
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={() => mockLogin('google')}
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
              <TouchableOpacity
                onPress={() => email && mockLogin('email')}
                disabled={loading || !email}
                activeOpacity={0.8}
                style={[authStyles.emailSubmit, (!email || loading) && authStyles.emailSubmitDisabled]}
              >
                {loading
                  ? <View style={authStyles.spinnerWhite} />
                  : <Text style={authStyles.emailSubmitText}>כניסה</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEmailStep(false)} activeOpacity={0.7}>
                <Text style={authStyles.backText}>← חזור</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={authStyles.guestBtn}>
            <Text style={authStyles.guestText}>המשך כאורח ללא שמירה</Text>
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
    backgroundColor: 'rgba(11,20,55,0.6)',
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
    backgroundColor: 'rgba(255,107,107,0.15)',
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
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  bodyDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 21,
    marginBottom: 20,
    fontFamily: "'Noto Sans Hebrew', sans-serif",
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
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  googleText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#1E293B',
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
  emailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: '#2E5BFF',
  },
  emailBtnText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#fff',
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
  emailInput: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
  emailSubmit: {
    paddingVertical: 15,
    borderRadius: 18,
    backgroundColor: '#2E5BFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailSubmitDisabled: {
    backgroundColor: '#E2E8F0',
  },
  emailSubmitText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#fff',
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
  emailBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  spinner: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderTopColor: '#2E5BFF',
  },
  spinnerWhite: {
    width: 18, height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    borderTopColor: '#fff',
  },
  backText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
  guestBtn: {
    paddingVertical: 14,
    marginTop: 14,
    marginBottom: 28,
    alignItems: 'center',
  },
  guestText: {
    color: '#CBD5E1',
    fontSize: 13,
    textDecorationLine: 'underline',
    fontFamily: "'Noto Sans Hebrew', sans-serif",
  },
})
