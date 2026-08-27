import { useState, useEffect, useRef } from 'react'

type Screen = 'splash' | 'onboarding' | 'device' | 'feed' | 'events' | 'profile' | 'wishlist'

/* ─── EVENTS BOARD — types & data (must be before App) ───────────────────── */

interface FitEvent {
  id: number
  name: string
  emoji: string
  date: string
  platforms: string[]   // up to 3
  color: string
  bgColor: string
}

interface Platform {
  name: string
  daysIL: number   // shipping days to Israel
  logo: string
  color: string
  note: string     // short shipping description
}

const PLATFORMS: Platform[] = [
  { name: 'AliExpress', daysIL: 60, logo: '🟠', color: '#E84B35', note: '60 יום לישראל' },
  { name: 'Temu',       daysIL: 45, logo: '🔵', color: '#2563EB', note: '45 יום לישראל' },
  { name: 'Shein',      daysIL: 30, logo: '⬛', color: '#111827', note: '30 יום לישראל' },
  { name: 'Amazon',     daysIL: 7,  logo: '📦', color: '#F59E0B', note: '7 ימים לישראל' },
  { name: 'ASOS',       daysIL: 14, logo: '🛍️', color: '#7C3AED', note: '14 יום לישראל' },
  { name: 'ZARA',       daysIL: 5,  logo: '🟫', color: '#78716C', note: '5 ימים לישראל' },
  { name: 'H&M',        daysIL: 7,  logo: '🔴', color: '#DC2626', note: '7 ימים לישראל' },
  { name: 'Nike',       daysIL: 10, logo: '✔️', color: '#374151', note: '10 ימים לישראל' },
]

const PRESET_EVENTS = [
  { name: 'יום האהבה', emoji: '💝', month: '02', day: '14', color: '#FF6B6B', bgColor: '#FFF0F0' },
  { name: 'יום הולדת', emoji: '🎂', month: '', day: '', color: '#2E5BFF', bgColor: '#EEF2FF' },
  { name: 'יום נישואין', emoji: '💍', month: '', day: '', color: '#FF6B6B', bgColor: '#FFF5F0' },
  { name: 'ראש השנה', emoji: '🍎', month: '09', day: '22', color: '#2ED573', bgColor: '#F0FFF6' },
  { name: 'חנוכה', emoji: '🕎', month: '12', day: '25', color: '#2E5BFF', bgColor: '#EEF2FF' },
  { name: 'פסח', emoji: '✡️', month: '04', day: '12', color: '#F59E0B', bgColor: '#FFFBEB' },
  { name: 'יום האב', emoji: '👨', month: '06', day: '16', color: '#7C3AED', bgColor: '#F5F3FF' },
  { name: 'יום האם', emoji: '💐', month: '05', day: '11', color: '#EC4899', bgColor: '#FDF2F8' },
]

let _nextEventId = 10

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

