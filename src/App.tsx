import { useState, useEffect, Component, type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { Screen, User, DetectedDevice, ScannedSizes, ScanEntry, GalleryAccessState, Product } from './types'
import { AuthModal } from './components'
import { supabase } from './lib/supabase'
import { SplashScreen } from './screens/SplashScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { DeviceDetectionScreen } from './screens/DeviceDetectionScreen'
import { FeedScreen } from './screens/FeedScreen'
import { EventsScreen } from './screens/EventsScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { WishlistScreen } from './screens/WishlistScreen'

const GUEST_PROFILE_KEY = 'fitgura_guest_profile'
const GUEST_FAVORITES_KEY = 'fitgura_guest_favorites'

interface GuestProfile {
  gender: 'male' | 'female' | 'unisex'
  chest: number | null
  waist: number | null
  hips: number | null
  shoulder: number | null
  height: number | null
  weight: number | null
}

function saveGuestProfile(sizes: ScannedSizes | null) {
  if (!sizes) return
  const profile: GuestProfile = {
    gender: sizes.gender ?? 'unisex',
    chest: sizes.sizing.bodyMetrics?.chest_circumference_cm ?? null,
    waist: sizes.sizing.bodyMetrics?.waist_circumference_cm ?? null,
    hips: sizes.sizing.bodyMetrics?.hips_circumference_cm ?? null,
    shoulder: sizes.sizing.bodyMetrics?.shoulder_width_cm ?? null,
    height: sizes.sizing.bodyMetrics?.estimated_height_cm ?? null,
    weight: sizes.sizing.bodyMetrics?.estimated_weight_kg ?? null,
  }
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile))
}

function saveGuestFavorites(items: number[], catalog: Product[]) {
  const favorites = items.map((idx) => ({
    productId: String(idx),
    productName: catalog[idx]?.name ?? '',
  }))
  localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(favorites))
}

function loadGuestProfile(): GuestProfile | null {
  const raw = localStorage.getItem(GUEST_PROFILE_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as GuestProfile } catch { return null }
}

function loadGuestFavorites(): { productId: string; productName: string }[] {
  const raw = localStorage.getItem(GUEST_FAVORITES_KEY)
  if (!raw) return []
  try { return JSON.parse(raw) as { productId: string; productName: string }[] } catch { return [] }
}

function clearGuestData() {
  localStorage.removeItem(GUEST_PROFILE_KEY)
  localStorage.removeItem(GUEST_FAVORITES_KEY)
}

