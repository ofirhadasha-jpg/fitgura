import { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { Screen, User } from './types'
import { AuthModal } from './components'
import { SplashScreen } from './screens/SplashScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { DeviceDetectionScreen } from './screens/DeviceDetectionScreen'
import { FeedScreen } from './screens/FeedScreen'
import { EventsScreen } from './screens/EventsScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { WishlistScreen } from './screens/WishlistScreen'

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash')
  const [wishlistItems, setWishlistItems] = useState<number[]>([])
  const [budget, setBudget] = useState<[number, number]>([50, 500])
  const [user, setUser] = useState<User | null>(null)
  const [authModal, setAuthModal] = useState<{ pendingIdx: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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

  function handleAuth(loggedInUser: User) {
    setUser(loggedInUser)
    if (authModal) {
      setWishlistItems((prev) => [...prev, authModal.pendingIdx])
      showToast('הפריט נשמר ב-Wishlist שלך! 💚')
    }
    setAuthModal(null)
  }

  return (
    <View style={styles.outer}>
      <View style={styles.phoneFrame}>
        {screen === 'splash' && <SplashScreen onNext={() => setScreen('onboarding')} />}
        {screen === 'onboarding' && <OnboardingScreen onNext={() => setScreen('device')} />}
        {screen === 'device' && <DeviceDetectionScreen onNext={() => setScreen('feed')} />}
        {screen === 'feed' && (
          <FeedScreen
            wishlistItems={wishlistItems}
            onToggleWishlist={handleWishlistToggle}
            onNav={setScreen}
            budget={budget}
            setBudget={setBudget}
            user={user}
          />
        )}
        {screen === 'events' && <EventsScreen onNav={setScreen} />}
        {screen === 'profile' && <ProfileScreen onNav={setScreen} user={user} />}
        {screen === 'wishlist' && (
          <WishlistScreen onNav={setScreen} wishlistItems={wishlistItems} budget={budget} />
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
