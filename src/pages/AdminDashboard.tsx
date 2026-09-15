import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput } from 'react-native'
import type { Screen } from '../types'
import { BottomNav } from '../components'
import {
  getEnhancedSummary,
  getDailyAnalytics,
  getTopProducts,
  getAdminUserList,
  getAdminRecentClicks,
  getAdminUserDetails,
  getAdminUserSessions,
  getAdminUserSearches,
  getAdminUserEvents,
  getAdminAllEvents,
  getAdminRecentActivity,
  adminUpdateUserStatus,
  type EnhancedSummaryStats,
  type DailyAnalytics,
  type TopProduct,
  type AdminUserRow,
  type AdminClickRow,
  type AdminUserDetails,
  type AdminUserSession,
  type AdminUserSearch,
  type AdminUserEvent,
  type AdminAllEvent,
  type AdminActivityRow,
} from '../services/analyticsService'
import { sendBroadcast, sendToUser } from '../services/notificationService'
import { supabase } from '../lib/supabase'

type Tab = 'overview' | 'users' | 'clicks' | 'products' | 'events' | 'broadcast'

export function AdminDashboard({ onNav }: { onNav: (s: Screen) => void }) {
  const [verified, setVerified] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [summary, setSummary] = useState<EnhancedSummaryStats | null>(null)
  const [daily, setDaily] = useState<DailyAnalytics[]>([])
  const [products, setProducts] = useState<TopProduct[]>([])
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [clicks, setClicks] = useState<AdminClickRow[]>([])
  const [allEvents, setAllEvents] = useState<AdminAllEvent[]>([])
  const [activity, setActivity] = useState<AdminActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const [s, d, p, u, c, e, a] = await Promise.all([
        getEnhancedSummary(),
        getDailyAnalytics(),
        getTopProducts(),
        getAdminUserList(),
        getAdminRecentClicks(50),
        getAdminAllEvents(),
        getAdminRecentActivity(30),
      ])
      setSummary(s)
      setDaily(d)
      setProducts(p)
      setUsers(u)
      setClicks(c)
      setAllEvents(e)
      setActivity(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { if (verified) void fetchData() }, [fetchData, verified])

  const maxDailyClicks = Math.max(...daily.map((d) => d.click_count), 1)

  if (!verified) {
    return <PasswordGate onNav={onNav} onVerified={() => setVerified(true)} />
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1A1A1A" />
          <Text style={styles.loadingText}>טוען נתונים...</Text>
        </View>
        <BottomNav current="profile" onNav={onNav} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => onNav('profile')} style={styles.iconBtn} activeOpacity={0.7}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>ניהול מערכת</Text>
          <TouchableOpacity onPress={fetchData} style={styles.iconBtn} activeOpacity={0.7}>
            <Text style={[styles.refreshIcon, refreshing && styles.spin]}>↻</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorIcon}>⚠</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchData} style={styles.retryBtn} activeOpacity={0.7}>
              <Text style={styles.retryText}>נסה שוב</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
              <View style={styles.tabBar}>
                <TabBtn label="סקירה" active={tab === 'overview'} onPress={() => setTab('overview')} />
                <TabBtn label="משתמשים" active={tab === 'users'} onPress={() => setTab('users')} />
                <TabBtn label="קליקים" active={tab === 'clicks'} onPress={() => setTab('clicks')} />
                <TabBtn label="מוצרים" active={tab === 'products'} onPress={() => setTab('products')} />
                <TabBtn label="אירועים" active={tab === 'events'} onPress={() => setTab('events')} />
                <TabBtn label="שידור" active={tab === 'broadcast'} onPress={() => setTab('broadcast')} />
              </View>
            </ScrollView>

            {tab === 'overview' && (
              <>
                <Text style={styles.sectionLabel}>מדדי ביצוע</Text>
                <View style={styles.kpiGrid}>
                  <KpiCard label="סה״כ קליקים" value={summary?.total_clicks ?? 0} icon="📊" color="#FFE566" />
                  <KpiCard label="קליקים היום" value={summary?.clicks_today ?? 0} icon="📅" color="#00FF66" />
                  <KpiCard label="קליקים החודש" value={summary?.clicks_this_month ?? 0} icon="📆" color="#F5C842" />
                  <KpiCard label="קליקרים ייחודיים" value={summary?.unique_active_clickers ?? 0} icon="👥" color="#00CC52" />
                  <KpiCard label="סה״כ משתמשים" value={summary?.total_users ?? 0} icon="👤" color="#FFE566" />
                  <KpiCard label="משתמשים חדשים" value={summary?.new_users_today ?? 0} icon="✨" color="#00FF66" />
                  <KpiCard label="סה״כ מועדפים" value={summary?.total_favorites ?? 0} icon="💚" color="#E0FFF0" />
                  <KpiCard label="מוצרים פעילים" value={products.length} icon="🏷️" color="#FFFACC" />
                </View>

                <Text style={styles.sectionLabel}>תנועה יומית</Text>
                <View style={styles.card}>
                  {daily.length === 0 ? (
                    <Text style={styles.emptyText}>אין נתונים עדיין</Text>
                  ) : (
                    daily.slice(0, 14).map((d, i) => (
                      <View key={i} style={styles.dailyRow}>
                        <Text style={styles.dailyDate}>{formatDate(d.click_date)}</Text>
                        <View style={styles.dailyBarBg}>
                          <View style={[styles.dailyBar, { width: `${(d.click_count / maxDailyClicks) * 100}%` }]} />
                        </View>
                        <Text style={styles.dailyCount}>{d.click_count}</Text>
                      </View>
                    ))
                  )}
                </View>

                <Text style={styles.sectionLabel}>פעילות אחרונה</Text>
                <View style={styles.card}>
                  {activity.length === 0 ? (
                    <Text style={styles.emptyText}>אין פעילות עדיין</Text>
                  ) : (
                    activity.map((a, i) => (
                      <View key={i} style={[styles.activityRow, i % 2 === 1 && styles.tableRowAlt]}>
                        <Text style={styles.activityIcon}>{activityIcon(a.activity_type)}</Text>
                        <View style={styles.activityContent}>
                          <Text style={styles.activityDesc} numberOfLines={1}>{a.description}</Text>
                          <Text style={styles.activityMeta}>{a.user_email ?? 'אורח'} · {formatDateTime(a.created_at)}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}

            {tab === 'users' && (
              <>
                <Text style={styles.sectionLabel}>משתמשים רשומים ({users.length})</Text>
                <View style={styles.card}>
                  {users.length === 0 ? (
                    <Text style={styles.emptyText}>אין משתמשים עדיין</Text>
                  ) : (
                    <View>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>אימייל</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>מידות</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>סטטוס</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>הצטרף</Text>
                      </View>
                      {users.map((u, i) => (
                        <TouchableOpacity key={u.user_id} onPress={() => setSelectedUser(u.user_id)} activeOpacity={0.7} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{u.email ?? '—'}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{u.top_size ?? '—'} / {u.bottom_size ?? '—'}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }, u.is_active === false && styles.inactiveText]}>
                            {u.is_active === false ? 'מושהה' : 'פעיל'}
                          </Text>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{formatShortDate(u.created_at)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {tab === 'clicks' && (
              <>
                <Text style={styles.sectionLabel}>קליקים אחרונים ({clicks.length})</Text>
                <View style={styles.card}>
                  {clicks.length === 0 ? (
                    <Text style={styles.emptyText}>אין קליקים עדיין</Text>
                  ) : (
                    <View>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>מוצר</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>משתמש</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>תאריך</Text>
                      </View>
                      {clicks.map((c, i) => (
                        <View key={c.id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{c.product_title ?? c.product_id}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>{c.user_email ?? 'אורח'}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{formatDateTime(c.created_at)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {tab === 'products' && (
              <>
                <Text style={styles.sectionLabel}>מוצרים מובילים ({products.length})</Text>
                <View style={styles.card}>
                  {products.length === 0 ? (
                    <Text style={styles.emptyText}>אין מוצרים עדיין</Text>
                  ) : (
                    <View>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>מוצר</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>קליקים</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>תאריך</Text>
                      </View>
                      {products.map((p, i) => (
                        <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={2}>{p.product_title ?? p.product_id}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{p.total_clicks}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{formatShortDate(p.last_clicked_at)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {tab === 'events' && (
              <>
                <Text style={styles.sectionLabel}>אירועי משתמשים ({allEvents.length})</Text>
                <View style={styles.card}>
                  {allEvents.length === 0 ? (
                    <Text style={styles.emptyText}>אין אירועים עדיין</Text>
                  ) : (
                    <View>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>סמל</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>אירוע</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>משתמש</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>תאריך</Text>
                      </View>
                      {allEvents.map((e, i) => (
                        <View key={e.id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{e.emoji}</Text>
                          <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{e.event_name}</Text>
                          <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{e.user_email ?? '—'}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{formatShortDate(e.event_date)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {tab === 'broadcast' && <BroadcastPanel />}
          </>
        )}
      </ScrollView>
      <BottomNav current="profile" onNav={onNav} />
      {selectedUser && <UserDrawer userId={selectedUser} onClose={() => setSelectedUser(null)} />}
    </View>
  )
}

function PasswordGate({ onNav, onVerified }: { onNav: (s: Screen) => void; onVerified: () => void }) {
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheck() {
    if (!password.trim()) return
    setChecking(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('verify_admin_password', {
        p_password: password.trim(),
      })
      if (rpcError) {
        setError('שגיאה באימות')
      } else if (data === true) {
        onVerified()
      } else {
        setError('סיסמה שגויה')
      }
    } catch {
      setError('שגיאה באימות')
    } finally {
      setChecking(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.gateWrap}>
        <TouchableOpacity onPress={() => onNav('profile')} style={styles.iconBtn} activeOpacity={0.7}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.gateCard}>
          <Text style={styles.gateLockIcon}>🔐</Text>
          <Text style={styles.gateTitle}>כניסה למערכת הניהול</Text>
          <Text style={styles.gateSub}>נא להזין סיסמת מנהל</Text>
          <TextInput
            style={styles.gateInput}
            placeholder="סיסמה"
            placeholderTextColor="#9A9A9A"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            onSubmitEditing={handleCheck}
            autoFocus
          />
          {error && <Text style={styles.gateError}>{error}</Text>}
          <TouchableOpacity onPress={handleCheck} disabled={checking || !password.trim()} activeOpacity={0.7} style={[styles.gateBtn, (checking || !password.trim()) && styles.gateBtnDisabled]}>
            <Text style={styles.gateBtnText}>{checking ? 'בודק...' : 'כניסה'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <BottomNav current="profile" onNav={onNav} />
    </View>
  )
}

function BroadcastPanel() {
  const [mode, setMode] = useState<'all' | 'user'>('all')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('info')
  const [targetEmail, setTargetEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleSend() {
    if (!title.trim() || !body.trim()) return
    setSending(true)
    setResult(null)
    try {
      if (mode === 'all') {
        const ok = await sendBroadcast(title.trim(), body.trim(), type)
        setResult(ok ? 'השידור נשלח בהצלחה' : 'שליחה נכשלה')
      } else {
        if (!targetEmail.trim()) {
          setResult('נא להזין אימייל נמען')
          setSending(false)
          return
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('email', targetEmail.trim())
          .maybeSingle()
        if (!profile?.user_id) {
          setResult('משתמש לא נמצא')
          setSending(false)
          return
        }
        const ok = await sendToUser(profile.user_id, title.trim(), body.trim(), type)
        setResult(ok ? 'ההודעה נשלחה' : 'שליחה נכשלה')
      }
      setTitle('')
      setBody('')
      setTargetEmail('')
    } catch (err) {
      setResult('שגיאה בשליחה')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Text style={styles.sectionLabel}>שידור הודעות</Text>
      <View style={styles.card}>
        <View style={styles.broadcastModeRow}>
          <TouchableOpacity onPress={() => setMode('all')} activeOpacity={0.7} style={[styles.modeBtn, mode === 'all' && styles.modeBtnActive]}>
            <Text style={[styles.modeBtnText, mode === 'all' && styles.modeBtnTextActive]}>לכולם</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('user')} activeOpacity={0.7} style={[styles.modeBtn, mode === 'user' && styles.modeBtnActive]}>
            <Text style={[styles.modeBtnText, mode === 'user' && styles.modeBtnTextActive]}>למשתמש ספציפי</Text>
          </TouchableOpacity>
        </View>

        {mode === 'user' && (
          <TextInput
            style={styles.input}
            placeholder="אימייל נמען"
            placeholderTextColor="#9A9A9A"
            value={targetEmail}
            onChangeText={setTargetEmail}
            autoCapitalize="none"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="כותרת"
          placeholderTextColor="#9A9A9A"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          placeholder="תוכן"
          placeholderTextColor="#9A9A9A"
          value={body}
          onChangeText={setBody}
          multiline
        />

        <View style={styles.typeRow}>
          {(['info', 'promo', 'update', 'alert'] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setType(t)} activeOpacity={0.7} style={[styles.typeBtn, type === t && typeBtnActiveStyle(t)]}>
              <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>{typeLabel(t)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={handleSend} disabled={sending || !title.trim() || !body.trim()} activeOpacity={0.7} style={[styles.sendBtn, (sending || !title.trim() || !body.trim()) && styles.sendBtnDisabled]}>
          <Text style={styles.sendBtnText}>{sending ? 'שולח...' : 'שלח הודעה'}</Text>
        </TouchableOpacity>

        {result && <Text style={styles.resultText}>{result}</Text>}
      </View>
    </>
  )
}

function UserDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [details, setDetails] = useState<AdminUserDetails | null>(null)
  const [sessions, setSessions] = useState<AdminUserSession[]>([])
  const [searches, setSearches] = useState<AdminUserSearch[]>([])
  const [events, setEvents] = useState<AdminUserEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<'info' | 'sessions' | 'searches' | 'events'>('info')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [d, s, se, ev] = await Promise.all([
          getAdminUserDetails(userId),
          getAdminUserSessions(userId, 10),
          getAdminUserSearches(userId, 10),
          getAdminUserEvents(userId),
        ])
        setDetails(d)
        setSessions(s)
        setSearches(se)
        setEvents(ev)
      } finally {
        setLoading(false)
      }
    })()
  }, [userId])

  async function toggleActive() {
    if (!details) return
    const newActive = !details.is_active
    const ok = await adminUpdateUserStatus(userId, newActive)
    if (ok) setDetails({ ...details, is_active: newActive })
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.drawerOverlay}>
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>פרופיל משתמש</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.drawerCloseBtn}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.drawerLoading}>
              <ActivityIndicator size="large" color="#1A1A1A" />
            </View>
          ) : details ? (
            <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.drawerAvatar}>
                <Text style={styles.drawerAvatarText}>{details.email?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <Text style={styles.drawerEmail}>{details.email ?? '—'}</Text>

              <View style={styles.drawerSubTabs}>
                <SubTab label="מידע" active={section === 'info'} onPress={() => setSection('info')} />
                <SubTab label="סשנים" active={section === 'sessions'} onPress={() => setSection('sessions')} />
                <SubTab label="חיפושים" active={section === 'searches'} onPress={() => setSection('searches')} />
                <SubTab label="אירועים" active={section === 'events'} onPress={() => setSection('events')} />
              </View>

              {section === 'info' && (
                <>
                  <View style={styles.drawerStats}>
                    <DrawerStat label="קליקים" value={details.total_clicks} />
                    <DrawerStat label="מועדפים" value={details.total_favorites} />
                    <DrawerStat label="סשנים" value={details.session_count} />
                    <DrawerStat label="חיפושים" value={details.total_searches} />
                  </View>
                  <View style={styles.drawerInfoCard}>
                    <InfoRow label="מגדר" value={details.gender ?? '—'} />
                    <InfoRow label="חולצה" value={details.top_size ?? '—'} />
                    <InfoRow label="מכנסיים" value={details.bottom_size ?? '—'} />
                    <InfoRow label="נעליים" value={details.shoe_size ?? '—'} />
                    <InfoRow label="גזרה" value={details.fit ?? '—'} />
                    <InfoRow label="אזור" value={details.preferred_region ?? '—'} />
                    <InfoRow label="מידה סופית חולצה" value={details.final_top_size ?? '—'} />
                    <InfoRow label="מידה סופית מכנסיים" value={details.final_bottom_size ?? '—'} />
                    <InfoRow label="מידה סופית נעליים" value={details.final_shoe_size ?? '—'} />
                    <InfoRow label="נרשם" value={formatDateTime(details.created_at)} />
                    <InfoRow label="עדכון אחרון" value={details.updated_at ? formatDateTime(details.updated_at) : '—'} />
                    <InfoRow label="נראה לאחרונה" value={details.last_seen_at ? formatDateTime(details.last_seen_at) : '—'} />
                  </View>
                  <TouchableOpacity onPress={toggleActive} activeOpacity={0.7} style={[styles.toggleBtn, details.is_active === false && styles.toggleBtnActive]}>
                    <Text style={styles.toggleBtnText}>{details.is_active === false ? 'הפעל משתמש' : 'השהה משתמש'}</Text>
                  </TouchableOpacity>
                </>
              )}

              {section === 'sessions' && (
                <View style={styles.drawerInfoCard}>
                  {sessions.length === 0 ? (
                    <Text style={styles.emptyText}>אין סשנים</Text>
                  ) : sessions.map((s, i) => (
                    <View key={s.id} style={[styles.drawerItem, i % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={styles.drawerItemText}>{formatDateTime(s.session_start)}</Text>
                      <Text style={styles.drawerItemMeta}>{s.duration_seconds ? `${s.duration_seconds}s` : 'פעיל'}</Text>
                    </View>
                  ))}
                </View>
              )}

              {section === 'searches' && (
                <View style={styles.drawerInfoCard}>
                  {searches.length === 0 ? (
                    <Text style={styles.emptyText}>אין חיפושים</Text>
                  ) : searches.map((s, i) => (
                    <View key={s.id} style={[styles.drawerItem, i % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={styles.drawerItemText}>{s.search_query}</Text>
                      <Text style={styles.drawerItemMeta}>{s.search_type} · {s.results_count} תוצאות</Text>
                    </View>
                  ))}
                </View>
              )}

              {section === 'events' && (
                <View style={styles.drawerInfoCard}>
                  {events.length === 0 ? (
                    <Text style={styles.emptyText}>אין אירועים</Text>
                  ) : events.map((e, i) => (
                    <View key={e.id} style={[styles.drawerItem, i % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={styles.drawerItemText}>{e.emoji} {e.event_name}</Text>
                      <Text style={styles.drawerItemMeta}>{formatShortDate(e.event_date)} · {e.event_type}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>משתמש לא נמצא</Text>
          )}
        </View>
      </View>
    </Modal>
  )
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

function SubTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.subTab, active && styles.subTabActive]}>
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <View style={[styles.kpiCard, { borderTopColor: color }]}>
      <Text style={styles.kpiIcon}>{icon}</Text>
      <Text style={styles.kpiValue}>{value.toLocaleString()}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  )
}

function DrawerStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.drawerStat}>
      <Text style={styles.drawerStatValue}>{value}</Text>
      <Text style={styles.drawerStatLabel}>{label}</Text>
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

function activityIcon(type: string): string {
  switch (type) {
    case 'click': return '🖱️'
    case 'session': return '📱'
    case 'search': return '🔍'
    case 'signup': return '🎉'
    default: return '•'
  }
}

function typeLabel(t: string): string {
  switch (t) {
    case 'info': return 'מידע'
    case 'promo': return 'פרומו'
    case 'update': return 'עדכון'
    case 'alert': return 'התראה'
    default: return t
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'short' })
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

const FONT_HEADING = "'Permanent Marker', cursive" as const
const FONT_BODY = "'Caveat', 'Noto Sans Hebrew', cursive" as const
const PAPER_TEXTURE = 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)' as const
const SHADOW_STD = '3px 3px 0 #1A1A1A' as const
const SHADOW_SM = '2px 2px 0 #1A1A1A' as const
const SHADOW_ACTIVE = '3px 3px 0 #FFE566' as const
const RADIUS_BOX = '3px 12px 4px 10px / 8px 3px 9px 4px' as const
const RADIUS_SM = '2px 8px 3px 7px / 6px 2px 7px 3px' as const

function typeBtnActiveStyle(t: string): React.CSSProperties {
  return {
    backgroundColor: t === 'alert' ? '#1A1A1A' : t === 'promo' ? '#F5C842' : t === 'update' ? '#00FF66' : '#FFE566',
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E0' } as React.CSSProperties,
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 100, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: RADIUS_SM, backgroundColor: '#FFFEF5', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: SHADOW_SM } as React.CSSProperties,
  backArrow: { fontSize: 22, color: '#1A1A1A', fontFamily: FONT_HEADING },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_HEADING },
  refreshIcon: { fontSize: 22, color: '#1A1A1A', fontFamily: FONT_HEADING },
  spin: { opacity: 0.5 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 16 },
  loadingText: { fontSize: 16, color: '#4A4A4A', fontFamily: FONT_BODY },
  errorWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  errorIcon: { fontSize: 40, color: '#1A1A1A' },
  errorText: { fontSize: 15, color: '#4A4A4A', textAlign: 'center', fontFamily: FONT_BODY },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS_SM, backgroundColor: '#FFE566', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: SHADOW_SM } as React.CSSProperties,
  retryText: { color: '#1A1A1A', fontWeight: '700', fontSize: 15, fontFamily: FONT_HEADING },
  tabScroll: { marginBottom: 4 },
  tabBar: { flexDirection: 'row', gap: 6 },
  tab: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: RADIUS_SM, backgroundColor: '#FFFEF5', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: SHADOW_SM } as React.CSSProperties,
  tabActive: { backgroundColor: '#FFE566', boxShadow: SHADOW_ACTIVE } as React.CSSProperties,
  tabText: { fontSize: 14, fontWeight: '700', color: '#4A4A4A', fontFamily: FONT_BODY },
  tabTextActive: { color: '#1A1A1A', fontFamily: FONT_HEADING },
  sectionLabel: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 4, fontFamily: FONT_HEADING },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { width: '47%', flexGrow: 1, backgroundColor: '#FFFEF5', borderRadius: RADIUS_BOX, padding: 16, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: SHADOW_STD, borderTopWidth: 3 } as React.CSSProperties,
  kpiIcon: { fontSize: 24, marginBottom: 8 },
  kpiValue: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', fontFamily: FONT_HEADING },
  kpiLabel: { fontSize: 15, color: '#4A4A4A', marginTop: 4, fontFamily: FONT_BODY },
  card: { backgroundColor: '#FFFEF5', borderRadius: RADIUS_BOX, padding: 16, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: SHADOW_STD } as React.CSSProperties,
  emptyText: { fontSize: 15, color: '#9A9A9A', textAlign: 'center', paddingVertical: 24, fontFamily: FONT_BODY },
  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dailyDate: { width: 50, fontSize: 13, color: '#4A4A4A', fontFamily: FONT_BODY },
  dailyBarBg: { flex: 1, height: 12, borderRadius: RADIUS_SM, backgroundColor: '#FFFACC', overflow: 'hidden', borderWidth: 1, borderColor: '#1A1A1A' } as React.CSSProperties,
  dailyBar: { height: '100%', borderRadius: RADIUS_SM, backgroundColor: '#FFE566' } as React.CSSProperties,
  dailyCount: { width: 30, fontSize: 15, fontWeight: '700', color: '#1A1A1A', textAlign: 'left', fontFamily: FONT_HEADING },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#1A1A1A', paddingBottom: 8, marginBottom: 4 },
  tableHeaderCell: { fontWeight: '700', color: '#1A1A1A', fontSize: 13, fontFamily: FONT_HEADING },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#9A9A9A' },
  tableRowAlt: { backgroundColor: '#FFFACC', borderRadius: RADIUS_SM } as React.CSSProperties,
  tableCell: { fontSize: 13, color: '#2D2D2D', fontFamily: FONT_BODY },
  inactiveText: { color: '#1A1A1A', fontWeight: '700' },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#9A9A9A' },
  activityIcon: { fontSize: 18 },
  activityContent: { flex: 1 },
  activityDesc: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_BODY },
  activityMeta: { fontSize: 12, color: '#6B6B6B', marginTop: 2, fontFamily: FONT_BODY },
  broadcastModeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS_SM, backgroundColor: '#FFFACC', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  modeBtnActive: { backgroundColor: '#FFE566', boxShadow: SHADOW_SM } as React.CSSProperties,
  modeBtnText: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_BODY },
  modeBtnTextActive: { color: '#1A1A1A', fontFamily: FONT_HEADING },
  input: { backgroundColor: '#FFFEF5', borderRadius: RADIUS_SM, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, marginBottom: 10, borderWidth: 1.5, borderColor: '#1A1A1A', fontFamily: FONT_BODY, color: '#1A1A1A' } as React.CSSProperties,
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS_SM, backgroundColor: '#FFFACC', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  typeBtnText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_BODY },
  typeBtnTextActive: { color: '#1A1A1A', fontFamily: FONT_HEADING },
  sendBtn: { backgroundColor: '#00FF66', borderRadius: RADIUS_BOX, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: SHADOW_STD } as React.CSSProperties,
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '700', fontFamily: FONT_HEADING },
  resultText: { fontSize: 14, color: '#00CC52', textAlign: 'center', marginTop: 10, fontFamily: FONT_BODY, fontWeight: '700' },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawer: { backgroundColor: '#FFFEF5', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', borderWidth: 2, borderColor: '#1A1A1A' } as React.CSSProperties,
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1.5, borderBottomColor: '#1A1A1A' },
  drawerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_HEADING },
  drawerCloseBtn: { width: 32, height: 32, borderRadius: RADIUS_SM, backgroundColor: '#FFFACC', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  drawerCloseText: { fontSize: 16, color: '#1A1A1A', fontFamily: FONT_HEADING },
  drawerLoading: { paddingVertical: 60, alignItems: 'center' },
  drawerScroll: { padding: 16 },
  drawerAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFE566', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: SHADOW_SM } as React.CSSProperties,
  drawerAvatarText: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', fontFamily: FONT_HEADING },
  drawerEmail: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', marginBottom: 16, fontFamily: FONT_BODY },
  drawerSubTabs: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  subTab: { flex: 1, paddingVertical: 8, borderRadius: RADIUS_SM, backgroundColor: '#FFFACC', alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  subTabActive: { backgroundColor: '#FFE566', boxShadow: SHADOW_SM } as React.CSSProperties,
  subTabText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_BODY },
  subTabTextActive: { color: '#1A1A1A', fontFamily: FONT_HEADING },
  drawerStats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  drawerStat: { flex: 1, backgroundColor: '#FFFEF5', borderRadius: RADIUS_SM, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: SHADOW_SM } as React.CSSProperties,
  drawerStatValue: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', fontFamily: FONT_HEADING },
  drawerStatLabel: { fontSize: 12, color: '#4A4A4A', marginTop: 2, fontFamily: FONT_BODY },
  drawerInfoCard: { backgroundColor: '#FFFEF5', borderRadius: RADIUS_BOX, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#9A9A9A' },
  infoLabel: { fontSize: 14, color: '#4A4A4A', fontFamily: FONT_BODY },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_BODY },
  drawerItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#9A9A9A' },
  drawerItemText: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_BODY },
  drawerItemMeta: { fontSize: 12, color: '#6B6B6B', marginTop: 2, fontFamily: FONT_BODY },
  toggleBtn: { backgroundColor: '#FFFACC', borderRadius: RADIUS_BOX, paddingVertical: 14, alignItems: 'center', marginBottom: 20, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: SHADOW_STD } as React.CSSProperties,
  toggleBtnActive: { backgroundColor: '#FFFACC' },
  toggleBtnText: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: FONT_HEADING },
  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 52, backgroundColor: '#F5F0E0', backgroundImage: PAPER_TEXTURE } as React.CSSProperties,
  gateCard: { backgroundColor: '#FFFEF5', borderRadius: RADIUS_BOX, padding: 32, alignItems: 'center', width: '100%', maxWidth: 360, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: SHADOW_STD } as React.CSSProperties,
  gateLockIcon: { fontSize: 48, marginBottom: 16 },
  gateTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', marginBottom: 4, fontFamily: FONT_HEADING },
  gateSub: { fontSize: 15, color: '#4A4A4A', marginBottom: 20, fontFamily: FONT_BODY },
  gateInput: { width: '100%', backgroundColor: '#FFFEF5', borderRadius: RADIUS_SM, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, borderWidth: 1.5, borderColor: '#1A1A1A', marginBottom: 12, fontFamily: FONT_BODY, color: '#1A1A1A' } as React.CSSProperties,
  gateError: { fontSize: 14, color: '#1A1A1A', marginBottom: 8, fontFamily: FONT_BODY, fontWeight: '700' },
  gateBtn: { width: '100%', backgroundColor: '#FFE566', borderRadius: RADIUS_SM, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: '#1A1A1A', boxShadow: SHADOW_STD } as React.CSSProperties,
  gateBtnDisabled: { opacity: 0.5 },
  gateBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '700', fontFamily: FONT_HEADING },
})