async function migrateGuestData(userId: string) {
  const guestProfile = loadGuestProfile()
  const guestFavorites = loadGuestFavorites()

  if (guestProfile) {
    await supabase.from('profiles').upsert({
      user_id: userId,
      gender: guestProfile.gender,
      chest_cm: guestProfile.chest,
      waist_cm: guestProfile.waist,
      hips_cm: guestProfile.hips,
      shoulder_cm: guestProfile.shoulder,
      height_cm: guestProfile.height,
      weight_kg: guestProfile.weight,
    })
  }

  if (guestFavorites.length > 0) {
    const rows = guestFavorites.map((f) => ({
      user_id: userId,
      product_id: f.productId,
      product_name: f.productName,
    }))
    await supabase.from('favorites').insert(rows)
  }

  clearGuestData()
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: unknown) { console.error('App crash caught:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#1E293B' }}>משהו השתבש</Text>
          <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center' }}>אירעה שגיאה. אנא רענן את העמוד.</Text>
        </View>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const saved = sessionStorage.getItem('fitgura_screen')
    return (saved === 'onboarding' || saved === 'device') ? saved : 'splash'
  })
  const [wishlistItems, setWishlistItems] = useState<number[]>([])
  const [budget, setBudget] = useState<[number, number]>([50, 500])
  const [user, setUser] = useState<User | null>(null)
  const [authModal, setAuthModal] = useState<{ pendingIdx: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [detectedDevice, setDetectedDevice] = useState<DetectedDevice | null>(null)
  const [scannedSizes, setScannedSizes] = useState<ScannedSizes | null>(null)
  const [scanGallery, setScanGallery] = useState<ScanEntry[]>([])
  const [galleryAccess, setGalleryAccess] = useState<GalleryAccessState>('pending')

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'SIGNED_IN' && session?.user) {
          await migrateGuestData(session.user.id)
        }
        if (session?.user) {
          const u = session.user
          setUser({
            name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'משתמש',
            email: u.email ?? '',
            avatar: u.user_metadata?.avatar_url ? 'G' : '✉',
          })
        } else {
          setUser(null)
        }
      })()
    })
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
    showToast('התנתקת בהצלחה')
  }

  function changeScreen(s: Screen) {
    if (s === 'onboarding' || s === 'device') sessionStorage.setItem('fitgura_screen', s)
    else sessionStorage.removeItem('fitgura_screen')
    setScreen(s)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3200)
  }

  function handleWishlistToggle(idx: number) {
    if (wishlistItems.includes(idx)) {
      setWishlistItems((prev) => prev.filter((x) => x !== idx))
      return
    }
    if (!user) {
      setAuthModal({ pendingIdx: idx })
    } else {
      setWishlistItems((prev) => [...prev, idx])
    }
  }

  useEffect(() => {
    if (!user) saveGuestFavorites(wishlistItems, [])
  }, [wishlistItems, user])

  function handleAuth(loggedInUser: User) {
    setUser(loggedInUser)
    if (authModal) {
      setWishlistItems((prev) => [...prev, authModal.pendingIdx])
      showToast('הפריט נשמר ב-Wishlist שלך! 💚')
    }
    setAuthModal(null)
  }

  useEffect(() => {
    if (!user) saveGuestProfile(scannedSizes)
  }, [scannedSizes, user])

  return (
    <ErrorBoundary>
    <View style={styles.outer}>
      <View style={styles.phoneFrame}>
        {screen === 'splash' && <SplashScreen onNext={() => changeScreen('onboarding')} />}
        {screen === 'onboarding' && <OnboardingScreen onNext={() => changeScreen('device')} onScanned={setScannedSizes} onGalleryAdd={setScanGallery} onGalleryAccess={(granted) => setGalleryAccess(granted ? 'granted' : 'denied')} />}
        {screen === 'device' && <DeviceDetectionScreen onNext={() => changeScreen('feed')} onDetected={setDetectedDevice} />}
        {screen === 'feed' && <FeedScreen wishlistItems={wishlistItems} onToggleWishlist={handleWishlistToggle} onNav={changeScreen} budget={budget} setBudget={setBudget} user={user} scannedSizes={scannedSizes} />}

        {screen === 'events' && <EventsScreen onNav={changeScreen} />}
        {screen === 'profile' && <ProfileScreen onNav={changeScreen} user={user} onSignOut={handleSignOut} detectedDevice={detectedDevice} scannedSizes={scannedSizes} setScannedSizes={setScannedSizes} scanGallery={scanGallery} setScanGallery={setScanGallery} galleryAccess={galleryAccess} setGalleryAccess={setGalleryAccess} />}
        {screen === 'wishlist' && (
          <WishlistScreen onNav={changeScreen} wishlistItems={wishlistItems} budget={budget} />
        )}

        {authModal && (
          <AuthModal
            onAuth={handleAuth}
            onDismiss={() => setAuthModal(null)}
          />
        )}

        {toast && (
          <View style={styles.toast}>
            <Text style={styles.toastEmoji}>💚</Text>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>
    </View>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  outer: {
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a1628',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  phoneFrame: {
    width: 390,
    minHeight: 844,
    backgroundColor: '#F8FAFC',
    borderRadius: 48,
    overflow: 'hidden',
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 200,
    backgroundColor: '#16A34A',
  },
  toastEmoji: { fontSize: 20 },
  toastText: { fontWeight: '700', fontSize: 14, color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
