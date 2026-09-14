import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import type { Screen } from '../types'
import { BottomNav } from '../components'
import {
  getEnhancedSummary,
  getDailyAnalytics,
  getTopProducts,
  getAdminUserList,
  getAdminRecentClicks,
  type EnhancedSummaryStats,
  type DailyAnalytics,
  type TopProduct,
  type AdminUserRow,
  type AdminClickRow,
} from '../services/analyticsService'

type Tab = 'overview' | 'users' | 'clicks' | 'products'

export function AdminDashboard({ onNav }: { onNav: (s: Screen) => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [summary, setSummary] = useState<EnhancedSummaryStats | null>(null)
  const [daily, setDaily] = useState<DailyAnalytics[]>([])
  const [products, setProducts] = useState<TopProduct[]>([])
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [clicks, setClicks] = useState<AdminClickRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const [s, d, p, u, c] = await Promise.all([
        getEnhancedSummary(),
        getDailyAnalytics(),
        getTopProducts(),
        getAdminUserList(),
        getAdminRecentClicks(50),
      ])
      setSummary(s)
      setDaily(d)
      setProducts(p)
      setUsers(u)
      setClicks(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const maxDailyClicks = Math.max(...daily.map((d) => d.click_count), 1)

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0EA5E9" />
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
            <View style={styles.tabBar}>
              <TabBtn label="סקירה" active={tab === 'overview'} onPress={() => setTab('overview')} />
              <TabBtn label="משתמשים" active={tab === 'users'} onPress={() => setTab('users')} />
              <TabBtn label="קליקים" active={tab === 'clicks'} onPress={() => setTab('clicks')} />
              <TabBtn label="מוצרים" active={tab === 'products'} onPress={() => setTab('products')} />
            </View>

            {tab === 'overview' && (
              <>
                <Text style={styles.sectionLabel}>מדדי ביצוע</Text>
                <View style={styles.kpiGrid}>
                  <KpiCard label="סה״כ קליקים" value={summary?.total_clicks ?? 0} icon="📊" color="#0EA5E9" />
                  <KpiCard label="קליקים היום" value={summary?.clicks_today ?? 0} icon="📅" color="#10B981" />
                  <KpiCard label="קליקים החודש" value={summary?.clicks_this_month ?? 0} icon="📆" color="#F59E0B" />
                  <KpiCard label="קליקרים ייחודיים" value={summary?.unique_active_clickers ?? 0} icon="👥" color="#8B5CF6" />
                  <KpiCard label="סה״כ משתמשים" value={summary?.total_users ?? 0} icon="👤" color="#3B82F6" />
                  <KpiCard label="משתמשים חדשים" value={summary?.new_users_today ?? 0} icon="✨" color="#EC4899" />
                  <KpiCard label="סה״כ מועדפים" value={summary?.total_favorites ?? 0} icon="💚" color="#14B8A6" />
                  <KpiCard label="מוצרים פעילים" value={products.length} icon="🏷️" color="#F97316" />
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
                        <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>הצטרף</Text>
                      </View>
                      {users.map((u, i) => (
                        <View key={u.user_id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{u.email ?? '—'}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{u.top_size ?? '—'} / {u.bottom_size ?? '—'}</Text>
                          <Text style={[styles.tableCell, { flex: 1 }]}>{formatShortDate(u.created_at)}</Text>
                        </View>
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
          </>
        )}
      </ScrollView>
      <BottomNav current="profile" onNav={onNav} />
    </View>
  )
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 100, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  backArrow: { fontSize: 22, color: '#1E293B' },
  title: { fontSize: 22, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  refreshIcon: { fontSize: 22, color: '#0EA5E9' },
  spin: { opacity: 0.5 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 16 },
  loadingText: { fontSize: 14, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  errorWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  errorIcon: { fontSize: 40, color: '#EF4444' },
  errorText: { fontSize: 14, color: '#64748B', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0EA5E9' },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  tabBar: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  tabActive: { backgroundColor: '#0EA5E9' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  tabTextActive: { color: '#fff' },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { width: '47%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderTopWidth: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  kpiIcon: { fontSize: 24, marginBottom: 8 },
  kpiValue: { fontSize: 28, fontWeight: '800', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  kpiLabel: { fontSize: 13, color: '#64748B', marginTop: 4, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 24, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dailyDate: { width: 50, fontSize: 12, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  dailyBarBg: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  dailyBar: { height: '100%', borderRadius: 5, backgroundColor: '#0EA5E9' },
  dailyCount: { width: 30, fontSize: 13, fontWeight: '600', color: '#1E293B', textAlign: 'left', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8, marginBottom: 4 },
  tableHeaderCell: { fontWeight: '700', color: '#1E293B', fontSize: 12, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tableRowAlt: { backgroundColor: '#F8FAFC', borderRadius: 6 },
  tableCell: { fontSize: 12, color: '#475569', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
