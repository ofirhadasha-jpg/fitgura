import React from 'react'
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native'
import { BottomNav } from '../components'
import { type Screen, type Product } from '../types'

export function WishlistScreen({ onNav, wishlistItems, budget, catalog }: { onNav: (s: Screen) => void; wishlistItems: number[]; budget: [number, number]; catalog: Product[] }) {
  const saved = catalog.filter((_, i) => wishlistItems.includes(i))
  const inBudget = saved.filter((p) => p.price >= budget[0] && p.price <= budget[1])
  const outBudget = saved.filter((p) => p.price < budget[0] || p.price > budget[1])

  return (
    <View style={{ flex: 1 }}>
      <View style={wlStyles.header}>
        <Text style={wlStyles.headerTitle}>רשימת המשאלות שלי</Text>
        <Text style={wlStyles.headerSub}>
          {saved.length} פריטים שמורים • {inBudget.length} בטווח התקציב
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 10 }}>
        {saved.length === 0 && (
          <View style={wlStyles.emptyState}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>🤍</Text>
            <Text style={wlStyles.emptyText}>עוד לא שמרת פריטים</Text>
          </View>
        )}

        {inBudget.length > 0 && (
          <>
            <View style={wlStyles.sectionHeader}>
              <Text style={{ fontSize: 14 }}>✅</Text>
              <Text style={wlStyles.sectionTitle}>בטווח התקציב שלך</Text>
              <View style={wlStyles.sectionLine} />
              <Text style={wlStyles.sectionBudget}>₪{budget[0]}–₪{budget[1]}</Text>
            </View>
            <View style={{ gap: 10, marginBottom: 24 }}>
              {inBudget.map((p, i) => <WishlistRow key={i} product={p} inBudget />)}
            </View>
          </>
        )}

        {outBudget.length > 0 && (
          <>
            <View style={wlStyles.sectionHeader}>
              <Text style={{ fontSize: 14 }}>💸</Text>
              <Text style={[wlStyles.sectionTitle, { color: '#94A3B8' }]}>מחוץ לתקציב</Text>
              <View style={wlStyles.sectionLine} />
            </View>
            <View style={{ gap: 10 }}>
              {outBudget.map((p, i) => <WishlistRow key={i} product={p} inBudget={false} />)}
            </View>
          </>
        )}
      </ScrollView>

      <BottomNav current="wishlist" onNav={onNav} />
    </View>
  )
}

function WishlistRow({ product, inBudget }: { product: Product; inBudget: boolean }) {
  return (
    <View style={[wlStyles.row, { opacity: inBudget ? 1 : 0.6 }]}>
      <Image
        source={{ uri: `https://images.unsplash.com/${product.img}?w=80&h=80&fit=crop&auto=format` }}
        style={wlStyles.rowImage}
      />
      <View style={{ flex: 1 }}>
        <Text style={wlStyles.rowName}>{product.name}</Text>
        <Text style={wlStyles.rowBrand}>{product.brand}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[wlStyles.rowPrice, { color: inBudget ? '#2E5BFF' : '#94A3B8' }]}>₪{product.price}</Text>
          <View style={wlStyles.rowAiBadge}><Text style={wlStyles.rowAiBadgeText}>AI ✓</Text></View>
        </View>
      </View>
      <Text style={{ fontSize: 20 }}>{inBudget ? '❤️' : '🤍'}</Text>
    </View>
  )
}

const wlStyles = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  headerSub: { fontSize: 13, color: '#94A3B8', marginTop: 4, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontWeight: '700', color: '#1E293B', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#F1F5F9' },
  sectionBudget: { fontSize: 12, color: '#16A34A', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 12 },
  rowImage: { width: 58, height: 58, borderRadius: 12 },
  rowName: { fontWeight: '600', fontSize: 14, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  rowBrand: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  rowPrice: { fontSize: 14, fontWeight: '700' },
  rowAiBadge: { backgroundColor: '#F0FFF6', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5 },
  rowAiBadgeText: { fontSize: 10, fontWeight: '700', color: '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