interface User {
  name: string
  email: string
  avatar: string
}

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
      // removing is always allowed
      setWishlistItems((prev) => prev.filter((x) => x !== idx))
      return
    }
    if (!user) {
      // gate: show auth modal, remember which item triggered it
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #0a1628 0%, #1a2a5e 50%, #0f1f3d 100%)',
        padding: '24px 16px',
        fontFamily: "'Outfit', 'Noto Sans Hebrew', sans-serif",
      }}
    >
      <div
        style={{
          width: '390px',
          minHeight: '844px',
          background: '#F8FAFC',
          borderRadius: '48px',
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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

        {/* Auth modal overlay — rendered inside the phone frame */}
        {authModal && (
          <AuthModal
            onAuth={handleAuth}
            onDismiss={() => setAuthModal(null)}
          />
        )}

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: 'absolute',
              bottom: 100,
              left: 16,
              right: 16,
              background: 'linear-gradient(135deg, #15803D, #16A34A)',
              color: '#fff',
              borderRadius: 16,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 32px rgba(21,128,61,0.45)',
              zIndex: 200,
              animation: 'slideUp 0.3s ease',
              direction: 'rtl',
            }}
          >
            <span style={{ fontSize: 20 }}>💚</span>
            <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{toast}</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes sheetDown {
          from { transform: translateY(-100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ─── AUTH MODAL ─────────────────────────────────────────────────────────── */

function AuthModal({ onAuth, onDismiss }: { onAuth: (u: User) => void; onDismiss: () => void }) {
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
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onDismiss}
        style={{ position: 'absolute', inset: 0, background: 'rgba(11,20,55,0.6)', backdropFilter: 'blur(4px)' }}
      />

      {/* Top sheet */}
      <div
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: '0 0 32px 32px',
          overflow: 'hidden',
          animation: 'sheetDown 0.35s cubic-bezier(0.22,1,0.36,1)',
          direction: 'rtl',
        }}
      >
        {/* Blue header strip */}
        <div
          style={{
            background: 'linear-gradient(135deg, #2E5BFF 0%, #1A3399 100%)',
            padding: '28px 24px 24px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: -30, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ position: 'absolute', bottom: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,107,107,0.15)' }} />

          {/* close */}
          <button
            onClick={onDismiss}
            style={{
              position: 'absolute', top: 16, left: 16,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              cursor: 'pointer', color: '#fff', fontSize: 16, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: 14,
                background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}
            >
              ❤️
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.3, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                שמור את המידות והפריטים המועדפים שלך!
              </h3>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 12px' }}>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748B', lineHeight: 1.6, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
            התחבר בלחיצה אחת כדי לשמור את תוצאות סריקת ה-AI וה-Wishlist שלך מכל מכשיר.
          </p>

          {!emailStep ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Google CTA */}
              <button
                onClick={() => mockLogin('google')}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                  padding: '15px 20px',
                  borderRadius: 18,
                  border: '1.5px solid #E2E8F0',
                  background: loading ? '#F8FAFC' : '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)' }}
              >
                {loading ? (
                  <div style={{ width: 20, height: 20, border: '2px solid #E2E8F0', borderTopColor: '#2E5BFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                ) : (
                  /* Google G icon */
                  <svg width="20" height="20" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 19 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.8-2 13.2-5.1l-6.1-5.2C29.1 35.5 26.7 36 24 36c-5.1 0-9.5-3.1-11.3-7.6l-6.5 5C9.5 39.3 16.3 44 24 44z"/>
                    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.1 5.2C36.9 39.8 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
                  </svg>
                )}
                <span style={{ fontWeight: 700, fontSize: 15, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                  {loading ? 'מתחבר...' : 'התחבר במהירות עם Google'}
                </span>
              </button>

              {/* Email CTA */}
              <button
                onClick={() => setEmailStep(true)}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '15px 20px',
                  borderRadius: 18,
                  border: 'none',
                  background: 'linear-gradient(135deg, #2E5BFF, #1a38c8)',
                  color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  boxShadow: '0 6px 20px rgba(46,91,255,0.35)',
                }}
              >
                <span style={{ fontSize: 16 }}>✉️</span>
                <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>התחבר באמצעות אימייל</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  padding: '14px 16px', borderRadius: 14,
                  border: '1.5px solid #E2E8F0', fontSize: 15,
                  outline: 'none', direction: 'ltr', textAlign: 'left',
                  fontFamily: "'Outfit', sans-serif", color: '#1E293B',
                  background: '#F8FAFC',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
              />
              <button
                onClick={() => email && mockLogin('email')}
                disabled={loading || !email}
                style={{
                  padding: '15px', borderRadius: 18, border: 'none',
                  background: email ? 'linear-gradient(135deg, #2E5BFF, #1a38c8)' : '#E2E8F0',
                  color: email ? '#fff' : '#94A3B8',
                  fontWeight: 700, fontSize: 15,
                  cursor: email && !loading ? 'pointer' : 'not-allowed',
                  fontFamily: "'Noto Sans Hebrew', sans-serif",
                  boxShadow: email ? '0 6px 20px rgba(46,91,255,0.35)' : 'none',
                  transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {loading
                  ? <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  : 'כניסה'}
              </button>
              <button onClick={() => setEmailStep(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                ← חזור
              </button>
            </div>
          )}

          {/* Guest dismiss */}
          <button
            onClick={onDismiss}
            style={{
              display: 'block', width: '100%', marginTop: 14, marginBottom: 28,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#CBD5E1', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif",
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            המשך כאורח ללא שמירה
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/* ─── SPLASH ─────────────────────────────────────────────────────────────── */

function SplashScreen({ onNext }: { onNext: () => void }) {
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 1200)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      onClick={onNext}
      style={{
        flex: 1,
        minHeight: '844px',
        background: 'linear-gradient(160deg, #0B1437 0%, #1A2F7A 55%, #0B1437 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ambient orbs */}
      <div style={{ position: 'absolute', top: '8%', right: '-15%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(46,91,255,0.25) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', bottom: '12%', left: '-10%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,107,107,0.18) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', top: '38%', left: '10%', width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(46,213,115,0.15) 0%, transparent 70%)' }} />

      {/* grid texture */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(46,91,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(46,91,255,0.04) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      {/* Logo */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <div style={{ position: 'relative' }}>
          {/* outer pulse ring */}
          <div
            style={{
              position: 'absolute',
              inset: -16,
              borderRadius: '36px',
              border: `2px solid rgba(46,91,255,${pulse ? 0.5 : 0.15})`,
              transition: 'border-color 1.2s ease',
            }}
          />
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: '28px',
              background: 'linear-gradient(145deg, #2E5BFF 0%, #1a38c8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 20px 60px rgba(46,91,255,${pulse ? 0.6 : 0.35}), 0 0 0 1px rgba(255,255,255,0.15)`,
              transition: 'box-shadow 1.2s ease',
            }}
          >
            <span style={{ fontSize: 46, fontWeight: 800, color: '#fff', letterSpacing: '-2px', fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>F</span>
          </div>
          {/* AI dot */}
          <div
            style={{
              position: 'absolute',
              bottom: -6,
              right: -6,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#2ED573',
              border: '3px solid #0B1437',
              boxShadow: `0 0 12px rgba(46,213,115,${pulse ? 0.9 : 0.4})`,
              transition: 'box-shadow 1.2s ease',
            }}
          />
        </div>

        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 44, fontWeight: 800, color: '#fff', letterSpacing: '-2px', margin: '0 0 6px', fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>
            Fitgura
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ height: 1.5, width: 30, background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: 3, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase' }}>AI Powered</span>
            <div style={{ height: 1.5, width: 30, background: 'rgba(255,255,255,0.2)' }} />
          </div>
          <p style={{ fontSize: 19, fontWeight: 500, color: 'rgba(255,255,255,0.8)', margin: 0, direction: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif", letterSpacing: '0.3px' }}>
            בדיוק מה שחיפשת
          </p>
        </div>

        {/* scanning line animation */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(46,213,115,0.1)',
            border: '1px solid rgba(46,213,115,0.3)',
            borderRadius: 12,
            padding: '8px 16px',
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#2ED573',
              boxShadow: `0 0 8px rgba(46,213,115,${pulse ? 1 : 0.3})`,
              transition: 'box-shadow 1.2s ease',
            }}
          />
          <span style={{ fontSize: 12, color: '#2ED573', fontWeight: 600, fontFamily: "'Outfit', sans-serif", letterSpacing: 0.5 }}>AI Fit Engine Active</span>
        </div>
      </div>

      <p style={{ position: 'absolute', bottom: 44, color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: "'Noto Sans Hebrew', sans-serif", zIndex: 1 }}>הקש להתחיל</p>
    </div>
  )
}

/* ─── ONBOARDING ─────────────────────────────────────────────────────────── */

type OnboardStep = 'upload' | 'scanning' | 'result'

// ── Mirrors FitguraAnalysisResponse v2 from fitgura_core.py ──
// measurement_delta is Dict[str, str] in Python v3.1 — keys: top, bottom, fit, frame, summary
type MeasurementDelta = Record<string, string>

interface SizingProfile {
  top: string
  bottom: string
  fit: string
  bodyFrame: string              // Small | Medium | Large | Athletic
  confidence: number
  // tracking-mode fields
  baselineMatched: boolean       // same person as stored baseline?
  isWeeklyUpdate: boolean        // triggered by periodic gallery scan?
  measurementDelta: MeasurementDelta | null   // null on baseline scans
}

interface StyleProfile {
  primaryStyle: string
  secondaryStyle: string
  dominantColors: string[]
  patternPreference: string  // Solid | Patterned | Graphic
  aestheticTags: string[]
}

interface ScannedProductProfile {
  identificationType: string | null   // "Barcode" | "Visual_OCR" | "Visual_ID"
  brand: string | null
  productName: string | null
  exactSku: string | null
  category: string | null            // Smartwatch | Fitness Tracker | Smartphone | Tablet | ...
  compatibleAccessories: string[]    // renamed from compatible_accessories_needed in v3.2
  confidenceScore: number
}

interface ScannedSizes {
  sizing: SizingProfile
  style: StyleProfile
  confidence: number
  preview: string
  // flat aliases kept for backward-compat with existing scan-history rows
  top: string
  bottom: string
  fit: string
}

const TOP_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const BOTTOM_SIZES = ['28', '30', '32', '34', '36', '38']
const FIT_TYPES = ['Slim Fit', 'Regular', 'Relaxed', 'Athletic']

const BODY_FRAMES   = ['Small', 'Medium', 'Large', 'Athletic']
const PRIMARY_STYLES = ['Casual', 'Streetwear', 'Classic', 'Minimalist', 'Smart Casual', 'Athletic']
const SEC_STYLES     = ['Boho', 'Urban', 'Preppy', 'Techwear', 'Resort', 'Business Casual']
const PATTERNS       = ['Solid', 'Patterned', 'Graphic']
const COLOR_PALETTE  = [
  ['#1E293B', '#F1F5F9', '#2E5BFF'],
  ['#7C3AED', '#F5F3FF', '#DDD6FE'],
  ['#DC2626', '#FFF0F0', '#1E293B'],
  ['#D97706', '#FFFBEB', '#78716C'],
  ['#16A34A', '#F0FFF6', '#1E293B'],
  ['#0891B2', '#E0F2FE', '#F1F5F9'],
]
const AESTHETIC_TAGS = [
  ['minimalist', 'monochrome', 'clean lines'],
  ['bold colors', 'statement pieces', 'maximalist'],
  ['streetwear', 'urban', 'oversized'],
  ['classic', 'timeless', 'tailored'],
  ['sporty', 'functional', 'performance'],
  ['eclectic', 'layered', 'textured'],
]

// Weighted random index — deterministic given a seed value
function weightedPick(seed: number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0)
  const r = seed % total
  let acc = 0
  for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (r < acc) return i }
  return weights.length - 1
}

// Tracks whether a baseline scan has been stored this session (mirrors _baseline_store in fitgura_core.py)
let _sessionBaseline: ScannedSizes | null = null

// Simulates the full FitguraAnalysisResponse v2 from fitgura_core.py.
// In production, replace with: await fetch('/baseline') or fetch('/track')
function deriveScannedSizes(file: File): ScannedSizes {
  let hash = file.size
  for (let i = 0; i < file.name.length; i++) hash = (hash * 31 + file.name.charCodeAt(i)) >>> 0

  // — sizing_profile —
  const topWeights = [4, 10, 24, 30, 22, 10]  // XS S M L XL XXL
  const topIdx = weightedPick(hash, topWeights)

  const botVariation = ((hash >> 8) % 3) - 1
  const botIdx = Math.min(BOTTOM_SIZES.length - 1, Math.max(0, topIdx + botVariation))

  const fitWeightsBySize: number[][] = [
    [45, 35, 0, 20],  // XS
    [45, 35, 0, 20],  // S
    [25, 35, 20, 20], // M
    [0, 40, 30, 30],  // L
    [0, 30, 50, 20],  // XL
    [0, 30, 50, 20],  // XXL
  ]
  const fitIdx = weightedPick((hash >> 4), fitWeightsBySize[topIdx])

  // body_frame_estimate correlated with top size
  const frameMap = [0, 0, 1, 2, 3, 2]  // Small Small Medium Large Athletic Large
  const bodyFrameIdx = frameMap[topIdx]

  const sizingConf = 88 + ((hash >> 16) % 10)

  // — style_profile —
  const styleIdx    = (hash >> 20) % PRIMARY_STYLES.length
  const secStyleIdx = ((hash >> 24) + styleIdx + 1) % SEC_STYLES.length
  const colorIdx    = (hash >> 12) % COLOR_PALETTE.length
  const patternIdx  = weightedPick((hash >> 6), [60, 25, 15])  // mostly Solid
  const tagIdx      = (hash >> 18) % AESTHETIC_TAGS.length

  const isTracking = _sessionBaseline !== null
  const prev = _sessionBaseline?.sizing

  // compute measurement delta (mirrors _compute_delta in fitgura_core.py)
  let measurementDelta: MeasurementDelta | null = null
  if (isTracking && prev) {
    const newTop = TOP_SIZES[topIdx], newBot = BOTTOM_SIZES[botIdx]
    const newFit = FIT_TYPES[fitIdx], newFrame = BODY_FRAMES[bodyFrameIdx]
    const changes: string[] = []
    const topChange    = prev.top    !== newTop    ? `${prev.top} → ${newTop}`       : null
    const bottomChange = prev.bottom !== newBot    ? `${prev.bottom} → ${newBot}`    : null
    const fitChange    = prev.fit    !== newFit    ? `${prev.fit} → ${newFit}`       : null
    const frameChange  = prev.bodyFrame !== newFrame ? `${prev.bodyFrame} → ${newFrame}` : null
    if (topChange)    changes.push(`חולצה: ${topChange}`)
    if (bottomChange) changes.push(`מכנסיים: ${bottomChange}`)
    if (fitChange)    changes.push(`גזרה: ${fitChange}`)
    if (frameChange)  changes.push(`מסגרת: ${frameChange}`)
    measurementDelta = {
      ...(topChange    && { top:    topChange }),
      ...(bottomChange && { bottom: bottomChange }),
      ...(fitChange    && { fit:    fitChange }),
      ...(frameChange  && { frame:  frameChange }),
      summary: changes.length > 0 ? `זוהו שינויים: ${changes.join(' | ')}` : 'לא זוהו שינויים מהסריקה הקודמת.',
    }
  }

  const sizing: SizingProfile = {
    top: TOP_SIZES[topIdx],
    bottom: BOTTOM_SIZES[botIdx],
    fit: FIT_TYPES[fitIdx],
    bodyFrame: BODY_FRAMES[bodyFrameIdx],
    confidence: sizingConf,
    baselineMatched: isTracking,
    isWeeklyUpdate: false,
    measurementDelta,
  }

  const style: StyleProfile = {
    primaryStyle: PRIMARY_STYLES[styleIdx],
    secondaryStyle: SEC_STYLES[secStyleIdx],
    dominantColors: COLOR_PALETTE[colorIdx] ?? [],
    patternPreference: PATTERNS[patternIdx],
    aestheticTags: AESTHETIC_TAGS[tagIdx] ?? [],
  }

  const result: ScannedSizes = {
    sizing,
    style,
    confidence: sizingConf,
    preview: URL.createObjectURL(file),
    top: sizing.top,
    bottom: sizing.bottom,
    fit: sizing.fit,
  }

  // save as baseline if first scan this session
  if (!isTracking) _sessionBaseline = result

  return result
}

function OnboardingScreen({ onNext }: { onNext: () => void }) {
  const [step, setStep] = useState<OnboardStep>('upload')
  const [scanProgress, setScanProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [sizes, setSizes] = useState<ScannedSizes | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)

  function startScan(file: File) {
    setSizes(deriveScannedSizes(file))
    setStep('scanning')
    setScanProgress(0)
    const interval = setInterval(() => {
      setScanProgress((p) => {
        if (p >= 100) { clearInterval(interval); setStep('result'); return 100 }
        return p + 2.5
      })
    }, 60)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) startScan(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) startScan(file)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '844px', direction: 'rtl', background: '#F8FAFC' }}>
      {/* Header */}
      <div style={{ padding: '52px 24px 24px', background: 'linear-gradient(160deg, #0B1437 0%, #1A2F7A 100%)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {(['upload', 'scanning', 'result'] as OnboardStep[]).map((_s, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: step === 'upload' ? (i === 0 ? '#2E5BFF' : 'rgba(255,255,255,0.2)') : step === 'scanning' ? (i <= 1 ? '#2E5BFF' : 'rgba(255,255,255,0.2)') : '#2ED573', transition: 'background 0.5s' }} />
          ))}
        </div>
        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 6px', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
          {step === 'upload' ? 'סריקת AI אישית' : step === 'scanning' ? 'סורק מידות...' : 'סריקה הושלמה ✓'}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: 0, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
          {step === 'upload' ? 'העלה תמונה וה-AI ימצא את המידה המדויקת שלך' : step === 'scanning' ? 'בינה מלאכותית מנתחת את מבנה הגוף שלך' : 'אישור מידות ופרופיל מוכן'}
        </p>
      </div>

      {/* Hidden file inputs — one for gallery, one for live camera */}
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />

      <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {step === 'upload' && (
          <>
            {/* Onboarding explanation */}
            <div style={{ background: 'linear-gradient(135deg, #0B1437, #1A2F7A)', borderRadius: 20, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(46,91,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🤳</div>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>העלה תמונה של הגוף שלך</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>כדי שנוכל להתאים מוצרים בדיוק למידות שלך</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { icon: '📐', text: 'AI ינתח את המידות שלך ויתאים מוצרים בדיוק לגוף שלך' },
                  { icon: '🔄', text: 'המערכת תסרוק את הגלריה שלך כל שבוע ותעדכן את המידות אוטומטית' },
                  { icon: '🎯', text: 'ככל שתעלה יותר תמונות — הדיוק של ההתאמות ישתפר' },
                ].map(({ icon, text }) => (
                  <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: "'Noto Sans Hebrew', sans-serif", lineHeight: 1.5 }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? '#2E5BFF' : '#CBD5E1'}`,
                borderRadius: 24,
                padding: '36px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                background: dragOver ? '#EEF2FF' : '#fff',
                transition: 'all 0.2s',
                minHeight: 200,
                justifyContent: 'center',
              }}
            >
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
                📸
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#1E293B', fontSize: 16, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>העלה תמונת גוף מלאה</p>
                <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>גרור לכאן, או בחר אחת מהכפתורים למטה</p>
              </div>
              {/* Full-body photo tip */}
              <div style={{ background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)', borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', boxSizing: 'border-box', border: '1px solid rgba(245,158,11,0.3)' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                <p style={{ margin: 0, fontSize: 12, color: '#92400E', lineHeight: 1.5, fontFamily: "'Noto Sans Hebrew', sans-serif", textAlign: 'right' }}>
                  לתוצאה מדויקת — העלה תמונה של <strong>כל הגוף</strong> מהראש עד הרגליים, עמידה ישרה, על רקע בהיר.
                </p>
              </div>

              {/* Two action buttons — distinct inputs */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => cameraRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'linear-gradient(135deg, #2E5BFF, #1a38c8)',
                    color: '#fff', border: 'none', borderRadius: 12,
                    padding: '10px 18px', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif",
                    boxShadow: '0 4px 12px rgba(46,91,255,0.35)',
                  }}
                >
                  <span>📷</span> צלם עכשיו
                </button>
                <button
                  onClick={() => galleryRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: '#F1F5F9', color: '#475569', border: '1.5px solid #E2E8F0',
                    borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif",
                  }}
                >
                  <span>🖼️</span> מגלריה
                </button>
              </div>
            </div>

            {/* What AI detects */}
            <div style={{ background: '#fff', borderRadius: 20, padding: '18px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>מה ה-AI סורק:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { icon: '📐', label: 'מידות גוף' },
                  { icon: '👔', label: 'גזרה מועדפת' },
                  { icon: '📏', label: 'פרופורציות' },
                  { icon: '🔄', label: 'עדכון אוטומטי' },
                ].map(({ icon, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', borderRadius: 12, padding: '10px 12px' }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <span style={{ fontSize: 13, color: '#475569', fontWeight: 500, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 'scanning' && <ScanningView progress={scanProgress} sizes={sizes} />}

        {step === 'result' && <ResultView onNext={onNext} sizes={sizes!} />}
      </div>
    </div>
  )
}

function ScanningView({ progress, sizes }: { progress: number; sizes: ScannedSizes | null }) {
  const [beamY, setBeamY] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setBeamY((y) => (y + 2) % 100), 30)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      {/* Scanning frame */}
      <div
        style={{
          width: '100%',
          height: 280,
          borderRadius: 24,
          background: 'linear-gradient(160deg, #0B1437, #1a2f7a)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* uploaded photo as scan target */}
        {sizes?.preview ? (
          <img src={sizes.preview} alt="scan target" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(46,91,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(46,91,255,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        )}

        {/* overlay grid on top of photo */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(11,20,55,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(11,20,55,0.45) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        {/* measurement overlay lines */}
        <svg width="100%" height="100%" viewBox="0 0 280 280" fill="none" style={{ position: 'absolute', inset: 0 }}>
          <line x1="20" y1="80" x2="260" y2="80" stroke="rgba(46,213,115,0.6)" strokeWidth="1.5" strokeDasharray="6 4" />
          <line x1="20" y1="140" x2="260" y2="140" stroke="rgba(46,213,115,0.6)" strokeWidth="1.5" strokeDasharray="6 4" />
          <line x1="20" y1="200" x2="260" y2="200" stroke="rgba(46,213,115,0.6)" strokeWidth="1.5" strokeDasharray="6 4" />
          <text x="6" y="78" fontSize="9" fill="rgba(46,213,115,0.8)" fontFamily="monospace">shoulder</text>
          <text x="6" y="138" fontSize="9" fill="rgba(46,213,115,0.8)" fontFamily="monospace">waist</text>
          <text x="6" y="198" fontSize="9" fill="rgba(46,213,115,0.8)" fontFamily="monospace">hip</text>
        </svg>

        {/* scan beam */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${beamY}%`,
            height: 3,
            background: 'linear-gradient(90deg, transparent, rgba(46,213,115,0.9), transparent)',
            boxShadow: '0 0 16px rgba(46,213,115,0.6)',
          }}
        />

        {/* corner brackets */}
        {[['top: 12px', 'right: 12px', 'borderTop', 'borderRight'],
          ['top: 12px', 'left: 12px', 'borderTop', 'borderLeft'],
          ['bottom: 12px', 'right: 12px', 'borderBottom', 'borderRight'],
          ['bottom: 12px', 'left: 12px', 'borderBottom', 'borderLeft']].map((corners, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 24,
              height: 24,
              ...(Object.fromEntries(corners.slice(0, 2).map((c) => c.split(': ')))),
              borderTop: corners[2] === 'borderTop' ? '2px solid #2ED573' : 'none',
              borderBottom: corners[2] === 'borderBottom' ? '2px solid #2ED573' : 'none',
              borderRight: corners[3] === 'borderRight' ? '2px solid #2ED573' : 'none',
              borderLeft: corners[3] === 'borderLeft' ? '2px solid #2ED573' : 'none',
            }}
          />
        ))}
      </div>

      {/* Progress */}
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>מנתח מידות גוף...</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #2E5BFF, #2ED573)', borderRadius: 4, transition: 'width 0.06s linear' }} />
        </div>
      </div>

      {/* live metrics — mirrors FitguraAnalysisResponse sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
        {[
          { label: 'sizing_profile', sub: 'מידות גוף', value: progress > 25 ? `${sizes?.sizing?.top ?? 'M'} / ${sizes?.sizing?.bottom ?? '32'}` : '...', done: progress > 25 },
          { label: 'body_frame', sub: 'מסגרת גוף', value: progress > 50 ? (sizes?.sizing?.bodyFrame ?? 'Medium') : '...', done: progress > 50 },
          { label: 'style_profile', sub: 'סגנון', value: progress > 70 ? (sizes?.style?.primaryStyle ?? 'Casual') : '...', done: progress > 70 },
          { label: 'fit_preference', sub: 'גזרה', value: progress > 88 ? (sizes?.sizing?.fit?.split(' ')[0] ?? 'Regular') : '...', done: progress > 88 },
        ].map(({ label, sub, value, done }) => (
          <div key={label} style={{ background: done ? '#F0FFF6' : '#F8FAFC', borderRadius: 14, padding: '10px 12px', textAlign: 'center', border: `1.5px solid ${done ? 'rgba(46,213,115,0.4)' : '#E2E8F0'}`, transition: 'all 0.4s' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: done ? '#16A34A' : '#94A3B8', fontFamily: "'Outfit', sans-serif", transition: 'color 0.4s' }}>{value}</p>
            <p style={{ margin: '2px 0 0', fontSize: 9, color: '#94A3B8', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px' }}>{label}</p>
            <p style={{ margin: '1px 0 0', fontSize: 10, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultView({ onNext, sizes }: { onNext: () => void; sizes: ScannedSizes }) {
  const [editing, setEditing] = useState(false)
  const [topSize, setTopSize] = useState(sizes.sizing.top)
  const [bottomSize, setBottomSize] = useState(sizes.sizing.bottom)
  const [fitType, setFitType] = useState(sizes.sizing.fit)
  const s = sizes.style ?? { primaryStyle: '', secondaryStyle: '', dominantColors: [] as string[], patternPreference: '', aestheticTags: [] as string[] }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* banner */}
      <div style={{ background: sizes.sizing.baselineMatched ? 'linear-gradient(135deg, #EEF2FF, #E0E7FF)' : 'linear-gradient(135deg, #F0FFF6, #DCFCE7)', borderRadius: 20, padding: '18px', border: `1.5px solid ${sizes.sizing.baselineMatched ? 'rgba(46,91,255,0.3)' : 'rgba(46,213,115,0.4)'}`, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {sizes.preview && (
          <img src={sizes.preview} alt="scanned" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${sizes.sizing.baselineMatched ? '#2E5BFF' : '#2ED573'}`, display: 'block', margin: '0 auto 10px' }} />
        )}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ background: sizes.sizing.baselineMatched ? '#2E5BFF' : '#2ED573', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 8px', fontFamily: "'Outfit', sans-serif" }}>
            {sizes.sizing.baselineMatched ? '🔄 TRACKING MODE' : '📸 BASELINE SCAN'}
          </span>
          {sizes.sizing.isWeeklyUpdate && <span style={{ background: '#7C3AED', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 8px', fontFamily: "'Outfit', sans-serif" }}>WEEKLY UPDATE</span>}
        </div>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 17, color: sizes.sizing.baselineMatched ? '#1E3A8A' : '#15803D', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>ניתוח AI הושלם ✓</p>
        <p style={{ margin: 0, fontSize: 12, color: sizes.sizing.baselineMatched ? '#3B82F6' : '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>דיוק {sizes.sizing.confidence}% · מסגרת גוף: {sizes.sizing.bodyFrame}</p>
      </div>

      {/* measurement_delta card — shown on tracking scans */}
      {sizes.sizing.measurementDelta && (
        <div style={{ background: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)', border: '1.5px solid #E0E7FF' }}>
          <p style={{ margin: '0 0 10px', fontWeight: 700, color: '#1E293B', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>📊 שינויים מהסריקה הקודמת</p>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#475569', fontFamily: "'Noto Sans Hebrew', sans-serif", lineHeight: 1.5 }}>{sizes.sizing.measurementDelta.summary}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'חולצה', val: sizes.sizing.measurementDelta.top ?? null },
              { label: 'מכנסיים', val: sizes.sizing.measurementDelta.bottom ?? null },
              { label: 'גזרה', val: sizes.sizing.measurementDelta.fit ?? null },
              { label: 'מסגרת', val: sizes.sizing.measurementDelta.frame ?? null },
            ].filter(({ val }) => val).map(({ label, val }) => (
              <div key={label} style={{ background: '#EEF2FF', borderRadius: 8, padding: '4px 10px', display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{label}:</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* sizing_profile */}
      <div style={{ background: '#fff', borderRadius: 20, padding: '16px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#1E293B', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>📐 פרופיל מידות</p>
          <button
            onClick={() => setEditing(!editing)}
            style={{ background: editing ? '#2E5BFF' : '#EEF2FF', border: 'none', borderRadius: 8, padding: '5px 12px', color: editing ? '#fff' : '#2E5BFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif" }}
          >
            {editing ? 'שמור' : 'ערוך מידות'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'חולצה', value: topSize, options: TOP_SIZES, set: setTopSize },
            { label: 'מכנסיים', value: bottomSize, options: BOTTOM_SIZES, set: setBottomSize },
            { label: 'גזרה', value: fitType, options: FIT_TYPES, set: setFitType },
          ].map(({ label, value, options, set }) => (
            <div key={label} style={{ background: '#F8FAFC', borderRadius: 12, padding: '10px 6px', textAlign: 'center', border: editing ? '2px solid #2E5BFF' : '1.5px solid #E2E8F0', transition: 'border 0.2s' }}>
              {editing ? (
                <select value={value} onChange={(e) => set(e.target.value)} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: '#2E5BFF', textAlign: 'center', width: '100%', fontFamily: "'Outfit', sans-serif", outline: 'none' }}>
                  {options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>{value}</p>
              )}
              <p style={{ margin: '3px 0 0', fontSize: 10, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* style_profile */}
      <div style={{ background: '#fff', borderRadius: 20, padding: '16px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
        <p style={{ margin: '0 0 12px', fontWeight: 700, color: '#1E293B', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>🎨 פרופיל סגנון</p>

        {/* primary + secondary style */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, background: '#EEF2FF', borderRadius: 12, padding: '10px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>{s.primaryStyle}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>סגנון ראשי</p>
          </div>
          <div style={{ flex: 1, background: '#F8FAFC', borderRadius: 12, padding: '10px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#475569', fontFamily: "'Outfit', sans-serif" }}>{s.secondaryStyle}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>סגנון משני</p>
          </div>
        </div>

        {/* dominant colors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif", flexShrink: 0 }}>צבעים דומיננטים:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(s.dominantColors ?? []).map((c) => (
              <div key={c} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: '2px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }} title={c} />
            ))}
          </div>
          <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: "'Outfit', sans-serif" }}>{s.patternPreference}</span>
        </div>

        {/* aesthetic tags */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(s.aestheticTags ?? []).map((tag) => (
            <span key={tag} style={{ background: '#F1F5F9', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#475569', fontFamily: "'Outfit', sans-serif" }}>#{tag}</span>
          ))}
        </div>
      </div>

      <button
        onClick={onNext}
        style={{ padding: '16px', borderRadius: 18, border: 'none', background: 'linear-gradient(135deg, #2E5BFF, #1a38c8)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif", boxShadow: '0 8px 24px rgba(46,91,255,0.4)' }}
      >
        אשר פרופיל ועבור לפיד
      </button>
    </div>
  )
}

/* ─── DEVICE DETECTION ───────────────────────────────────────────────────── */

const deviceOptions = [
  { name: 'iPhone 16 Pro Max', chip: 'A18 Pro', year: '2024', brand: 'Apple' },
  { name: 'iPhone 16 Pro', chip: 'A18 Pro', year: '2024', brand: 'Apple' },
  { name: 'iPhone 16', chip: 'A18', year: '2024', brand: 'Apple' },
  { name: 'iPhone 15 Pro Max', chip: 'A17 Pro', year: '2023', brand: 'Apple' },
  { name: 'iPhone 15 Pro', chip: 'A17 Pro', year: '2023', brand: 'Apple' },
  { name: 'iPhone 15', chip: 'A16 Bionic', year: '2023', brand: 'Apple' },
  { name: 'iPhone 14 Pro', chip: 'A16 Bionic', year: '2022', brand: 'Apple' },
  { name: 'iPhone 14', chip: 'A15 Bionic', year: '2022', brand: 'Apple' },
  { name: 'iPhone 13', chip: 'A15 Bionic', year: '2021', brand: 'Apple' },
  { name: 'Galaxy S25 Ultra', chip: 'Snapdragon 8 Elite', year: '2025', brand: 'Samsung' },
  { name: 'Galaxy S25+', chip: 'Snapdragon 8 Elite', year: '2025', brand: 'Samsung' },
  { name: 'Galaxy S24 Ultra', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Samsung' },
  { name: 'Galaxy S24+', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Samsung' },
  { name: 'Galaxy S24', chip: 'Exynos 2400', year: '2024', brand: 'Samsung' },
  { name: 'Galaxy S23', chip: 'Snapdragon 8 Gen 2', year: '2023', brand: 'Samsung' },
  { name: 'Galaxy A55', chip: 'Exynos 1480', year: '2024', brand: 'Samsung' },
  { name: 'Galaxy A35', chip: 'Exynos 1380', year: '2024', brand: 'Samsung' },
  { name: 'Pixel 9 Pro', chip: 'Google Tensor G4', year: '2024', brand: 'Google' },
  { name: 'Pixel 9', chip: 'Google Tensor G4', year: '2024', brand: 'Google' },
  { name: 'Pixel 8 Pro', chip: 'Google Tensor G3', year: '2023', brand: 'Google' },
  { name: 'Xiaomi 14 Ultra', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Xiaomi' },
  { name: 'Xiaomi 14', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Xiaomi' },
  { name: 'Xiaomi 13T Pro', chip: 'Dimensity 9200+', year: '2023', brand: 'Xiaomi' },
  { name: 'Redmi Note 13 Pro', chip: 'Snapdragon 7s Gen 2', year: '2024', brand: 'Xiaomi' },
  { name: 'OnePlus 12', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'OnePlus' },
  { name: 'OnePlus 12R', chip: 'Snapdragon 8 Gen 1', year: '2024', brand: 'OnePlus' },
  { name: 'OnePlus Nord 4', chip: 'Snapdragon 7+ Gen 3', year: '2024', brand: 'OnePlus' },
  { name: 'OPPO Find X8 Pro', chip: 'Dimensity 9400', year: '2024', brand: 'OPPO' },
  { name: 'Motorola Edge 50 Pro', chip: 'Snapdragon 7 Gen 3', year: '2024', brand: 'Motorola' },
  { name: 'Sony Xperia 1 VI', chip: 'Snapdragon 8 Gen 3', year: '2024', brand: 'Sony' },
]

function DeviceDetectionScreen({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState<'detecting' | 'confirmed'>('detecting')
  const [scanPct, setScanPct] = useState(0)
  const [changing, setChanging] = useState(false)
  const [selected, setSelected] = useState(0)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [customBrand, setCustomBrand] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customYear, setCustomYear] = useState('')
  const detected = deviceOptions[0]

  const filteredDevices = deviceOptions.filter((d) => {
    const q = deviceSearch.toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q) || d.chip.toLowerCase().includes(q)
  })

  useEffect(() => {
    if (phase !== 'detecting') return
    const t = setInterval(() => {
      setScanPct((p) => {
        if (p >= 100) { clearInterval(t); setTimeout(() => setPhase('confirmed'), 300); return 100 }
        return p + 4
      })
    }, 60)
    return () => clearInterval(t)
  }, [phase])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '844px', direction: 'rtl', background: '#F8FAFC' }}>
      {/* Header */}
      <div style={{ padding: '52px 24px 24px', background: 'linear-gradient(160deg, #0B1437 0%, #1A2F7A 100%)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < 2 ? '#2ED573' : (phase === 'confirmed' ? '#2ED573' : '#2E5BFF'), transition: 'background 0.5s' }} />
          ))}
        </div>
        <h2 style={{ color: '#fff', fontSize: 21, fontWeight: 700, margin: '0 0 6px', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
          {phase === 'detecting' ? 'מזהה את המכשיר שלך...' : 'זיהינו את סוג מכשיר הטלפון שלך!'}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: 0, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
          {phase === 'detecting' ? 'AI סורק את פרטי הסביבה שלך' : 'ההתאמה לאביזרים הושלמה אוטומטית'}
        </p>
      </div>

      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Detecting phase */}
        {phase === 'detecting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, paddingTop: 20 }}>
            {/* Animated phone silhouette */}
            <div style={{ position: 'relative', width: 140, height: 240 }}>
              {/* Outer glow ring */}
              <div style={{
                position: 'absolute', inset: -20,
                borderRadius: 44,
                background: `conic-gradient(#2E5BFF ${scanPct * 3.6}deg, rgba(46,91,255,0.08) 0deg)`,
                transition: 'background 0.06s linear',
              }} />
              {/* Phone body */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(160deg, #1E293B, #0F172A)',
                borderRadius: 28,
                border: '2px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {/* screen scan lines */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 6px, rgba(46,91,255,0.06) 6px, rgba(46,91,255,0.06) 7px)' }} />
                {/* scan beam */}
                <div style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${scanPct}%`,
                  height: 2,
                  background: 'linear-gradient(90deg, transparent, #2ED573, transparent)',
                  boxShadow: '0 0 12px rgba(46,213,115,0.8)',
                  transition: 'top 0.06s linear',
                }} />
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ position: 'relative', zIndex: 1, opacity: 0.5 }}>
                  <rect x="8" y="4" width="32" height="40" rx="6" stroke="#2E5BFF" strokeWidth="2" fill="none" />
                  <rect x="18" y="7" width="12" height="3" rx="1.5" fill="#2E5BFF" opacity="0.6" />
                  <circle cx="24" cy="38" r="2" fill="#2E5BFF" opacity="0.6" />
                </svg>
                {/* dynamic label */}
                <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center' }}>
                  <span style={{ fontSize: 10, color: 'rgba(46,213,115,0.8)', fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>
                    {scanPct < 35 ? 'Reading signals...' : scanPct < 70 ? 'Matching model...' : 'Verifying...'}
                  </span>
                </div>
              </div>
              {/* notch */}
              <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 36, height: 6, background: '#0F172A', borderRadius: 3 }} />
            </div>

            {/* Progress */}
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>מזהה דגם מכשיר...</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>{scanPct}%</span>
              </div>
              <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${scanPct}%`, background: 'linear-gradient(90deg, #2E5BFF, #2ED573)', borderRadius: 4, transition: 'width 0.06s linear' }} />
              </div>
            </div>

            {/* Detection signals */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'חיישן סביבה', done: scanPct > 20 },
                { label: 'זיהוי רשת ואות', done: scanPct > 50 },
                { label: 'התאמת דגם', done: scanPct > 80 },
              ].map(({ label, done }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 12, padding: '10px 14px', border: `1.5px solid ${done ? 'rgba(46,213,115,0.4)' : '#F1F5F9'}`, transition: 'border 0.4s' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: done ? '#2ED573' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, transition: 'background 0.4s', flexShrink: 0 }}>
                    {done ? '✓' : ''}
                  </div>
                  <span style={{ fontSize: 13, color: done ? '#15803D' : '#94A3B8', fontWeight: done ? 600 : 400, fontFamily: "'Noto Sans Hebrew', sans-serif", transition: 'color 0.4s' }}>{label}</span>
                  {done && <div style={{ marginRight: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#2ED573' }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirmed phase */}
        {phase === 'confirmed' && !changing && (
          <>
            {/* Device card */}
            <div style={{
              background: 'linear-gradient(145deg, #0B1437 0%, #1E3A8A 100%)',
              borderRadius: 28,
              padding: '28px 24px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(46,91,255,0.3)',
            }}>
              {/* ambient glow */}
              <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(46,213,115,0.2) 0%, transparent 70%)' }} />
              <div style={{ position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(46,91,255,0.3) 0%, transparent 70%)' }} />

              <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 18, alignItems: 'center' }}>
                {/* Phone icon */}
                <div style={{
                  width: 80,
                  height: 130,
                  background: 'linear-gradient(160deg, #1E293B, #0F172A)',
                  borderRadius: 18,
                  border: '1.5px solid rgba(255,255,255,0.12)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  position: 'relative',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ position: 'absolute', top: 8, width: 24, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="2" width="24" height="28" rx="5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" fill="none" />
                    <circle cx="16" cy="26" r="1.5" fill="rgba(255,255,255,0.4)" />
                  </svg>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontFamily: "'Outfit', sans-serif" }}>Pro</span>
                  <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #2ED573, #16A34A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 4px 12px rgba(46,213,115,0.5)' }}>✓</div>
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ background: 'rgba(46,213,115,0.15)', border: '1px solid rgba(46,213,115,0.35)', borderRadius: 8, padding: '4px 10px', display: 'inline-block', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#2ED573', fontFamily: "'Outfit', sans-serif" }}>✓ זוהה אוטומטית</span>
                  </div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', fontFamily: "'Outfit', sans-serif" }}>{detected.name}</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: "'Outfit', sans-serif" }}>{detected.chip} · {detected.year}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['כיסויים', 'מגיני מסך', 'טעינה אלחוטית'].map((tag) => (
                      <div key={tag} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 7, padding: '4px 9px', fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{tag}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Match badge */}
            <div style={{
              background: '#F0FFF6',
              border: '1.5px solid rgba(46,213,115,0.4)',
              borderRadius: 18,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #2ED573, #16A34A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🛡️</div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#15803D', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>התאמה מלאה לאביזרי מגן, כיסויים וטעינה</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>כל המוצרים בפיד מסוננים לדגם שלך</p>
              </div>
            </div>

            {/* Accessory preview */}
            <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>אביזרים תואמים שנמצאו:</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { icon: '📱', label: 'כיסויים', count: 48 },
                  { icon: '🛡️', label: 'מגני מסך', count: 23 },
                  { icon: '⚡', label: 'טעינה', count: 31 },
                ].map(({ icon, label, count }) => (
                  <div key={label} style={{ flex: 1, background: '#F8FAFC', borderRadius: 14, padding: '12px 8px', textAlign: 'center', border: '1.5px solid #E2E8F0' }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>{count}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
              <button
                onClick={onNext}
                style={{
                  padding: '18px',
                  borderRadius: 20,
                  border: 'none',
                  background: 'linear-gradient(135deg, #2E5BFF 0%, #1a38c8 100%)',
                  color: '#fff',
                  fontSize: 17,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: "'Noto Sans Hebrew', sans-serif",
                  boxShadow: '0 8px 24px rgba(46,91,255,0.4)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(46,91,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(46,91,255,0.4)' }}
              >
                המשך לפיד ההתאמות
              </button>
              <button
                onClick={() => setChanging(true)}
                style={{
                  padding: '14px',
                  borderRadius: 16,
                  border: 'none',
                  background: 'transparent',
                  color: '#94A3B8',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Noto Sans Hebrew', sans-serif",
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                החלף מכשיר / דגם אחר
              </button>
            </div>
          </>
        )}

        {/* Manual change panel */}
        {phase === 'confirmed' && changing && (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>בחר דגם ידנית:</p>

            {/* Search box */}
            {!customMode && (
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
                <input
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                  placeholder="חפש לפי שם, יצרן, שבב..."
                  style={{ width: '100%', padding: '12px 42px 12px 14px', borderRadius: 14, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif", outline: 'none', background: '#F8FAFC', color: '#1E293B', boxSizing: 'border-box', direction: 'rtl' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                />
              </div>
            )}

            {/* Device list OR custom form */}
            {customMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#EEF2FF', borderRadius: 18, padding: '18px 16px', border: '2px solid #2E5BFF' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>הזן את פרטי המכשיר שלך:</p>
                <input value={customBrand} onChange={(e) => setCustomBrand(e.target.value)} placeholder="יצרן (Apple, Samsung, Xiaomi...)" style={{ padding: '11px 14px', borderRadius: 12, border: '1.5px solid #C7D2FE', fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff', color: '#1E293B' }} onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }} onBlur={(e) => { e.currentTarget.style.borderColor = '#C7D2FE' }} />
                <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="דגם (Galaxy A54, Redmi 12...)" style={{ padding: '11px 14px', borderRadius: 12, border: '1.5px solid #C7D2FE', fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff', color: '#1E293B' }} onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }} onBlur={(e) => { e.currentTarget.style.borderColor = '#C7D2FE' }} />
                <input value={customYear} onChange={(e) => setCustomYear(e.target.value)} placeholder="שנת ייצור (2023, 2024...)" style={{ padding: '11px 14px', borderRadius: 12, border: '1.5px solid #C7D2FE', fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff', color: '#1E293B' }} onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }} onBlur={(e) => { e.currentTarget.style.borderColor = '#C7D2FE' }} />
                <button onClick={() => setCustomMode(false)} style={{ background: 'none', border: 'none', color: '#2E5BFF', fontSize: 13, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif", textDecoration: 'underline', textAlign: 'right' }}>← חזור לרשימה</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', maxHeight: 320 }}>
                {filteredDevices.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif", fontSize: 13 }}>
                    לא נמצאו תוצאות ל-"{deviceSearch}"
                  </div>
                ) : (
                  filteredDevices.map((d, i) => {
                    const realIdx = deviceOptions.indexOf(d)
                    return (
                      <button
                        key={realIdx}
                        onClick={() => { setSelected(realIdx); setCustomMode(false) }}
                        style={{ padding: '12px 16px', borderRadius: 14, border: `2px solid ${selected === realIdx ? '#2E5BFF' : '#E2E8F0'}`, background: selected === realIdx ? '#EEF2FF' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', transition: 'all 0.15s' }}
                      >
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontWeight: 600, color: selected === realIdx ? '#2E5BFF' : '#1E293B', fontSize: 13, fontFamily: "'Outfit', sans-serif" }}>{d.name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Outfit', sans-serif" }}>{d.brand} · {d.chip} · {d.year}</p>
                        </div>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected === realIdx ? '#2E5BFF' : '#CBD5E1'}`, background: selected === realIdx ? '#2E5BFF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selected === realIdx && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                        </div>
                      </button>
                    )
                  })
                )}

                {/* Not found row */}
                <button
                  onClick={() => { setCustomMode(true); setDeviceSearch('') }}
                  style={{ padding: '12px 16px', borderRadius: 14, border: '2px dashed #CBD5E1', background: '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, direction: 'rtl', marginTop: 4 }}
                >
                  <span style={{ fontSize: 18 }}>➕</span>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#475569', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>המכשיר שלי לא ברשימה</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>הזן פרטים ידנית</p>
                  </div>
                </button>
              </div>
            )}

            <button
              onClick={onNext}
              disabled={customMode && (!customBrand || !customModel)}
              style={{ padding: '18px', borderRadius: 20, border: 'none', background: customMode && (!customBrand || !customModel) ? '#E2E8F0' : 'linear-gradient(135deg, #2E5BFF, #1a38c8)', color: customMode && (!customBrand || !customModel) ? '#94A3B8' : '#fff', fontSize: 16, fontWeight: 700, cursor: customMode && (!customBrand || !customModel) ? 'not-allowed' : 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif", boxShadow: customMode && (!customBrand || !customModel) ? 'none' : '0 8px 24px rgba(46,91,255,0.4)', transition: 'all 0.2s' }}
            >
              {customMode
                ? `אשר — ${customBrand || 'יצרן'} ${customModel || 'דגם'}`
                : `אשר את ${deviceOptions[selected].name}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── FEED ───────────────────────────────────────────────────────────────── */

const products = [
  { name: 'חולצת לינן קיץ', brand: 'ZARA', price: 189, img: 'photo-1713881842156-3d9ef36418cc', category: 'clothing' },
  { name: "ג'קט דנים קלאסי", brand: "Levi's", price: 349, img: 'photo-1542291026-7eec264c27ff', category: 'clothing' },
  { name: 'כיסוי MagSafe', brand: 'Casetify', price: 129, img: 'photo-1511707171634-5f897ff02aa9', category: 'accessories' },
  { name: "ג'ינס סלים", brand: 'H&M', price: 229, img: 'photo-1542272604-787c3835535d', category: 'clothing' },
  { name: 'סניקרס אוורסום', brand: 'Nike', price: 420, img: 'photo-1542291026-7eec264c27ff', category: 'shoes' },
  { name: 'מגן מסך זכוכית', brand: 'Spigen', price: 79, img: 'photo-1580910051074-3eb694886505', category: 'accessories' },
  { name: 'חולצת פולו', brand: 'Ralph Lauren', price: 279, img: 'photo-1523381210434-271e8be1f52b', category: 'clothing' },
  { name: 'נעלי ריצה', brand: 'Adidas', price: 380, img: 'photo-1542291026-7eec264c27ff', category: 'shoes' },
]

function FeedScreen({
  wishlistItems,
  onToggleWishlist,
  onNav,
  budget,
  setBudget,
  user,
}: {
  wishlistItems: number[]
  onToggleWishlist: (i: number) => void
  onNav: (s: Screen) => void
  budget: [number, number]
  setBudget: (b: [number, number]) => void
  user: User | null
}) {
  const [filter, setFilter] = useState<'all' | 'clothing' | 'shoes' | 'accessories'>('all')
  const [search, setSearch] = useState('')

  const filtered = products.filter((p, _i) => {
    const matchFilter = filter === 'all' || p.category === filter
    const matchSearch = p.name.includes(search) || p.brand.toLowerCase().includes(search.toLowerCase())
    const matchBudget = p.price >= budget[0] && p.price <= budget[1]
    return matchFilter && matchSearch && matchBudget
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '844px', direction: 'rtl', background: '#F8FAFC' }}>
      {/* header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ padding: '52px 20px 0' }}>
          {/* AI status bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ED573', boxShadow: '0 0 6px rgba(46,213,115,0.7)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>סריקה אחרונה: לפני 3 ימים</span>
              {user ? (
                <span style={{ fontSize: 11, background: '#EEF2FF', color: '#2E5BFF', borderRadius: 6, padding: '2px 7px', fontWeight: 600, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>מחובר ✓</span>
              ) : (
                <span style={{ fontSize: 11, background: '#FFF7ED', color: '#EA580C', borderRadius: 6, padding: '2px 7px', fontWeight: 600, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>אורח</span>
              )}
            </div>
            <button
              onClick={() => onNav('profile')}
              style={{
                width: 38, height: 38, borderRadius: '50%',
                background: user ? 'linear-gradient(135deg, #2E5BFF, #FF6B6B)' : 'linear-gradient(135deg, #94A3B8, #64748B)',
                border: user ? '2px solid rgba(46,91,255,0.4)' : '2px solid rgba(148,163,184,0.4)',
                cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 15,
                fontFamily: "'Outfit', sans-serif", flexShrink: 0,
                position: 'relative',
              }}
            >
              {user ? user.name[0] : '👤'}
              {user && (
                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%', background: '#2ED573', border: '2px solid #fff' }} />
              )}
            </button>
          </div>

          <h2 style={{ margin: '0 0 14px', fontSize: 22, fontWeight: 700, color: '#1E293B', letterSpacing: '-0.5px', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>הפיד שלי</h2>

          {/* Budget slider */}
          <BudgetSlider budget={budget} setBudget={setBudget} />

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', borderRadius: 14, padding: '10px 14px', border: '1.5px solid #E2E8F0', margin: '12px 0 12px' }}>
            <span style={{ color: '#94A3B8' }}>🔍</span>
            <input
              placeholder="חפש בגדים, נעליים, אביזרים..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: '#1E293B', outline: 'none', direction: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif" }}
            />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 7, paddingBottom: 14, overflowX: 'auto' }}>
            {[
              { key: 'all', label: 'הכל' },
              { key: 'clothing', label: '👕 בגדים' },
              { key: 'shoes', label: '👟 נעליים' },
              { key: 'accessories', label: '📱 אביזרים' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: filter === key ? '#2E5BFF' : '#F1F5F9',
                  color: filter === key ? '#fff' : '#64748B',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  fontFamily: "'Noto Sans Hebrew', sans-serif",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* AI match summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg, #0B1437, #1A2F7A)', borderRadius: 18, padding: '14px 16px', marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}>🎯</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>Fitgura AI Match פעיל</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>כל הפריטים מסוננים לפי סריקת AI + תקציב</p>
          </div>
          <div style={{ marginRight: 'auto', background: 'rgba(46,213,115,0.2)', borderRadius: 8, padding: '4px 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2ED573', fontFamily: "'Outfit', sans-serif" }}>{filtered.length} פריטים</span>
          </div>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p style={{ color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>אין פריטים בטווח התקציב הנבחר</p>
          </div>
        )}

        {/* Product grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          {filtered.map((product, i) => {
            const globalIdx = products.indexOf(product)
            return (
              <ProductCard
                key={globalIdx}
                product={product}
                inWishlist={wishlistItems.includes(globalIdx)}
                onToggleWishlist={() => onToggleWishlist(globalIdx)}
              />
            )
          })}
        </div>

        {/* Family teaser */}
        <div style={{ background: 'linear-gradient(135deg, #FFF0F0, #FFF5F0)', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(255,107,107,0.2)', marginBottom: 8 }}>
          <span style={{ fontSize: 26 }}>👨‍👩‍👧</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>רוצה לסנכרן גם את בני המשפחה?</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#FB923C', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>סריקת AI לכל הבית — בקרוב</p>
          </div>
          <div style={{ background: 'rgba(255,107,107,0.12)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>בקרוב</div>
        </div>
      </div>

      <BottomNav current="feed" onNav={onNav} />
    </div>
  )
}

function BudgetSlider({ budget, setBudget }: { budget: [number, number]; setBudget: (b: [number, number]) => void }) {
  const MIN = 50
  const MAX = 1000
  const railRef = useRef<HTMLDivElement>(null)

  function getPercent(val: number) { return ((val - MIN) / (MAX - MIN)) * 100 }

  function handleTrackClick(e: React.MouseEvent) {
    if (!railRef.current) return
    const rect = railRef.current.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const val = Math.round((pct * (MAX - MIN) + MIN) / 10) * 10
    const clamped = Math.max(MIN, Math.min(MAX, val))
    const midpoint = (budget[0] + budget[1]) / 2
    if (clamped < midpoint) setBudget([clamped, budget[1]])
    else setBudget([budget[0], clamped])
  }

  return (
    <div style={{ background: '#F8FAFC', borderRadius: 16, padding: '14px 16px', border: '1.5px solid #E2E8F0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>הגדר תקציב</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>₪{budget[0]} – ₪{budget[1]}</span>
      </div>
      <div ref={railRef} style={{ position: 'relative', height: 6, background: '#E2E8F0', borderRadius: 3, cursor: 'pointer' }} onClick={handleTrackClick}>
        <div
          style={{
            position: 'absolute',
            height: '100%',
            left: `${getPercent(budget[0])}%`,
            right: `${100 - getPercent(budget[1])}%`,
            background: 'linear-gradient(90deg, #2E5BFF, #2ED573)',
            borderRadius: 3,
          }}
        />
        {[0, 1].map((idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${getPercent(budget[idx])}%`,
              transform: 'translate(-50%, -50%)',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#fff',
              border: '3px solid #2E5BFF',
              boxShadow: '0 2px 8px rgba(46,91,255,0.3)',
              cursor: 'grab',
              zIndex: 2,
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              const onMove = (me: MouseEvent) => {
                if (!railRef.current) return
                const rect = railRef.current.getBoundingClientRect()
                const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width))
                const val = Math.round((pct * (MAX - MIN) + MIN) / 10) * 10
                if (idx === 0) setBudget([Math.min(val, budget[1] - 50), budget[1]])
                else setBudget([budget[0], Math.max(val, budget[0] + 50)])
              }
              const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        {['₪50', '₪300', '₪600', '₪1000'].map((l) => (
          <span key={l} style={{ fontSize: 10, color: '#CBD5E1', fontFamily: "'Outfit', sans-serif" }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

function ProductCard({ product, inWishlist, onToggleWishlist }: { product: typeof products[0]; inWishlist: boolean; onToggleWishlist: () => void }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', direction: 'rtl' }}>
      <div style={{ position: 'relative', paddingTop: '115%', background: '#F1F5F9' }}>
        <img
          src={`https://images.unsplash.com/${product.img}?w=300&h=345&fit=crop&auto=format`}
          alt={product.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <button
          onClick={(e) => { e.stopPropagation(); onToggleWishlist() }}
          style={{ position: 'absolute', top: 8, left: 8, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
        >
          {inWishlist ? '❤️' : '🤍'}
        </button>
        {/* AI scan badge */}
        <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(11,20,55,0.85)', backdropFilter: 'blur(4px)', borderRadius: 8, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#2ED573' }} />
          <span style={{ fontSize: 9, color: '#fff', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>AI Match</span>
        </div>
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ background: '#F0FFF6', border: '1px solid rgba(46,213,115,0.35)', borderRadius: 7, padding: '3px 7px', marginBottom: 6, display: 'inline-block' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>✓ 100% מתאים למידה שנסרקה</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1E293B', lineHeight: 1.3, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{product.name}</p>
        <p style={{ margin: '2px 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Outfit', sans-serif" }}>{product.brand}</p>
        <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>₪{product.price}</p>
      </div>
    </div>
  )
}

/* ─── PROFILE (AI SCAN HISTORY) ─────────────────────────────────────────── */

const GALLERY_LAST_SCANNED = 'היום בשעה 08:14'
const GALLERY_NEXT_SCAN    = 'בעוד 6 ימים (יום ב׳)'

const scanHistory = [
  {
    date: 'היום', time: '08:14', top: 'M', bottom: '32', fit: 'Slim Fit', confidence: 97,
    thumb: 'photo-1507003211169-0a1dd7228f2d',
    source: 'סריקת גלריה שבועית',
    isWeekly: true, delta: null,
  },
  {
    date: 'לפני 7 ימים', time: '09:15', top: 'M', bottom: '32', fit: 'Regular', confidence: 94,
    thumb: 'photo-1500648767791-00dcc994a43e',
    source: 'סריקת גלריה שבועית',
    isWeekly: true, delta: null,
  },
  {
    date: 'לפני חודש', time: '18:44', top: 'L', bottom: '34', fit: 'Slim Fit', confidence: 89,
    thumb: 'photo-1506794778202-cad84cf45f1d',
    source: 'העלאה ידנית',
    isWeekly: false, delta: { top: 'L → M', bottom: '34 → 32' },
  },
]

interface UserDevice {
  id: number
  type: string   // טלפון | טאבלט | אוזניות | שעון | אחר
  brand: string
  model: string
  extra: string  // size, chip, year etc.
  emoji: string
  primary?: boolean
}

let _devId = 10

function ProfileScreen({ onNav, user }: { onNav: (s: Screen) => void; user: User | null }) {
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [editingSizes, setEditingSizes] = useState(false)
  const [profTop, setProfTop] = useState('M')
  const [profBottom, setProfBottom] = useState('32')
  const [profFit, setProfFit] = useState('Slim Fit')

  const [devices, setDevices] = useState<UserDevice[]>([
    { id: 1, type: 'טלפון', brand: 'Apple', model: 'iPhone 15 Pro', extra: 'A17 Pro · 2023', emoji: '📱', primary: true },
  ])
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [addStep, setAddStep] = useState<'options' | 'scanning' | 'result' | 'form'>('options')
  const [scannedAccessories, setScannedAccessories] = useState<string[]>([])
  const [showDevCameraChoice, setShowDevCameraChoice] = useState(false)
  const [devPhotoUrl, setDevPhotoUrl] = useState<string | null>(null)
  const devCameraInputRef = useRef<HTMLInputElement>(null)
  const devGalleryInputRef = useRef<HTMLInputElement>(null)
  const [addScanProgress, setAddScanProgress] = useState(0)
  const [newDevType, setNewDevType] = useState('טלפון')
  const [newDevBrand, setNewDevBrand] = useState('')
  const [newDevModel, setNewDevModel] = useState('')
  const [newDevExtra, setNewDevExtra] = useState('')

  const DEV_TYPE_EMOJI: Record<string, string> = { 'טלפון': '📱', 'טאבלט': '📟', 'אוזניות': '🎧', 'שעון': '⌚', 'אחר': '🔧' }

  function handleDevPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setDevPhotoUrl(URL.createObjectURL(file))
    setShowDevCameraChoice(false)
    startDeviceScan()
    // reset input so same file can be re-selected
    e.target.value = ''
  }

  function startDeviceScan() {
    setAddStep('scanning')
    setAddScanProgress(0)
    let p = 0
    const t = setInterval(() => {
      p += Math.random() * 18 + 5
      setAddScanProgress(Math.min(p, 100))
      if (p >= 100) {
        clearInterval(t)
        setNewDevBrand('Lenovo')
        setNewDevModel('Tab P12 Pro')
        setNewDevExtra('21" · MediaTek · 2024')
        setNewDevType('טאבלט')
        setScannedAccessories([
          'כיסוי סיליקון 21" Lenovo Tab P12 Pro',
          'מגן מסך זכוכית 9H',
          'עט Lenovo Precision Pen 3',
          'כיסוי מקלדת Bluetooth',
          'כבל USB-C 3.2 Gen2',
        ])
        setAddStep('result')
      }
    }, 180)
  }

  function addDevice() {
    if (!newDevBrand || !newDevModel) return
    setDevices((prev) => [...prev, {
      id: _devId++,
      type: newDevType,
      brand: newDevBrand,
      model: newDevModel,
      extra: newDevExtra,
      emoji: DEV_TYPE_EMOJI[newDevType] ?? '🔧',
    }])
    setShowAddDevice(false)
    setAddStep('options')
    setDevPhotoUrl(null)
    setNewDevBrand(''); setNewDevModel(''); setNewDevExtra(''); setNewDevType('טלפון')
  }

  function removeDevice(id: number) {
    setDevices((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '844px', direction: 'rtl' }}>
      {/* header */}
      <div style={{ padding: '52px 24px 24px', background: 'linear-gradient(160deg, #0B1437 0%, #1A2F7A 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, left: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(46,91,255,0.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#fff', border: '2.5px solid rgba(255,255,255,0.25)', fontFamily: "'Outfit', sans-serif" }}>
            {user ? user.name[0] : '👤'}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
              {user ? user.name : 'אורח'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: user ? '#2ED573' : '#FB923C' }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                {user ? `מחובר • ${user.email}` : 'גלישה כאורח — לחץ לב כדי להתחבר'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {/* Auto-update toggle */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: autoUpdate ? '#F0FFF6' : '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, transition: 'background 0.3s' }}>🔄</div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: '#1E293B', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>עדכון מידות אוטומטי</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>AI מעדכן מתמונות חדשות</p>
            </div>
          </div>
          <button
            onClick={() => setAutoUpdate(!autoUpdate)}
            style={{
              width: 50,
              height: 28,
              borderRadius: 14,
              border: 'none',
              background: autoUpdate ? '#2ED573' : '#E2E8F0',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.3s',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: autoUpdate ? 25 : 3,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'left 0.3s',
              }}
            />
          </button>
        </div>

        {/* Current sizes */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#1E293B', fontSize: 15, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>📐 המידות הנוכחיות</p>
            <button
              onClick={() => setEditingSizes(!editingSizes)}
              style={{ background: editingSizes ? '#2E5BFF' : '#EEF2FF', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: editingSizes ? '#fff' : '#2E5BFF', fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif" }}
            >
              {editingSizes ? 'שמור' : 'ערוך ידנית'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'חולצה', value: profTop, options: TOP_SIZES, set: setProfTop as (v: string) => void },
              { label: 'מכנסיים', value: profBottom, options: BOTTOM_SIZES, set: setProfBottom as (v: string) => void },
              { label: 'גזרה', value: profFit, options: FIT_TYPES, set: setProfFit as (v: string) => void },
            ].map(({ label, value, options, set }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px', textAlign: 'center', border: `1.5px solid ${editingSizes ? '#2E5BFF' : '#E2E8F0'}`, transition: 'border 0.2s' }}>
                {editingSizes ? (
                  <select
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    style={{ border: 'none', background: 'transparent', fontSize: 15, fontWeight: 700, color: '#2E5BFF', textAlign: 'center', width: '100%', fontFamily: "'Outfit', sans-serif", outline: 'none', cursor: 'pointer' }}
                  >
                    {options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>{value}</p>
                )}
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* My Devices */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#1E293B', fontSize: 15, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>📱 המכשירים שלי</p>
            <button
              onClick={() => { setShowAddDevice(true); setAddStep('options') }}
              style={{ background: '#EEF2FF', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#2E5BFF', fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>+</span> הוסף מכשיר
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {devices.map((dev) => (
              <div key={dev.id} style={{ background: dev.primary ? '#EEF2FF' : '#F8FAFC', borderRadius: 14, padding: '12px 14px', border: `1.5px solid ${dev.primary ? 'rgba(46,91,255,0.25)' : '#F1F5F9'}` }}>
                {editingDeviceId === dev.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        placeholder="יצרן"
                        defaultValue={dev.brand}
                        id={`brand-${dev.id}`}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1.5px solid #2E5BFF', fontSize: 13, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff' }}
                      />
                      <input
                        placeholder="דגם"
                        defaultValue={dev.model}
                        id={`model-${dev.id}`}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1.5px solid #2E5BFF', fontSize: 13, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#fff' }}
                      />
                    </div>
                    <input
                      placeholder="פרטים נוספים (גודל, שנה...)"
                      defaultValue={dev.extra}
                      id={`extra-${dev.id}`}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid #2E5BFF', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif", outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          const brand = (document.getElementById(`brand-${dev.id}`) as HTMLInputElement)?.value || dev.brand
                          const model = (document.getElementById(`model-${dev.id}`) as HTMLInputElement)?.value || dev.model
                          const extra = (document.getElementById(`extra-${dev.id}`) as HTMLInputElement)?.value || dev.extra
                          setDevices((prev) => prev.map((d) => d.id === dev.id ? { ...d, brand, model, extra } : d))
                          setEditingDeviceId(null)
                        }}
                        style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', background: '#2E5BFF', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif" }}
                      >שמור</button>
                      <button
                        onClick={() => setEditingDeviceId(null)}
                        style={{ padding: '9px 14px', borderRadius: 10, border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 13, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif" }}
                      >ביטול</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: dev.primary ? '#DBEAFE' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {dev.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', fontFamily: "'Outfit', sans-serif" }}>{dev.brand} {dev.model}</span>
                        {dev.primary && <span style={{ fontSize: 9, fontWeight: 700, color: '#2E5BFF', background: '#EEF2FF', borderRadius: 5, padding: '1px 6px', fontFamily: "'Outfit', sans-serif" }}>ראשי</span>}
                      </div>
                      <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: "'Outfit', sans-serif" }}>{dev.type} · {dev.extra}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditingDeviceId(dev.id)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✏️</button>
                      {!dev.primary && (
                        <button onClick={() => removeDevice(dev.id)} style={{ background: '#FFF0F0', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🗑️</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif", textAlign: 'center' }}>
            Fitgura ישאב התאמות לכל מכשיר ברשימה
          </p>
        </div>

        {/* Add Device Sheet */}
        {showAddDevice && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
            <div onClick={() => { setShowAddDevice(false); setDevPhotoUrl(null); setShowDevCameraChoice(false); setAddStep('options') }} style={{ position: 'absolute', inset: 0, background: 'rgba(11,20,55,0.55)', backdropFilter: 'blur(4px)' }} />
            <div style={{ position: 'relative', background: '#fff', borderRadius: '32px 32px 0 0', padding: '28px 24px 32px', animation: 'sheetUp 0.35s cubic-bezier(0.22,1,0.36,1)', direction: 'rtl', maxHeight: '85%', overflowY: 'auto' }}>
              {/* hidden file inputs for device photo */}
              <input ref={devCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleDevPhoto} />
              <input ref={devGalleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleDevPhoto} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>הוסף מכשיר</h3>
                <button onClick={() => { setShowAddDevice(false); setDevPhotoUrl(null); setShowDevCameraChoice(false); setAddStep('options') }} style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#64748B', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              {addStep === 'options' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>כיצד תרצה להוסיף את המכשיר?</p>

                  {!showDevCameraChoice ? (
                    <button
                      onClick={() => setShowDevCameraChoice(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderRadius: 18, border: '2px solid #2E5BFF', background: '#EEF2FF', cursor: 'pointer', textAlign: 'right' }}
                    >
                      <span style={{ fontSize: 28 }}>📷</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>צלם את המכשיר</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>AI יזהה את המכשיר אוטומטית</p>
                      </div>
                    </button>
                  ) : (
                    <div style={{ borderRadius: 18, border: '2px solid #2E5BFF', background: '#EEF2FF', overflow: 'hidden' }}>
                      <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>📷</span>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>בחר מקור תמונה</p>
                      </div>
                      <div style={{ display: 'flex', borderTop: '1px solid rgba(46,91,255,0.15)' }}>
                        <button
                          onClick={() => devCameraInputRef.current?.click()}
                          style={{ flex: 1, padding: '14px 12px', border: 'none', borderLeft: '1px solid rgba(46,91,255,0.15)', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                        >
                          <span style={{ fontSize: 26 }}>📸</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>מצלמה</span>
                          <span style={{ fontSize: 10, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>צלם עכשיו</span>
                        </button>
                        <button
                          onClick={() => devGalleryInputRef.current?.click()}
                          style={{ flex: 1, padding: '14px 12px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                        >
                          <span style={{ fontSize: 26 }}>🖼️</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>גלריה</span>
                          <span style={{ fontSize: 10, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>בחר תמונה</span>
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setAddStep('form')}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderRadius: 18, border: '1.5px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', textAlign: 'right' }}
                  >
                    <span style={{ fontSize: 28 }}>✏️</span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>הזן ידנית</p>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>מלא יצרן, דגם, ופרטים</p>
                    </div>
                  </button>
                </div>
              )}

              {addStep === 'scanning' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #EEF2FF, #DBEAFE)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 20px', position: 'relative', overflow: 'hidden' }}>
                    {devPhotoUrl
                      ? <img src={devPhotoUrl} alt="device" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 24 }} />
                      : '📷'}
                    <div style={{ position: 'absolute', inset: -4, borderRadius: 28, border: '3px solid transparent', borderTopColor: '#2E5BFF', animation: 'spin 1s linear infinite' }} />
                  </div>
                  <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 17, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>AI סורק ומזהה...</p>
                  <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>מנתח את התמונה ושואב פרטי מכשיר מהרשת</p>
                  <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${addScanProgress}%`, background: 'linear-gradient(90deg, #2E5BFF, #2ED573)', borderRadius: 4, transition: 'width 0.2s' }} />
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>{Math.round(addScanProgress)}%</p>
                </div>
              )}

              {addStep === 'result' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* photo + identified device */}
                  <div style={{ background: 'linear-gradient(135deg, #F0FFF6, #DCFCE7)', borderRadius: 16, padding: '14px 16px', border: '1.5px solid rgba(46,213,115,0.35)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #2ED573, #16A34A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0, overflow: 'hidden', border: '2px solid rgba(46,213,115,0.4)' }}>
                      {devPhotoUrl
                        ? <img src={devPhotoUrl} alt="scanned device" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (DEV_TYPE_EMOJI[newDevType] ?? '📱')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D', background: '#BBF7D0', borderRadius: 6, padding: '1px 7px', fontFamily: "'Outfit', sans-serif" }}>✓ זוהה</span>
                      </div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#166534', fontFamily: "'Outfit', sans-serif" }}>{newDevBrand} {newDevModel}</p>
                      <p style={{ margin: '1px 0 0', fontSize: 11, color: '#16A34A', fontFamily: "'Outfit', sans-serif" }}>{newDevExtra}</p>
                    </div>
                  </div>

                  {/* accessories */}
                  <div>
                    <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 14, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                      🛍️ אביזרים מומלצים ({scannedAccessories.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {scannedAccessories.map((acc, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', borderRadius: 12, padding: '10px 14px', border: '1px solid #E2E8F0' }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #EEF2FF, #DBEAFE)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                            {['🛡️', '🔍', '✏️', '⌨️', '🔌'][i % 5]}
                          </div>
                          <span style={{ fontSize: 13, color: '#374151', fontFamily: "'Noto Sans Hebrew', sans-serif", flex: 1 }}>{acc}</span>
                          <div style={{ width: 20, height: 20, borderRadius: 6, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11 }}>+</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* actions */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setAddStep('form')}
                      style={{ flex: 1, padding: '13px', borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif" }}
                    >
                      ערוך פרטים
                    </button>
                    <button
                      onClick={addDevice}
                      style={{ flex: 2, padding: '13px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #2E5BFF, #1a38c8)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif", boxShadow: '0 6px 20px rgba(46,91,255,0.35)' }}
                    >
                      הוסף למכשירים שלי ✓
                    </button>
                  </div>
                </div>
              )}

              {addStep === 'form' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {newDevBrand && <div style={{ background: '#F0FFF6', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(46,213,115,0.3)' }}>
                    <span style={{ fontSize: 16 }}>✅</span>
                    <span style={{ fontSize: 13, color: '#15803D', fontWeight: 600, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>AI זיהה: {newDevBrand} {newDevModel}</span>
                  </div>}

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>סוג מכשיר</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['טלפון', 'טאבלט', 'אוזניות', 'שעון', 'אחר'].map((t) => (
                        <button key={t} onClick={() => setNewDevType(t)} style={{ padding: '7px 14px', borderRadius: 10, border: `1.5px solid ${newDevType === t ? '#2E5BFF' : '#E2E8F0'}`, background: newDevType === t ? '#EEF2FF' : '#F8FAFC', color: newDevType === t ? '#2E5BFF' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                          {DEV_TYPE_EMOJI[t]} {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>יצרן</label>
                      <input value={newDevBrand} onChange={(e) => setNewDevBrand(e.target.value)} placeholder="Apple, Samsung..." style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#F8FAFC', boxSizing: 'border-box' }} onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }} onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>דגם</label>
                      <input value={newDevModel} onChange={(e) => setNewDevModel(e.target.value)} placeholder="Tab P12, S24..." style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#F8FAFC', boxSizing: 'border-box' }} onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }} onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>פרטים נוספים (גודל, שנה, שבב...)</label>
                    <input value={newDevExtra} onChange={(e) => setNewDevExtra(e.target.value)} placeholder='12.7" · Snapdragon · 2024' style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#F8FAFC', boxSizing: 'border-box' }} onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }} onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
                  </div>

                  <button
                    onClick={addDevice}
                    disabled={!newDevBrand || !newDevModel}
                    style={{ padding: '16px', borderRadius: 18, border: 'none', background: newDevBrand && newDevModel ? 'linear-gradient(135deg, #2E5BFF, #1a38c8)' : '#E2E8F0', color: newDevBrand && newDevModel ? '#fff' : '#94A3B8', fontSize: 16, fontWeight: 700, cursor: newDevBrand && newDevModel ? 'pointer' : 'not-allowed', fontFamily: "'Noto Sans Hebrew', sans-serif", boxShadow: newDevBrand && newDevModel ? '0 6px 20px rgba(46,91,255,0.35)' : 'none', transition: 'all 0.2s' }}
                  >
                    הוסף למכשירים שלי
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI scan gallery */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          {/* header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: '#1E293B', fontSize: 15, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>🖼️ גלריית סריקות AI</p>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{scanHistory.length} סריקות שמורות</p>
            </div>
            <div style={{ textAlign: 'left' }}>
              <span style={{ fontSize: 10, color: '#16A34A', fontWeight: 700, fontFamily: "'Outfit', sans-serif", display: 'block' }}>✅ {GALLERY_LAST_SCANNED}</span>
              <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif", display: 'block' }}>הבא: {GALLERY_NEXT_SCAN}</span>
            </div>
          </div>

          {/* last-scan status bar */}
          <div style={{ background: 'linear-gradient(135deg, #F0FFF6, #DCFCE7)', borderRadius: 14, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(46,213,115,0.25)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ED573', flexShrink: 0, boxShadow: '0 0 0 3px rgba(46,213,115,0.2)' }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#15803D', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                AI סרק {scanHistory.filter(s => s.isWeekly).length} תמונות חדשות מהגלריה שלך
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                המידות עודכנו אוטומטית על בסיס התמונות האחרונות שלך
              </p>
            </div>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔄</span>
          </div>

          {/* scan rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {scanHistory.map((scan, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: i === 0 ? '#F0FFF6' : '#F8FAFC',
                  borderRadius: 14, padding: '12px',
                  border: i === 0 ? '1.5px solid rgba(46,213,115,0.35)' : '1.5px solid #F1F5F9',
                }}
              >
                {/* thumbnail */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img
                    src={`https://images.unsplash.com/${scan.thumb}?w=60&h=60&fit=crop&auto=format&face`}
                    alt="scan"
                    style={{ width: 54, height: 54, borderRadius: 13, objectFit: 'cover', display: 'block' }}
                  />
                  {i === 0 && (
                    <div style={{ position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#2ED573', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>✓</div>
                  )}
                  {scan.isWeekly && (
                    <div style={{ position: 'absolute', top: -4, left: -4, width: 18, height: 18, borderRadius: '50%', background: '#2E5BFF', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>🔄</div>
                  )}
                </div>

                {/* content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{scan.date} · {scan.time}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: scan.isWeekly ? '#2E5BFF' : '#94A3B8', background: scan.isWeekly ? '#EEF2FF' : '#F1F5F9', borderRadius: 5, padding: '1px 6px', fontFamily: "'Outfit', sans-serif" }}>
                          {scan.source}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? '#16A34A' : '#94A3B8', fontFamily: "'Outfit', sans-serif", flexShrink: 0 }}>{scan.confidence}%</span>
                  </div>

                  {/* size chips */}
                  <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
                    {[`חולצה: ${scan.top}`, `מכנסיים: ${scan.bottom}`, scan.fit].map((label) => (
                      <span key={label} style={{ background: i === 0 ? 'rgba(46,213,115,0.12)' : '#F1F5F9', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: i === 0 ? '#15803D' : '#64748B', fontFamily: "'Outfit', sans-serif" }}>{label}</span>
                    ))}
                  </div>

                  {/* delta badges */}
                  {scan.delta && (
                    <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                      {Object.values(scan.delta).map((d) => (
                        <span key={d} style={{ background: '#EEF2FF', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: '#2E5BFF', fontFamily: "'Outfit', sans-serif" }}>↔ {d}</span>
                      ))}
                    </div>
                  )}

                  {/* confidence bar */}
                  <div style={{ marginTop: 7, height: 3, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${scan.confidence}%`, background: i === 0 ? '#2ED573' : '#94A3B8', borderRadius: 2, transition: 'width 0.5s' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p style={{ margin: '12px 0 0', fontSize: 11, color: '#94A3B8', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
            הגלריה נסרקת אוטומטית כל שבוע · ניתן לשנות בהגדרות
          </p>
        </div>

        {/* Family CTA */}
        <button
          style={{
            width: '100%',
            padding: '16px 20px',
            borderRadius: 18,
            border: '2px dashed #FECACA',
            background: '#FFF5F5',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            direction: 'rtl',
            textAlign: 'right',
          }}
        >
          <span style={{ fontSize: 26 }}>👨‍👩‍👧</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>+ הוסף פרופיל משפחתי</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#FB923C', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>בקרוב — סריקת AI לכל הבית</p>
          </div>
          <div style={{ background: 'rgba(255,107,107,0.12)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>בקרוב</div>
        </button>
      </div>

      <BottomNav current="profile" onNav={onNav} />
    </div>
  )
}

/* ─── WISHLIST ───────────────────────────────────────────────────────────── */

function WishlistScreen({ onNav, wishlistItems, budget }: { onNav: (s: Screen) => void; wishlistItems: number[]; budget: [number, number] }) {
  const saved = products.filter((_, i) => wishlistItems.includes(i))
  const inBudget = saved.filter((p) => p.price >= budget[0] && p.price <= budget[1])
  const outBudget = saved.filter((p) => p.price < budget[0] || p.price > budget[1])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '844px', direction: 'rtl' }}>
      <div style={{ padding: '52px 24px 20px', background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>רשימת המשאלות שלי</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
          {saved.length} פריטים שמורים • {inBudget.length} בטווח התקציב
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {saved.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🤍</div>
            <p style={{ color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>עוד לא שמרת פריטים</p>
          </div>
        )}

        {inBudget.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <span style={{ fontWeight: 700, color: '#1E293B', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>בטווח התקציב שלך</span>
              <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
              <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>₪{budget[0]}–₪{budget[1]}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {inBudget.map((p, i) => <WishlistRow key={i} product={p} inBudget />)}
            </div>
          </>
        )}

        {outBudget.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>💸</span>
              <span style={{ fontWeight: 700, color: '#94A3B8', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>מחוץ לתקציב</span>
              <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {outBudget.map((p, i) => <WishlistRow key={i} product={p} inBudget={false} />)}
            </div>
          </>
        )}
      </div>

      <BottomNav current="wishlist" onNav={onNav} />
    </div>
  )
}

function WishlistRow({ product, inBudget }: { product: typeof products[0]; inBudget: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#fff',
        borderRadius: 16,
        padding: '12px',
        boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
        opacity: inBudget ? 1 : 0.6,
        direction: 'rtl',
      }}
    >
      <img
        src={`https://images.unsplash.com/${product.img}?w=80&h=80&fit=crop&auto=format`}
        alt={product.name}
        style={{ width: 58, height: 58, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{product.name}</p>
        <p style={{ margin: '2px 0', fontSize: 11, color: '#94A3B8', fontFamily: "'Outfit', sans-serif" }}>{product.brand}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: inBudget ? '#2E5BFF' : '#94A3B8', fontFamily: "'Outfit', sans-serif" }}>₪{product.price}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', background: '#F0FFF6', padding: '2px 6px', borderRadius: 5, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>AI ✓</span>
        </div>
      </div>
      <span style={{ fontSize: 20 }}>{inBudget ? '❤️' : '🤍'}</span>
    </div>
  )
}

/* ─── EVENTS BOARD ───────────────────────────────────────────────────────── */

function EventsScreen({ onNav }: { onNav: (s: Screen) => void }) {
  const yr = new Date().getFullYear()
  const mo = (n: number) => String(new Date().getMonth() + n).padStart(2, '0')

  const [events, setEvents] = useState<FitEvent[]>([
    { id: 1, name: 'יום האהבה', emoji: '💝', date: `${yr}-02-14`, platforms: ['Amazon', 'Shein'], color: '#FF6B6B', bgColor: '#FFF0F0' },
    { id: 2, name: 'יום הולדת — מיכל', emoji: '🎂', date: `${yr}-${mo(2)}-18`, platforms: ['AliExpress', 'ZARA'], color: '#2E5BFF', bgColor: '#EEF2FF' },
    { id: 3, name: 'יום נישואין', emoji: '💍', date: `${yr + 1}-12-25`, platforms: ['AliExpress', 'Amazon', 'ASOS'], color: '#FF6B6B', bgColor: '#FFF5F0' },
  ])

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newPlatforms, setNewPlatforms] = useState<string[]>([])
  const [newEmoji, setNewEmoji] = useState('🎉')
  const [newColor, setNewColor] = useState('#2E5BFF')
  const [newBg, setNewBg] = useState('#EEF2FF')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const sorted = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  function toggleNewPlatform(name: string) {
    setNewPlatforms((prev) => {
      if (prev.includes(name)) return prev.filter((p) => p !== name)
      if (prev.length >= 3) return prev  // max 3
      return [...prev, name]
    })
  }

  function selectPreset(i: number) {
    const p = PRESET_EVENTS[i]
    setSelectedPreset(i)
    setNewName(p.name)
    setNewEmoji(p.emoji)
    setNewColor(p.color)
    setNewBg(p.bgColor)
    if (p.month && p.day) setNewDate(`${new Date().getFullYear()}-${p.month}-${p.day}`)
  }

  function addEvent() {
    if (!newName || !newDate || newPlatforms.length === 0) return
    setEvents((prev) => [
      ...prev,
      { id: _nextEventId++, name: newName, emoji: newEmoji, date: newDate, platforms: newPlatforms, color: newColor, bgColor: newBg },
    ])
    setShowAdd(false)
    setNewName(''); setNewDate(''); setNewPlatforms([]); setSelectedPreset(null); setNewEmoji('🎉'); setNewColor('#2E5BFF'); setNewBg('#EEF2FF')
  }

  function removeEvent(id: number) {
    setDeletingId(id)
    setTimeout(() => {
      setEvents((prev) => prev.filter((e) => e.id !== id))
      setDeletingId(null)
    }, 300)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '844px', direction: 'rtl', background: '#F8FAFC' }}>
      {/* Header */}
      <div style={{ padding: '52px 24px 20px', background: 'linear-gradient(160deg, #0B1437 0%, #1A2F7A 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, left: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(46,91,255,0.12)' }} />
        <div style={{ position: 'absolute', bottom: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,107,107,0.1)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                לוח אירועים
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                תזכורות חכמות לפי זמני משלוח
              </p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.2)',
                borderRadius: 14, padding: '9px 16px', cursor: 'pointer',
                color: '#fff', fontWeight: 700, fontSize: 13,
                fontFamily: "'Noto Sans Hebrew', sans-serif",
              }}
            >
              <span style={{ fontSize: 16 }}>+</span> הוסף אירוע
            </button>
          </div>

          {/* summary chips */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {[
              { label: `${events.length} אירועים`, bg: 'rgba(46,91,255,0.2)', color: '#93C5FD' },
              { label: `${events.filter(e => daysUntil(e.date) <= 14 && daysUntil(e.date) >= 0).length} מתקרבים`, bg: 'rgba(255,107,107,0.2)', color: '#FCA5A5' },
            ].map(({ label, bg, color }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '5px 12px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {sorted.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🗓️</div>
            <p style={{ color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>אין אירועים — לחץ "+ הוסף אירוע"</p>
          </div>
        )}

        {sorted.map((ev) => {
          const dLeft = daysUntil(ev.date)
          const evPlatforms = ev.platforms.map((n) => PLATFORMS.find((p) => p.name === n)).filter((p): p is Platform => p !== undefined)
          const minOrderBy = evPlatforms.length > 0 ? Math.min(...evPlatforms.map((p) => dLeft - p.daysIL)) : dLeft
          const urgent = dLeft >= 0 && minOrderBy <= 3
          const past = dLeft < 0

          return (
            <div
              key={ev.id}
              style={{
                background: '#fff',
                borderRadius: 22,
                marginBottom: 12,
                overflow: 'hidden',
                boxShadow: urgent ? `0 4px 20px ${ev.color}30` : '0 2px 10px rgba(0,0,0,0.06)',
                border: urgent ? `1.5px solid ${ev.color}50` : '1.5px solid transparent',
                opacity: deletingId === ev.id ? 0 : past ? 0.55 : 1,
                transition: 'opacity 0.3s',
              }}
            >
              {/* color bar top */}
              <div style={{ height: 4, background: past ? '#E2E8F0' : `linear-gradient(90deg, ${ev.color}, ${ev.color}88)` }} />

              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* emoji badge */}
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: ev.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                    {ev.emoji}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{ev.name}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{formatDate(ev.date)}</p>
                      </div>
                      <button
                        onClick={() => removeEvent(ev.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 16, padding: '0 0 0 4px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* days countdown + per-platform shipping badges */}
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {past ? (
                        <div style={{ background: '#F1F5F9', borderRadius: 8, padding: '4px 10px' }}>
                          <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>עבר</span>
                        </div>
                      ) : (
                        <>
                          <div style={{ background: ev.bgColor, borderRadius: 8, padding: '4px 10px', border: `1px solid ${ev.color}30` }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: ev.color, fontFamily: "'Outfit', sans-serif" }}>
                              {dLeft === 0 ? 'היום!' : `${dLeft} ימים`}
                            </span>
                          </div>

                          {/* one chip per platform */}
                          {evPlatforms.map((plat) => {
                            const orderBy = dLeft - plat.daysIL
                            const chipBg = orderBy <= 0 ? '#FFF0F0' : orderBy <= 3 ? '#FFFBEB' : '#F0FFF6'
                            const chipBorder = orderBy <= 0 ? '#FECACA' : orderBy <= 3 ? '#FDE68A' : 'rgba(46,213,115,0.3)'
                            const chipColor = orderBy <= 0 ? '#DC2626' : orderBy <= 3 ? '#D97706' : '#15803D'
                            const label = orderBy <= 0
                              ? `⚠️ הזמן עכשיו! — ${plat.name}`
                              : orderBy <= 3
                                ? `הזמן תוך ${orderBy}ד׳ — ${plat.name}`
                                : `${plat.name} — ${orderBy}ד׳`
                            return (
                              <div key={plat.name} style={{ background: chipBg, borderRadius: 8, padding: '4px 10px', border: `1px solid ${chipBorder}`, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 11 }}>{plat.logo}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans Hebrew', sans-serif", color: chipColor }}>{label}</span>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* shipping timeline bar — based on earliest deadline */}
                {!past && dLeft >= 0 && evPlatforms.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>היום</span>
                      <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>הזמנה אחרונה</span>
                      <span style={{ fontSize: 10, color: ev.color, fontWeight: 700, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>האירוע 🎯</span>
                    </div>
                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0,
                        width: `${Math.min(100, Math.max(0, (1 - minOrderBy / Math.max(dLeft, 1)) * 100))}%`,
                        background: minOrderBy <= 0 ? '#FECACA' : minOrderBy <= 3 ? '#FDE68A' : `linear-gradient(90deg, ${ev.color}88, ${ev.color})`,
                        borderRadius: 3,
                        transition: 'width 0.5s',
                      }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* tip */}
        <div style={{ background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)', borderRadius: 18, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 4 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, fontSize: 12, color: '#4F6EFF', lineHeight: 1.55, fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
            Fitgura מחשבת את זמן ההזמנה האחרון לפי ימי המשלוח של הפלטפורמה שבחרת — כך שתמיד תקבל בזמן.
          </p>
        </div>
      </div>

      {/* Add event bottom sheet */}
      {showAdd && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div onClick={() => setShowAdd(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(11,20,55,0.55)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'relative', background: '#fff', borderRadius: '32px 32px 0 0', overflow: 'hidden', animation: 'sheetUp 0.35s cubic-bezier(0.22,1,0.36,1)', direction: 'rtl', maxHeight: '88%', display: 'flex', flexDirection: 'column' }}>
            {/* sheet header */}
            <div style={{ padding: '24px 24px 16px', background: 'linear-gradient(135deg, #2E5BFF, #1a38c8)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>הוסף אירוע חדש</h3>
                <button onClick={() => setShowAdd(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* preset chips */}
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>בחר מאירועים מוכנים:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PRESET_EVENTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => selectPreset(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', borderRadius: 12,
                        border: `1.5px solid ${selectedPreset === i ? p.color : '#E2E8F0'}`,
                        background: selectedPreset === i ? p.bgColor : '#F8FAFC',
                        cursor: 'pointer', transition: 'all 0.2s',
                        fontFamily: "'Noto Sans Hebrew', sans-serif", fontSize: 12, fontWeight: 600,
                        color: selectedPreset === i ? p.color : '#475569',
                      }}
                    >
                      <span>{p.emoji}</span> {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
                <span style={{ fontSize: 11, color: '#CBD5E1', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>או הזן ידנית</span>
                <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
              </div>

              {/* name input */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif", display: 'block', marginBottom: 6 }}>שם האירוע</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="לדוגמה: יום הולדת — אמא"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif", outline: 'none', background: '#F8FAFC', color: '#1E293B', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                />
              </div>

              {/* date */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif", display: 'block', marginBottom: 6 }}>תאריך האירוע</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: 'none', background: '#F8FAFC', color: '#1E293B', boxSizing: 'border-box', direction: 'ltr' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#2E5BFF' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                />
              </div>

              {/* platform multi-select (up to 3) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>פלטפורמות הזמנה — עד 3</label>
                  <span style={{ fontSize: 11, color: newPlatforms.length >= 3 ? '#DC2626' : '#94A3B8', fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>{newPlatforms.length}/3</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PLATFORMS.map((p) => {
                    const selected = newPlatforms.includes(p.name)
                    const disabled = !selected && newPlatforms.length >= 3
                    return (
                      <button
                        key={p.name}
                        onClick={() => toggleNewPlatform(p.name)}
                        disabled={disabled}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '8px 12px', borderRadius: 12,
                          border: `1.5px solid ${selected ? p.color : '#E2E8F0'}`,
                          background: selected ? `${p.color}15` : disabled ? '#F8FAFC' : '#F8FAFC',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          opacity: disabled ? 0.4 : 1,
                          transition: 'all 0.2s',
                          fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600,
                          color: selected ? p.color : '#475569',
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{p.logo}</span>
                        <span>{p.name}</span>
                        <span style={{ fontSize: 10, color: selected ? p.color : '#94A3B8' }}>{p.daysIL}ד׳</span>
                        {selected && <span style={{ fontSize: 10, color: p.color }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
                {newPlatforms.length > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>
                    תקבל תזכורות לפי זמני משלוח: {newPlatforms.map((n) => { const pl = PLATFORMS.find((p) => p.name === n); return pl ? `${n} (${pl.daysIL}ד׳)` : n }).join(' · ')}
                  </p>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={addEvent}
                disabled={!newName || !newDate || newPlatforms.length === 0}
                style={{
                  padding: '16px', borderRadius: 18, border: 'none',
                  background: newName && newDate && newPlatforms.length > 0 ? 'linear-gradient(135deg, #2E5BFF, #1a38c8)' : '#E2E8F0',
                  color: newName && newDate && newPlatforms.length > 0 ? '#fff' : '#94A3B8',
                  fontSize: 16, fontWeight: 700,
                  cursor: newName && newDate && newPlatforms.length > 0 ? 'pointer' : 'not-allowed',
                  fontFamily: "'Noto Sans Hebrew', sans-serif",
                  boxShadow: newName && newDate && newPlatforms.length > 0 ? '0 6px 20px rgba(46,91,255,0.35)' : 'none',
                  transition: 'all 0.2s', marginBottom: 8,
                }}
              >
                הוסף ללוח האירועים
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav current="events" onNav={onNav} />
    </div>
  )
}

/* ─── BOTTOM NAV ─────────────────────────────────────────────────────────── */

function BottomNav({ current, onNav }: { current: Screen; onNav: (s: Screen) => void }) {
  const items: { screen: Screen; icon: string; label: string }[] = [
    { screen: 'feed', icon: '🏠', label: 'פיד' },
    { screen: 'wishlist', icon: '❤️', label: 'שמורים' },
    { screen: 'profile', icon: '🤖', label: 'פרופיל' },
    { screen: 'events', icon: '🗓️', label: 'אירועים' },
  ]

  return (
    <div style={{ display: 'flex', background: '#fff', borderTop: '1px solid #F1F5F9', padding: '10px 0 28px', direction: 'rtl' }}>
      {items.map(({ screen, icon, label }) => (
        <button
          key={screen}
          onClick={() => onNav(screen)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 14, background: current === screen ? '#EEF2FF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, transition: 'all 0.2s' }}>
            {icon}
          </div>
          <span style={{ fontSize: 10, fontWeight: current === screen ? 700 : 400, color: current === screen ? '#2E5BFF' : '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>{label}</span>
        </button>
      ))}
    </div>
  )
}
