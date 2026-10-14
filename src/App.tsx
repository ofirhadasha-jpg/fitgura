import { useState, useEffect, Component, type ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import type { Screen, User, DetectedDevice, ScannedSizes, ScanEntry, GalleryAccessState, Product, FamilyMember, FamilyCategory, FitEvent } from './types'
import type { SizeRegion } from './utils/sizeConverter'
import { AuthModal } from './components'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { SplashScreen } from './screens/SplashScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { DeviceDetectionScreen } from './screens/DeviceDetectionScreen'
import { FeedScreen } from './screens/FeedScreen'
import { SizingHubScreen } from './screens/SizingHubScreen'
import { EventsScreen } from './screens/EventsScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { RemoteUpdateScreen } from './screens/RemoteUpdateScreen'

import { AdminDashboard } from './pages/AdminDashboard'
import { startSession, endSession, updateLastSeen } from './services/trackingService'
import { getUnreadCount } from './services/notificationService'
import { shouldRunPeriodicScan, runPeriodicGrowthCheck, type GrowthDetection } from './services/growthDetection'

const GUEST_PROFILE_KEY = 'fitgura_guest_profile'
const GUEST_FAVORITES_KEY = 'fitgura_favorites'
const GUEST_DEVICE_KEY = 'fitgura_guest_device'
const GUEST_DEVICES_KEY = 'fitgura_guest_devices'
const LEGACY_GUEST_FAVORITES_KEY = 'fitgura_guest_favorites'

interface GuestProfile {
  gender: 'male' | 'female' | 'unisex'
  ageGroup: ScannedSizes['ageGroup']
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
  preview: string | null
}

function saveGuestProfile(sizes: ScannedSizes | null, preferredRegion: SizeRegion = 'EU') {
  if (!sizes) return
  const profile: GuestProfile = {
    gender: sizes.gender ?? 'unisex',
    ageGroup: sizes.ageGroup ?? 'adult',
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
    preview: sizes.preview ?? null,
  }
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile))
}

function saveGuestDevice(device: DetectedDevice | null) {
  if (!device) return
  localStorage.setItem(GUEST_DEVICE_KEY, JSON.stringify(device))
}

