import { useState, useEffect, Component, type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { Screen, User, DetectedDevice, ScannedSizes, ScanEntry, GalleryAccessState, Product } from './types'
import type { SizeRegion } from './utils/sizeConverter'
import { AuthModal } from './components'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { SplashScreen } from './screens/SplashScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { DeviceDetectionScreen } from './screens/DeviceDetectionScreen'
import { FeedScreen } from './screens/FeedScreen'
import { EventsScreen } from './screens/EventsScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { WishlistScreen } from './screens/WishlistScreen'

const GUEST_PROFILE_KEY = 'fitgura_guest_profile'
const GUEST_FAVORITES_KEY = 'fitgura_favorites'
const GUEST_DEVICE_KEY = 'fitgura_guest_device'
const GUEST_DEVICES_KEY = 'fitgura_guest_devices'
const LEGACY_GUEST_FAVORITES_KEY = 'fitgura_guest_favorites'

interface GuestProfile {
  gender: 'male' | 'female' | 'unisex'
  chest: number | null
  waist: number | null
  hips: number | null
  shoulder: number | null
  height: number | null
  weight: number | null
  shoeSize: string | null
  topSize: string | null
  bottomSize: string | null
  fit: string | null
  preferredRegion: SizeRegion | null
}

function saveGuestProfile(sizes: ScannedSizes | null, preferredRegion: SizeRegion = 'EU') {
  if (!sizes) return
  const profile: GuestProfile = {
    gender: sizes.gender ?? 'unisex',
    chest: sizes.sizing.bodyMetrics?.chest_circumference_cm ?? null,
    waist: sizes.sizing.bodyMetrics?.waist_circumference_cm ?? null,
    hips: sizes.sizing.bodyMetrics?.hips_circumference_cm ?? null,
    shoulder: sizes.sizing.bodyMetrics?.shoulder_width_cm ?? null,
    height: sizes.sizing.bodyMetrics?.estimated_height_cm ?? null,
    weight: sizes.sizing.bodyMetrics?.estimated_weight_kg ?? null,
    shoeSize: sizes.shoeSize ?? null,
    topSize: sizes.sizing.top ?? null,
    bottomSize: sizes.sizing.bottom ?? null,
    fit: sizes.sizing.fit ?? null,
    preferredRegion: preferredRegion ?? 'EU',
  }
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile))
}

function saveGuestDevice(device: DetectedDevice | null) {
  if (!device) return
  localStorage.setItem(GUEST_DEVICE_KEY, JSON.stringify(device))
}

function loadGuestDevices(): string[] {
  const raw = localStorage.getItem(GUEST_DEVICES_KEY)
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
}

function saveGuestDevices(devices: string[]) {
  localStorage.setItem(GUEST_DEVICES_KEY, JSON.stringify(devices))
}

function loadGuestDevice(): DetectedDevice | null {
  const raw = localStorage.getItem(GUEST_DEVICE_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as DetectedDevice } catch { return null }
}

function saveGuestFavorites(items: number[], catalog: Product[]) {
  const favorites = items.map((idx) => ({
    productId: String(idx),
    productName: catalog[idx]?.name ?? '',
  }))
  localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(favorites))
}

// Merge legacy guest favorites key into the new one on first load
function migrateLegacyFavorites(): { productId: string; productName: string }[] {
  const legacy = localStorage.getItem(LEGACY_GUEST_FAVORITES_KEY)
  if (!legacy) return []
  try {
    const parsed = JSON.parse(legacy) as { productId: string; productName: string }[]
    const current = localStorage.getItem(GUEST_FAVORITES_KEY)
    const existing = current ? JSON.parse(current) as { productId: string; productName: string }[] : []
    const merged = [...existing]
    for (const f of parsed) {
      if (!merged.some((m) => m.productId === f.productId)) merged.push(f)
    }
    localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(merged))
    localStorage.removeItem(LEGACY_GUEST_FAVORITES_KEY)
    return merged
  } catch {
    return []
  }
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

function loadFavoriteIndices(catalog: Product[]): number[] {
  const favorites = loadGuestFavorites()
  return favorites
    .map((f) => {
      const idx = Number(f.productId)
      return Number.isNaN(idx) ? catalog.findIndex((p) => p.name === f.productName) : idx
    })
    .filter((i) => i >= 0 && i < catalog.length)
}

function clearGuestData() {
  localStorage.removeItem(GUEST_PROFILE_KEY)
  localStorage.removeItem(GUEST_FAVORITES_KEY)
  localStorage.removeItem(GUEST_DEVICE_KEY)
}

