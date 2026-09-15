import React from 'react'
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native'
import { LinearGradient, BottomNav } from '../components'
import { type Screen, type Product } from '../types'

export function WishlistScreen({ onNav, wishlistItems, budget, catalog, isAdmin }: { onNav: (s: Screen) => void; wishlistItems: number[]; budget: [number, number]; catalog: Product[]; isAdmin?: boolean }) {
  const saved = catalog.filter((_, i) => wishlistItems.includes(i))
  const inBudget = saved.filter((p) => p.price >= budget[0] && p.price <= budget[1])
  const outBudget = saved.filter((p) => p.price < budget[0] || p.price > budget[1])

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F0E6' }}>
      <LinearGradient colors={['#1A1A1A', '#2A2520']} style={wlStyles.header}>
        <View style={wlStyles.headerOrb1} />
        <View style={wlStyles.headerOrb2} />
        <View style={{ position: 'relative', zIndex: 1 }}>
          <Text style={wlStyles.headerTitle}>רשימת המשאלות שלי</Text>
          <Text style={wlStyles.headerSub}>
            {saved.length} פריטים שמורים • {inBudget.length} בטווח התקציב
          </Text>
        </View>
      </LinearGradient>

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
              <Text style={[wlStyles.sectionTitle, { color: '#8B8175' }]}>מחוץ לתקציב</Text>
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
          <Text style={[wlStyles.rowPrice, { color: inBudget ? '#1A1A1A' : '#8B8175' }]}>₪{product.price}</Text>
          <View style={wlStyles.rowAiBadge}><Text style={wlStyles.rowAiBadgeText}>AI ✓</Text></View>
        </View>
      </View>
      <Text style={{ fontSize: 20 }}>{inBudget ? '❤️' : '🤍'}</Text>
    </View>
  )
}

const wlStyles = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 20, position: 'relative', overflow: 'hidden' },
  headerOrb1: { position: 'absolute', top: -40, left: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(92,200,168,0.12)' },
  headerOrb2: { position: 'absolute', bottom: -30, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,107,107,0.1)' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#8B8175', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontWeight: '700', color: '#1A1A1A', fontSize: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#F5F0E6' },
  sectionBudget: { fontSize: 12, color: '#4CAF7D', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#1A1A1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, transitionProperty: 'transform', transitionDuration: '0.2s' } as React.CSSProperties,
  rowImage: { width: 58, height: 58, borderRadius: 12 },
  rowName: { fontWeight: '600', fontSize: 14, color: '#1A1A1A', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  rowBrand: { fontSize: 11, color: '#8B8175', marginTop: 2 },
  rowPrice: { fontSize: 14, fontWeight: '700' },
  rowAiBadge: { backgroundColor: '#E8F5EF', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5 },
  rowAiBadgeText: { fontSize: 10, fontWeight: '700', color: '#4CAF7D', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