function loadGuestDevices(): string[] {
  try {
    const raw = localStorage.getItem(GUEST_DEVICES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
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
  try {
    const raw = localStorage.getItem(GUEST_PROFILE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GuestProfile
  } catch {
    return null
  }
}

function restoreScannedSizes(profile: Record<string, unknown>): ScannedSizes | null {
  const top = typeof profile.top_size === 'string' ? profile.top_size : null
  const bottom = typeof profile.bottom_size === 'string' ? profile.bottom_size : null
  if (!top && !bottom) return null

  const numberOrNull = (value: unknown): number | null => typeof value === 'number' ? value : null
  const fit = typeof profile.fit === 'string' ? profile.fit : 'Regular'
  const gender = profile.gender === 'male' || profile.gender === 'female' ? profile.gender : 'unisex'
  const savedUserSizes = profile.user_sizes && typeof profile.user_sizes === 'object' ? profile.user_sizes as Record<string, unknown> : null
  const savedAgeGroup = profile.ageGroup ?? profile.age_group ?? savedUserSizes?.age_group
  const ageGroup = savedAgeGroup === 'baby' || savedAgeGroup === 'toddler' || savedAgeGroup === 'child' || savedAgeGroup === 'teen' || savedAgeGroup === 'adult'
    ? savedAgeGroup
    : 'adult'
  const shoeSize = typeof profile.shoe_size === 'string' ? profile.shoe_size : null
  const bodyMetrics = {
    estimated_height_cm: numberOrNull(profile.height_cm),
    estimated_weight_kg: numberOrNull(profile.weight_kg),
    chest_circumference_cm: numberOrNull(profile.chest_cm),
    waist_circumference_cm: numberOrNull(profile.waist_cm),
    hips_circumference_cm: numberOrNull(profile.hips_cm),
    shoulder_width_cm: numberOrNull(profile.shoulder_cm),
  }

  return {
    sizing: {
      top: top ?? 'M',
      bottom: bottom ?? '40',
      fit,
      bodyFrame: 'Medium',
      confidence: 100,
      baselineMatched: true,
      isWeeklyUpdate: false,
      measurementDelta: null,
      bodyMetrics,
    },
    style: {
      primaryStyle: 'Casual',
      secondaryStyle: 'Urban',
      dominantColors: [],
      patternPreference: 'Solid',
      aestheticTags: [],
    },
    confidence: 100,
    preview: '',
    top: top ?? 'M',
    bottom: bottom ?? '40',
    fit,
    gender,
    ageGroup,
    personBounds: { top: 2, left: 10, width: 80, height: 96 },
    shoeSize,
  }
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

  let avatarUrl: string | null = null

  try {
    if (guestProfile?.preview) {
      const base64 = guestProfile.preview
      const byteString = atob(base64.split(',')[1] ?? '')
      const ab = new Uint8Array(byteString.length)
      for (let i = 0; i < byteString.length; i++) ab[i] = byteString.charCodeAt(i)
      const blob = new Blob([ab], { type: 'image/jpeg' })
      const filePath = `${userId}/avatar.jpg`
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, blob, { upsert: true, contentType: 'image/jpeg' })
      if (uploadError) {
        console.error('[App] Failed to upload guest photo:', uploadError.message)
      } else {
        avatarUrl = filePath
      }
    }
  } catch (err) {
    console.error('[App] Guest photo upload failed:', err)
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
        user_sizes: { age_group: guestProfile.ageGroup },
        registered_device: deviceName,
        registered_devices: deviceName ? [deviceName] : [],
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      }, { onConflict: 'user_id' })
      if (error) throw error
    } else if (guestDevice) {
      const deviceName = `${guestDevice.brand} ${guestDevice.model}`
      const { error } = await supabase.from('profiles').upsert({
        user_id: userId,
        registered_device: deviceName,
        registered_devices: [deviceName],
      }, { onConflict: 'user_id' })
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
      const { error } = await supabase.from('favorites').upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true })
      if (error) throw error
    }
  } catch (err) {
    migrationSucceeded = false
    console.error('[App] Failed to migrate guest favorites to Supabase:', err)
  }

  if (migrationSucceeded) {
    setTimeout(() => clearGuestData(), 3000)
  }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: unknown) { console.error('App crash caught:', err) }
  handleRecover = () => {
    this.setState({ hasError: false })
    sessionStorage.removeItem('fitgura_screen')
    sessionStorage.removeItem('fitgura_pending_scan')
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: '#FFFEF5' }}>
          <Text style={{ fontSize: 22, fontFamily: "'Permanent Marker', cursive", color: '#1A1A1A' }}>משהו השתבש</Text>
          <Text style={{ fontSize: 16, color: '#6B6B6B', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>אירעה שגיאה. אנא רענן את העמוד.</Text>
          <TouchableOpacity onPress={this.handleRecover} activeOpacity={0.8} style={{ backgroundColor: '#FFE566', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 8, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' }}>
            <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" }}>חזור להתחלה</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash')
  const [wishlistItems, setWishlistItems] = useState<number[]>([])
  const [budget, setBudget] = useState<[number, number]>([0, 5000])
  const [user, setUser] = useState<User | null>(null)
  const [authModal, setAuthModal] = useState<{ pendingIdx: number } | null>(null)
  const [pendingFamilyAdd, setPendingFamilyAdd] = useState(0)
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
  const [unreadCount, setUnreadCount] = useState(0)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [events, setEvents] = useState<FitEvent[]>([])
  const [recentlyUpdatedMembers, setRecentlyUpdatedMembers] = useState<Set<string>>(new Set())
  const [activeProfileId, setActiveProfileId] = useState<string>('self')
  const [growthAlerts, setGrowthAlerts] = useState<GrowthDetection[]>([])
  const [inviteToken, setInviteToken] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void startSession(user.id)
    void updateLastSeen(user.id)
    void getUnreadCount().then(setUnreadCount)
    const interval = setInterval(() => void getUnreadCount().then(setUnreadCount), 30000)
    return () => {
      clearInterval(interval)
      void endSession()
    }
  }, [user])

  // Realtime: listen for family_profiles updates + new notifications
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('family-updates')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'family_profiles', filter: `owner_user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { id: string; member_name: string; updated_at: string; top_size: string | null; bottom_size: string | null; shoe_size: string | null; fit: string | null; accuracy: number | null; gender: string | null; age_group: string | null; height_cm: number | null; weight_kg: number | null; chest_cm: number | null; waist_cm: number | null; hips_cm: number | null; shoulder_cm: number | null }
          if (!row?.member_name) return

          setRecentlyUpdatedMembers((prev) => new Set(prev).add(row.id))
          showToast(`🎉 ${row.member_name} עדכנ/ה את המידות! עכשיו אפשר להפתיע אותם במידה המדויקת.`)
          void getUnreadCount().then(setUnreadCount)
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          void getUnreadCount().then(setUnreadCount)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    // Check for existing session on mount — critical for Google OAuth redirects
    // where the SIGNED_IN event fires before the listener is attached
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return
      const u = session.user
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('is_admin, gender, chest_cm, waist_cm, hips_cm, shoulder_cm, height_cm, weight_kg, shoe_size, top_size, bottom_size, fit, user_sizes')
        .eq('user_id', u.id)
        .maybeSingle()
      if (profileRow) {
        const restoredSizes = restoreScannedSizes(profileRow as Record<string, unknown>)
        if (restoredSizes) setScannedSizes(restoredSizes)
      }
      setUser({
        id: u.id,
        name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'משתמש',
        email: u.email ?? '',
        avatar: u.user_metadata?.avatar_url ? 'G' : '✉',
        is_admin: profileRow?.is_admin === true,
      })
      setScreen((prev) => (prev === 'splash' || prev === 'onboarding' || prev === 'device') ? 'hub' : prev)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      void (async () => {
        if (!session?.user) {
          if (event === 'SIGNED_OUT') setUser(null)
          return
        }

        const u = session.user

        // Fetch is_admin from profiles so the admin button appears immediately
        let isAdmin = false
        try {
          const { data: profileRow } = await supabase.from('profiles').select('is_admin').eq('user_id', u.id).maybeSingle()
          isAdmin = profileRow?.is_admin === true
        } catch { /* keep default false */ }

        setUser({
          id: u.id,
          name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'משתמש',
          email: u.email ?? '',
          avatar: u.user_metadata?.avatar_url ? 'G' : '✉',
          is_admin: isAdmin,
        })

        // Navigate to feed on SIGNED_IN or INITIAL_SESSION (covers Google OAuth redirect)
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          setScreen((prev) => (prev === 'splash' || prev === 'onboarding' || prev === 'device') ? 'hub' : prev)
        }

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
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

        // Load family profiles from Supabase on sign-in (owned + granted)
        try {
          const { data: familyData, error: familyError } = await supabase
            .from('family_profiles')
            .select('*')
            .eq('owner_user_id', u.id)
          if (familyError) throw familyError
          const members: FamilyMember[] = (familyData ?? []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: row.member_name as string,
            category: (row.category as FamilyCategory) ?? 'partner',
            scannedSizes: null,
            scanGallery: [],
            accuracy: (row.accuracy as number) ?? 0,
            photoUrl: null,
            wardrobe: [],
          }))

          // Load profiles shared with this user via profile_grants
          const { data: grantedIds, error: grantedError } = await supabase
            .from('profile_grants')
            .select('family_profile_id')
            .eq('granted_user_id', u.id)
          if (!grantedError && grantedIds && grantedIds.length > 0) {
            const ids = grantedIds.map((g: { family_profile_id: string }) => g.family_profile_id)
            const { data: sharedData } = await supabase
              .from('family_profiles')
              .select('*')
              .in('id', ids)
            if (sharedData) {
              for (const row of sharedData as Record<string, unknown>[]) {
                const alreadyLoaded = members.some((m) => m.id === row.id)
                if (!alreadyLoaded) {
                  members.push({
                    id: row.id as string,
                    name: row.member_name as string,
                    category: (row.category as FamilyCategory) ?? 'partner',
                    scannedSizes: null,
                    scanGallery: [],
                    accuracy: (row.accuracy as number) ?? 0,
                    photoUrl: null,
                    wardrobe: [],
                  })
                }
              }
            }
          }

          if (members.length > 0) setFamilyMembers(members)
        } catch (err) {
          console.error('[App] Failed to load family profiles:', err)
        }
      })()
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Check for invite link in URL on mount (supports both #invite= and ?token= formats)
  useEffect(() => {
    const hash = window.location.hash
    const hashInviteMatch = hash.match(/invite=([a-f0-9-]+)/i)
    const hashTokenMatch = hash.match(/token=([a-f0-9-]+)/i)
    const queryParams = new URLSearchParams(window.location.search)
    const queryToken = queryParams.get('token')
    const token = hashInviteMatch?.[1] ?? hashTokenMatch?.[1] ?? queryToken
    if (token) {
      setInviteToken(token)
    }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
    showToast('התנתקת בהצלחה')
  }

  function changeScreen(s: Screen) {
    sessionStorage.removeItem('fitgura_screen')
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
        const { error } = await supabase.from('favorites').upsert({
          user_id: user.id,
          product_id: String(idx),
          product_name: productName,
        }, { onConflict: 'user_id,product_id' })
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
    const wasFamilyAdd = authModal?.pendingIdx === -1
    setUser(loggedInUser)
    if (authModal && authModal.pendingIdx >= 0) {
      setWishlistItems((prev) => prev.includes(authModal.pendingIdx) ? prev : [...prev, authModal.pendingIdx])
      showToast('הפריט נשמר ב-Wishlist שלך! 💚')
    }
    if (wasFamilyAdd) {
      setPendingFamilyAdd((n) => n + 1)
      changeScreen('profile')
    } else {
      changeScreen('hub')
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
      if (!user.id) {
        console.error('[App] Cannot persist profile: user.id is missing')
        return
      }
      supabase.from('profiles').upsert({
        user_id: user.id,
        email: user.email,
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
        user_sizes: {
          age_group: scannedSizes.ageGroup,
          shirt: scannedSizes.sizing.top ?? 'M',
          pants: scannedSizes.sizing.bottom ?? '40',
          shoes: scannedSizes.shoeSize ?? '42',
          chest_cm: bm?.chest_circumference_cm ?? null,
          waist_cm: bm?.waist_circumference_cm ?? null,
          hips_cm: bm?.hips_circumference_cm ?? null,
          foot_length_cm: null,
          height_cm: bm?.estimated_height_cm ?? null,
          weight_kg: bm?.estimated_weight_kg ?? null,
        },
      }, { onConflict: 'user_id' }).then(({ error }: { error: { code: string; message: string } | null }) => {
        if (error) console.error('[App] Failed to persist profile to Supabase:', error.code, error.message)
      }).catch((err: unknown) => {
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
        const { data: row, error: selectError } = await supabase.from('profiles').select('registered_devices').eq('user_id', user.id).maybeSingle()
        if (selectError) console.error('[App] Failed to load registered_devices:', selectError.code, selectError.message)
        const current: string[] = Array.isArray(row?.registered_devices) ? row.registered_devices : []
        const next = current.includes(trimmed) ? current : [trimmed, ...current]
        const { error } = await supabase.from('profiles').upsert({ user_id: user.id, registered_devices: next }, { onConflict: 'user_id' })
        if (error) console.error('[App] Failed to persist device to Supabase:', error.code, error.message)
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
        const { data: row, error: selectError } = await supabase.from('profiles').select('registered_devices').eq('user_id', user.id).maybeSingle()
        if (selectError) console.error('[App] Failed to load registered_devices:', selectError.code, selectError.message)
        const current: string[] = Array.isArray(row?.registered_devices) ? row.registered_devices : []
        const next = current.filter((d) => d !== deviceName)
        const { error } = await supabase.from('profiles').upsert({ user_id: user.id, registered_devices: next }, { onConflict: 'user_id' })
        if (error) console.error('[App] Failed to remove device from Supabase:', error.code, error.message)
      } catch (err) {
        console.error('[App] Device remove failed:', err)
      }
    }
  }

  // Hydrate guest device and favorites on initial mount
  useEffect(() => {
    try {
      migrateLegacyFavorites()
      const guestDevice = loadGuestDevice()
      if (guestDevice) setDetectedDevice((prev) => prev ?? guestDevice)
      const guestDevices = loadGuestDevices()
      if (guestDevices.length > 0) setRegisteredDevices((prev) => prev.length > 0 ? prev : guestDevices)
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
        preview: gp.preview ?? '',
        top: gp.topSize ?? 'M',
        bottom: gp.bottomSize ?? '48',
        fit: gp.fit ?? 'Regular',
        gender: gp.gender,
        personBounds: { top: 2, left: 10, width: 80, height: 96 },
        shoeSize: gp.shoeSize,
      }
      setScannedSizes(restored)
    }
      const favIndices = loadFavoriteIndices(feedCatalog)
      if (favIndices.length > 0) {
        setWishlistItems(favIndices)
      }
    } catch (err) {
      console.error('[App] Hydration failed, clearing stale data:', err)
      sessionStorage.removeItem('fitgura_screen')
      sessionStorage.removeItem('fitgura_pending_scan')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load favorites from Supabase for logged-in users
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('favorites')
          .select('product_id')
          .eq('user_id', user.id)
        if (error) throw error
        if (data && data.length > 0) {
          const indices = data
            .map((row) => Number(row.product_id))
            .filter((n) => !Number.isNaN(n) && n >= 0)
          setWishlistItems((prev) => {
            const merged = [...prev]
            for (const idx of indices) {
              if (!merged.includes(idx)) merged.push(idx)
            }
            return merged
          })
        }
      } catch (err) {
        console.error('[App] Failed to load favorites from Supabase:', err)
      }
    })()
  }, [user?.id])

  // Periodic background growth scan — runs on app launch if 30 days have passed
  useEffect(() => {
    if (!shouldRunPeriodicScan()) return
    if (familyMembers.length === 0) return

    const timer = setTimeout(() => {
      const { detections, updatedMembers } = runPeriodicGrowthCheck(familyMembers, scannedSizes)
      if (detections.length > 0) {
        setGrowthAlerts(detections)
        setFamilyMembers(updatedMembers)
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [familyMembers, scannedSizes])

  function handleApproveGrowth(detection: GrowthDetection) {
    setFamilyMembers((prev) =>
      prev.map((m) =>
        m.id === detection.member.id
          ? { ...m, scannedSizes: detection.newSizes, accuracy: detection.newSizes.confidence }
          : m,
      ),
    )
    setGrowthAlerts((prev) => prev.filter((d) => d.member.id !== detection.member.id))
    showToast(`המידות של ${detection.member.name} עודכנו בהצלחה ✨`)
  }

  function handleDismissGrowth(detection: GrowthDetection) {
    setGrowthAlerts((prev) => prev.filter((d) => d.member.id !== detection.member.id))
  }

  return (
    <ErrorBoundary>
    <View style={styles.outer}>
      <View style={styles.phoneFrame}>
      {inviteToken ? (
        <RemoteUpdateScreen token={inviteToken} />
      ) : (
      <>
        {screen === 'splash' && <SplashScreen onNext={() => changeScreen('onboarding')} onAuth={handleAuth} />}
        {screen === 'onboarding' && <OnboardingScreen onNext={() => changeScreen('hub')} onScanned={setScannedSizes} onGalleryAdd={setScanGallery} onGalleryAccess={(granted) => setGalleryAccess(granted ? 'granted' : 'denied')} />}
        {screen === 'device' && <DeviceDetectionScreen onNext={() => changeScreen('hub')} onDetected={handleDeviceDetected} />}
        {screen === 'hub' && <SizingHubScreen onNav={changeScreen} user={user} scannedSizes={scannedSizes} setScannedSizes={setScannedSizes} scanGallery={scanGallery} setScanGallery={setScanGallery} wishlistItems={wishlistItems} feedCatalog={feedCatalog} budget={budget} onToggleWishlist={handleWishlistToggle} familyMembers={familyMembers} />}
        {screen === 'feed' && <FeedScreen wishlistItems={wishlistItems} onToggleWishlist={handleWishlistToggle} onNav={changeScreen} budget={budget} setBudget={setBudget} user={user} scannedSizes={scannedSizes} detectedDevice={detectedDevice} onCatalogChange={setFeedCatalog} registeredDevices={registeredDevices} onAddDevice={handleAddDevice} onRemoveDevice={handleRemoveDevice} latestAddedDevice={latestAddedDevice} events={events} familyMembers={familyMembers} />}

        {screen === 'events' && <EventsScreen onNav={changeScreen} isAdmin={user?.is_admin === true} familyMembers={familyMembers} events={events} setEvents={setEvents} />}
        {screen === 'profile' && <ProfileScreen onNav={changeScreen} user={user} onSignOut={handleSignOut} detectedDevice={detectedDevice} scannedSizes={scannedSizes} setScannedSizes={setScannedSizes} scanGallery={scanGallery} setScanGallery={setScanGallery} galleryAccess={galleryAccess} setGalleryAccess={setGalleryAccess} preferredRegion={preferredRegion} setPreferredRegion={setPreferredRegion} registeredDevices={registeredDevices} onAddDevice={handleAddDevice} onRemoveDevice={handleRemoveDevice} familyMembers={familyMembers} setFamilyMembers={setFamilyMembers} activeProfileId={activeProfileId} setActiveProfileId={setActiveProfileId} onRequestAuth={() => { setPendingFamilyAdd(1); setAuthModal({ pendingIdx: -1 }) }} reopenAddMemberSignal={pendingFamilyAdd} recentlyUpdatedMembers={recentlyUpdatedMembers} />}
        {screen === 'admin' && <AdminDashboard onNav={changeScreen} />}

        {authModal && authModal.pendingIdx >= 0 && (
          <AuthModal
            onAuth={handleAuth}
            onDismiss={() => setAuthModal(null)}
          />
        )}

        {authModal && authModal.pendingIdx < 0 && (
          <AuthModal
            onAuth={handleAuth}
            onDismiss={() => { setAuthModal(null); setPendingFamilyAdd(0) }}
          />
        )}

        {growthAlerts.length > 0 && (
          <View style={styles.growthBannerOverlay}>
            {growthAlerts.map((d) => (
              <View key={d.member.id} style={styles.growthBanner}>
                <Text style={styles.growthBannerText}>{d.message}</Text>
                <View style={styles.growthBannerActions}>
                  <TouchableOpacity
                    onPress={() => handleApproveGrowth(d)}
                    activeOpacity={0.8}
                    style={styles.growthApproveBtn}
                  >
                    <Text style={styles.growthApproveBtnText}>אישור עדכון ✨</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDismissGrowth(d)}
                    activeOpacity={0.7}
                    style={styles.growthDismissBtn}
                  >
                    <Text style={styles.growthDismissBtnText}>לא עכשיו</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {toast && (
          <View style={styles.toast}>
            <Text style={styles.toastEmoji}>💚</Text>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </>
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
    backgroundColor: '#1A1A1A',
    backgroundImage: 'linear-gradient(rgba(255,229,102,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,229,102,0.07) 1px, transparent 1px)',
    backgroundSize: '28px 28px',
    paddingVertical: 24,
    paddingHorizontal: 16,
  } as React.CSSProperties,
  phoneFrame: {
    width: 390,
    minHeight: 844,
    backgroundColor: '#FFFEF5',
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)',
    border: '2px solid #1A1A1A',
    borderRadius: 14,
    boxShadow: '6px 6px 0 #FFE566, 12px 12px 0 rgba(255,229,102,0.2)',
    overflow: 'hidden',
  } as React.CSSProperties,
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    borderRadius: '10px 10px 10px 2px',
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 200,
    backgroundColor: '#00FF66',
    border: '1.5px solid #1A1A1A',
    boxShadow: '2px 2px 0 #1A1A1A',
  } as React.CSSProperties,
  toastEmoji: { fontSize: 20 },
  toastText: { fontWeight: '700', fontSize: 16, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  growthBannerOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    zIndex: 210,
    gap: 8,
  } as React.CSSProperties,
  growthBanner: {
    backgroundColor: '#E0FFF0',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #00CC52',
  } as React.CSSProperties,
  growthBannerText: {
    fontSize: 15,
    color: '#1A1A1A',
    lineHeight: 22,
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
    marginBottom: 10,
  },
  growthBannerActions: { flexDirection: 'row', gap: 8 },
  growthApproveBtn: {
    backgroundColor: '#00FF66',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
  } as React.CSSProperties,
  growthApproveBtnText: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  growthDismissBtn: {
    backgroundColor: '#FFFEF5',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#9A9A9A',
  } as React.CSSProperties,
  growthDismissBtnText: { fontSize: 14, color: '#6B6B6B', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
})
