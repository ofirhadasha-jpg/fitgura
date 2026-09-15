import React from 'react'
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native'
import { BottomNav } from '../components'
import { type Screen, type Product } from '../types'

export function WishlistScreen({ onNav, wishlistItems, budget, catalog, isAdmin }: { onNav: (s: Screen) => void; wishlistItems: number[]; budget: [number, number]; catalog: Product[]; isAdmin?: boolean }) {
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
              <Text style={[wlStyles.sectionTitle, { color: '#9A9A9A' }]}>מחוץ לתקציב</Text>
              <View style={wlStyles.sectionLine} />
            </View>
            <View style={{ gap: 10 }}>
              {outBudget.map((p, i) => <WishlistRow key={i} product={p} inBudget={false} />)}
            </View>
          </>
        )}
      </ScrollView>

      <BottomNav current="wishlist" onNav={onNav} isAdmin={isAdmin} />
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
          <Text style={[wlStyles.rowPrice, { color: inBudget ? '#1A1A1A' : '#9A9A9A' }]}>₪{product.price}</Text>
          <View style={wlStyles.rowAiBadge}><Text style={wlStyles.rowAiBadgeText}>AI ✓</Text></View>
        </View>
      </View>
      <Text style={{ fontSize: 20 }}>{inBudget ? '❤️' : '🤍'}</Text>
    </View>
  )
}

const wlStyles = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 20, backgroundColor: '#FFE566', borderBottomWidth: 2, borderBottomColor: '#1A1A1A' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  headerSub: { fontSize: 13, color: '#2D2D2D', marginTop: 4, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 14, fontFamily: "'Permanent Marker', cursive" },
  sectionLine: { flex: 1, height: 2, backgroundColor: '#1A1A1A' },
  sectionBudget: { fontSize: 12, color: '#00CC52', fontWeight: '600', fontFamily: "'Permanent Marker', cursive" },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFEF5', borderWidth: 1.5, borderColor: '#1A1A1A', borderRadius: 3, padding: 12, boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  rowImage: { width: 58, height: 58, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  rowName: { fontWeight: '600', fontSize: 14, color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  rowBrand: { fontSize: 11, color: '#4A4A4A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  rowPrice: { fontSize: 14, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  rowAiBadge: { backgroundColor: '#E0FFF0', paddingVertical: 2, paddingHorizontal: 6, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  rowAiBadgeText: { fontSize: 10, fontWeight: '700', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
})