async function migrateGuestData(userId: string) {
  const guestProfile = loadGuestProfile()
  const guestFavorites = loadGuestFavorites()
  const guestDevice = loadGuestDevice()
  let migrationSucceeded = true

  if (!isSupabaseConfigured) {
    console.warn('[App] Supabase not configured, skipping guest data migration')
    return
  }

  try {
    if (guestProfile) {
      const deviceName = guestDevice ? `${guestDevice.brand} ${guestDevice.model}` : null
      const { error } = await supabase.from('profiles').upsert({
        user_id: userId,
        gender: guestProfile.gender,
        chest_cm: guestProfile.chest,
        waist_cm: guestProfile.waist,
        hips_cm: guestProfile.hips,
        shoulder_cm: guestProfile.shoulder,
        height_cm: guestProfile.height,
        weight_kg: guestProfile.weight,
        shoe_size: guestProfile.shoeSize,
        top_size: guestProfile.topSize,
        bottom_size: guestProfile.bottomSize,
        fit: guestProfile.fit,
        preferred_region: guestProfile.preferredRegion ?? 'EU',
        registered_device: deviceName,
        registered_devices: deviceName ? [deviceName] : [],
      })
      if (error) throw error
    } else if (guestDevice) {
      const deviceName = `${guestDevice.brand} ${guestDevice.model}`
      const { error } = await supabase.from('profiles').upsert({
        user_id: userId,
        registered_device: deviceName,
        registered_devices: [deviceName],
      })
      if (error) throw error
    }
  } catch (err) {
    migrationSucceeded = false
    console.error('[App] Failed to migrate guest profile to Supabase:', err)
  }

  try {
    if (guestFavorites.length > 0) {
      const rows = guestFavorites.map((f) => ({
        user_id: userId,
        product_id: f.productId,
        product_name: f.productName,
      }))
      const { error } = await supabase.from('favorites').insert(rows)
      if (error) throw error
    }
  } catch (err) {
    migrationSucceeded = false
    console.error('[App] Failed to migrate guest favorites to Supabase:', err)
  }

  if (migrationSucceeded) clearGuestData()
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
  const [budget, setBudget] = useState<[number, number]>([0, 5000])
  const [user, setUser] = useState<User | null>(null)
  const [authModal, setAuthModal] = useState<{ pendingIdx: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [detectedDevice, setDetectedDevice] = useState<DetectedDevice | null>(null)
  const [scannedSizes, setScannedSizes] = useState<ScannedSizes | null>(null)
  const [scanGallery, setScanGallery] = useState<ScanEntry[]>([])
  const [galleryAccess, setGalleryAccess] = useState<GalleryAccessState>('pending')
  const [feedCatalog, setFeedCatalog] = useState<Product[]>([])
  const [preferredRegion, setPreferredRegion] = useState<SizeRegion>(() => {
    const gp = loadGuestProfile()
    return gp?.preferredRegion ?? 'EU'
  })
  const [registeredDevices, setRegisteredDevices] = useState<string[]>(() => loadGuestDevices())
  const [latestAddedDevice, setLatestAddedDevice] = useState<string | null>(null)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      void (async () => {
        if (!session?.user) {
          if (event === 'SIGNED_OUT') setUser(null)
          return
        }

        const u = session.user
        setUser({
          id: u.id,
          name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'משתמש',
          email: u.email ?? '',
          avatar: u.user_metadata?.avatar_url ? 'G' : '✉',
        })

        if (event === 'SIGNED_IN') {
          try {
            await migrateGuestData(u.id)
          } catch (err) {
            console.error('[App] Guest data migration failed:', err)
          }
        }

        try {
          const { data: profileRow, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', u.id)
            .maybeSingle()
          if (error) throw error
          if (profileRow?.preferred_region === 'EU' || profileRow?.preferred_region === 'US' || profileRow?.preferred_region === 'UK') {
            setPreferredRegion(profileRow.preferred_region)
          }
          // Load registered_devices array (with legacy fallback)
          const devices: string[] = Array.isArray(profileRow?.registered_devices) && profileRow.registered_devices.length > 0
            ? profileRow.registered_devices
            : profileRow?.registered_device
              ? [profileRow.registered_device]
              : []
          if (devices.length > 0) setRegisteredDevices(devices)
          if (profileRow?.registered_device) {
            const parts = profileRow.registered_device.split(' ')
            const brand = parts[0] ?? 'Unknown'
            const model = parts.slice(1).join(' ') || profileRow.registered_device
            setDetectedDevice((prev) => prev ?? {
              brand,
              model,
              chip: '',
              year: '',
              name: profileRow.registered_device,
              screen_size_inches: null,
              camera_layout: null,
              confidence: 0.5,
            })
          }
        } catch (err) {
          console.error('[App] Profile lookup failed; keeping auth session:', err)
        }
      })()
    })
    return () => listener.subscription.unsubscribe()
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

  async function handleWishlistToggle(idx: number) {
    const isAdding = !wishlistItems.includes(idx)

    // Optimistic local state update
    setWishlistItems((prev) =>
      isAdding ? [...prev, idx] : prev.filter((x) => x !== idx)
    )

    // For guests, persist to localStorage immediately (handled by the effect below)
    if (!user) {
      setAuthModal({ pendingIdx: idx })
      return
    }

    // For logged-in users, try Supabase — fall back to localStorage on failure
    const productName = feedCatalog[idx]?.name ?? ''
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase not configured')
      if (isAdding) {
        const { error } = await supabase.from('favorites').insert({
          user_id: user.id,
          product_id: String(idx),
          product_name: productName,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', String(idx))
        if (error) throw error
      }
    } catch (err) {
      console.error('[App] Supabase favorites call failed, using localStorage fallback:', err)
      showToast('הפריט נשמר מקומית')
      const favorites = loadGuestFavorites()
      const updated = isAdding
        ? (favorites.some((f) => f.productId === String(idx))
            ? favorites
            : [...favorites, { productId: String(idx), productName }])
        : favorites.filter((f) => f.productId !== String(idx))
      localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(updated))
    }
  }

  useEffect(() => {
    if (!user) saveGuestFavorites(wishlistItems, feedCatalog)
  }, [wishlistItems, user, feedCatalog])

  function handleAuth(loggedInUser: User) {
    setUser(loggedInUser)
    if (authModal) {
      setWishlistItems((prev) => [...prev, authModal.pendingIdx])
      showToast('הפריט נשמר ב-Wishlist שלך! 💚')
    }
    setAuthModal(null)
  }

  useEffect(() => {
    if (!user) {
      saveGuestProfile(scannedSizes, preferredRegion)
      return
    }
    // Logged-in user: persist to Supabase profiles table
    if (scannedSizes) {
      const bm = scannedSizes.sizing.bodyMetrics
      supabase.from('profiles').upsert({
        user_id: user.id,
        gender: scannedSizes.gender ?? 'unisex',
        chest_cm: bm?.chest_circumference_cm ?? null,
        waist_cm: bm?.waist_circumference_cm ?? null,
        hips_cm: bm?.hips_circumference_cm ?? null,
        shoulder_cm: bm?.shoulder_width_cm ?? null,
        height_cm: bm?.estimated_height_cm ?? null,
        weight_kg: bm?.estimated_weight_kg ?? null,
        shoe_size: scannedSizes.shoeSize ?? null,
        top_size: scannedSizes.sizing.top ?? null,
        bottom_size: scannedSizes.sizing.bottom ?? null,
        fit: scannedSizes.sizing.fit ?? null,
        preferred_region: preferredRegion,
      }).then(({ error }) => {
        if (error) console.error('[App] Failed to persist profile to Supabase:', error.message)
      }).catch((err) => {
        console.error('[App] Supabase profile persist failed, keeping local only:', err)
      })
    }
  }, [scannedSizes, user, preferredRegion])

  // Persist detected device for guests
  useEffect(() => {
    if (!user && detectedDevice) saveGuestDevice(detectedDevice)
  }, [detectedDevice, user])

  // Persist registered devices for guests
  useEffect(() => {
    if (!user) saveGuestDevices(registeredDevices)
  }, [registeredDevices, user])

  async function handleAddDevice(deviceName: string) {
    const trimmed = deviceName.trim()
    if (!trimmed) return
    setRegisteredDevices((prev) => prev.includes(trimmed) ? prev : [trimmed, ...prev])
    setLatestAddedDevice(trimmed)
    if (user && isSupabaseConfigured) {
      try {
        const { data: row } = await supabase.from('profiles').select('registered_devices').eq('user_id', user.id).maybeSingle()
        const current: string[] = Array.isArray(row?.registered_devices) ? row.registered_devices : []
        const next = current.includes(trimmed) ? current : [trimmed, ...current]
        const { error } = await supabase.from('profiles').update({ registered_devices: next }).eq('user_id', user.id)
        if (error) console.error('[App] Failed to persist device to Supabase:', error.message)
      } catch (err) {
        console.error('[App] Device add failed:', err)
      }
    }
  }

  function handleDeviceDetected(device: DetectedDevice) {
    setDetectedDevice(device)
    void handleAddDevice(`${device.brand} ${device.model}`)
  }

  async function handleRemoveDevice(deviceName: string) {
    setRegisteredDevices((prev) => prev.filter((d) => d !== deviceName))
    setLatestAddedDevice((prev) => prev === deviceName ? null : prev)
    if (user && isSupabaseConfigured) {
      try {
        const { data: row } = await supabase.from('profiles').select('registered_devices').eq('user_id', user.id).maybeSingle()
        const current: string[] = Array.isArray(row?.registered_devices) ? row.registered_devices : []
        const next = current.filter((d) => d !== deviceName)
        const { error } = await supabase.from('profiles').update({ registered_devices: next }).eq('user_id', user.id)
        if (error) console.error('[App] Failed to remove device from Supabase:', error.message)
      } catch (err) {
        console.error('[App] Device remove failed:', err)
      }
    }
  }

  // Hydrate guest device and favorites on initial mount
  useEffect(() => {
    if (!user) {
      migrateLegacyFavorites()
      const guestDevice = loadGuestDevice()
      if (guestDevice) setDetectedDevice((prev) => prev ?? guestDevice)
      const guestDevices = loadGuestDevices()
      if (guestDevices.length > 0) setRegisteredDevices((prev) => prev.length > 0 ? prev : guestDevices)
      // Hydrate guest profile sizes so they survive reloads
      const gp = loadGuestProfile()
      if (gp?.preferredRegion) setPreferredRegion(gp.preferredRegion)
      if (gp && !scannedSizes) {
        const restored: ScannedSizes = {
          sizing: {
            top: gp.topSize ?? 'M',
            bottom: gp.bottomSize ?? '48',
            fit: gp.fit ?? 'Regular',
            bodyFrame: 'Medium',
            confidence: 85,
            baselineMatched: true,
            isWeeklyUpdate: false,
            measurementDelta: null,
            bodyMetrics: {
              estimated_height_cm: gp.height,
              estimated_weight_kg: gp.weight,
              chest_circumference_cm: gp.chest,
              waist_circumference_cm: gp.waist,
              hips_circumference_cm: gp.hips,
              shoulder_width_cm: gp.shoulder,
            },
          },
          style: { primaryStyle: '', secondaryStyle: '', dominantColors: [], patternPreference: '', aestheticTags: [] },
          confidence: 85,
          preview: '',
          top: gp.topSize ?? 'M',
          bottom: gp.bottomSize ?? '48',
          fit: gp.fit ?? 'Regular',
          gender: gp.gender,
          personBounds: { top: 2, left: 10, width: 80, height: 96 },
          shoeSize: gp.shoeSize,
        }
        setScannedSizes(restored)
      }
      // Hydrate guest favorites from localStorage
      const favIndices = loadFavoriteIndices(feedCatalog)
      if (favIndices.length > 0) {
        setWishlistItems(favIndices)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ErrorBoundary>
    <View style={styles.outer}>
      <View style={styles.phoneFrame}>
        {screen === 'splash' && <SplashScreen onNext={() => changeScreen('onboarding')} />}
        {screen === 'onboarding' && <OnboardingScreen onNext={() => changeScreen('device')} onScanned={setScannedSizes} onGalleryAdd={setScanGallery} onGalleryAccess={(granted) => setGalleryAccess(granted ? 'granted' : 'denied')} />}
        {screen === 'device' && <DeviceDetectionScreen onNext={() => changeScreen('feed')} onDetected={handleDeviceDetected} />}
        {screen === 'feed' && <FeedScreen wishlistItems={wishlistItems} onToggleWishlist={handleWishlistToggle} onNav={changeScreen} budget={budget} setBudget={setBudget} user={user} scannedSizes={scannedSizes} detectedDevice={detectedDevice} onCatalogChange={setFeedCatalog} registeredDevices={registeredDevices} onAddDevice={handleAddDevice} onRemoveDevice={handleRemoveDevice} latestAddedDevice={latestAddedDevice} />}

        {screen === 'events' && <EventsScreen onNav={changeScreen} />}
        {screen === 'profile' && <ProfileScreen onNav={changeScreen} user={user} onSignOut={handleSignOut} detectedDevice={detectedDevice} scannedSizes={scannedSizes} setScannedSizes={setScannedSizes} scanGallery={scanGallery} setScanGallery={setScanGallery} galleryAccess={galleryAccess} setGalleryAccess={setGalleryAccess} preferredRegion={preferredRegion} setPreferredRegion={setPreferredRegion} registeredDevices={registeredDevices} onAddDevice={handleAddDevice} onRemoveDevice={handleRemoveDevice} />}
        {screen === 'wishlist' && (
          <WishlistScreen onNav={changeScreen} wishlistItems={wishlistItems} budget={budget} catalog={feedCatalog} />
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
