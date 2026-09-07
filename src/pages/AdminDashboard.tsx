import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import type { Screen } from '../types'
import { BottomNav } from '../components'
import { getSummaryStats, getDailyAnalytics, getTopProducts, type SummaryStats, type DailyAnalytics, type TopProduct } from '../services/analyticsService'

export function AdminDashboard({ onNav }: { onNav: (s: Screen) => void }) {
  const [stats, setStats] = useState<SummaryStats | null>(null)
  const [daily, setDaily] = useState<DailyAnalytics[]>([])
  const [products, setProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, d, p] = await Promise.all([getSummaryStats(), getDailyAnalytics(), getTopProducts()])
      setStats(s)
      setDaily(d)
      setProducts(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const maxDailyClicks = Math.max(...daily.map((d) => d.click_count), 1)

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => onNav('profile')} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>ניתוח מערכת</Text>
          <TouchableOpacity onPress={fetchData} style={styles.refreshBtn} activeOpacity={0.7}>
            <Text style={styles.refreshIcon}>↻</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0EA5E9" />
            <Text style={styles.loadingText}>טוען נתונים...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorIcon}>⚠</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchData} style={styles.retryBtn} activeOpacity={0.7}>
              <Text style={styles.retryText}>נסה שוב</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>מדדי ביצוע</Text>
            <View style={styles.kpiGrid}>
              <KpiCard label="סה״כ קליקים" value={stats?.total_clicks ?? 0} icon="📊" color="#0EA5E9" />
              <KpiCard label="קליקים היום" value={stats?.clicks_today ?? 0} icon="📅" color="#10B981" />
              <KpiCard label="קליקים החודש" value={stats?.clicks_this_month ?? 0} icon="📆" color="#F59E0B" />
              <KpiCard label="משתמשים פעילים" value={stats?.unique_active_clickers ?? 0} icon="👥" color="#8B5CF6" />
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

            <Text style={styles.sectionLabel}>מוצרים מובילים</Text>
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
                      <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={2}>
                        {p.product_title ?? p.product_id}
                      </Text>
                      <Text style={[styles.tableCell, { flex: 1 }]}>{p.total_clicks}</Text>
                      <Text style={[styles.tableCell, { flex: 1 }]}>{formatShortDate(p.last_clicked_at)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <BottomNav current="profile" onNav={onNav} />
    </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 100, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  backArrow: { fontSize: 22, color: '#1E293B' },
  title: { fontSize: 22, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  refreshBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  refreshIcon: { fontSize: 22, color: '#0EA5E9' },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 16 },
  loadingText: { fontSize: 14, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  errorWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  errorIcon: { fontSize: 40, color: '#EF4444' },
  errorText: { fontSize: 14, color: '#64748B', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0EA5E9' },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
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
