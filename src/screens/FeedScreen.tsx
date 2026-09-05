import React, { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Image } from 'react-native'
import { LinearGradient, BottomNav } from '../components'
import { type Screen, type User, type Product, type ScannedSizes, type DetectedDevice } from '../types'
import { fetchAliExpressProducts } from '../lib/aliexpress'

const PAGE_SIZE = 50

const CATEGORY_IDS: Record<string, string> = {
  all: '200000783,200000782,200000835,200000832,200000831',
  clothing: '200000783,200000782,200000835',
  shoes: '200000832,200000831',
  accessories: '200000788,200000785,200001661',
}

const CATEGORY_KEYWORDS: Record<string, string> = {
  all: 'fashion clothing',
  clothing: 'clothing apparel',
  shoes: 'shoes footwear',
  accessories: 'accessories bags',
}

export function FeedScreen({
  wishlistItems,
  onToggleWishlist,
  onNav,
  budget,
  setBudget,
  user,
  scannedSizes,
  detectedDevice,
  onCatalogChange,
}: {
  wishlistItems: number[]
  onToggleWishlist: (i: number) => void
  onNav: (s: Screen) => void
  budget: [number, number]
  setBudget: (b: [number, number]) => void
  user: User | null
  scannedSizes: ScannedSizes | null
  detectedDevice: DetectedDevice | null
  onCatalogChange: (catalog: Product[]) => void
}) {
  const [filter, setFilter] = useState<'all' | 'clothing' | 'shoes' | 'accessories'>('all')
  const [search, setSearch] = useState('')
  const [catalog, setCatalog] = useState<Product[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [pageNo, setPageNo] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadProducts = useCallback(async (page: number, append: boolean, category: string) => {
    if (append) setIsLoadingMore(true)
    else setIsLoadingProducts(true)
    setProductsError(null)
    try {
      const gender = scannedSizes?.gender ?? 'unisex'
      const deviceName = detectedDevice ? `${detectedDevice.brand} ${detectedDevice.model}`.trim() : ''
      const categoryIds = CATEGORY_IDS[category] || undefined

      // Build keywords dynamically based on category, device, and measurements
      let keywords = CATEGORY_KEYWORDS[category] ?? CATEGORY_KEYWORDS.all

      if (category === 'accessories' && deviceName) {
        // Accessories: append exact device name for compatible cases, holders, watch bands
        keywords = `${deviceName} case holder watch bands bags`
      } else if (category === 'clothing') {
        // Clothing: filtered by gender and size attributes
        if (scannedSizes?.style?.aestheticTags?.length) {
          keywords = `${keywords} ${scannedSizes.style.aestheticTags.slice(0, 2).join(' ')}`
        }
        if (scannedSizes?.style?.primaryStyle) {
          keywords = `${keywords} ${scannedSizes.style.primaryStyle}`
        }
      } else if (category === 'shoes') {
        // Shoes: filtered by gender
        keywords = `${keywords} ${gender}`
      } else if (category === 'all') {
        // All: combine clothes, shoes, and device-compatible accessories
        if (scannedSizes?.style?.aestheticTags?.length) {
          keywords = `${keywords} ${scannedSizes.style.aestheticTags.slice(0, 2).join(' ')}`
        }
        if (deviceName) {
          keywords = `${keywords} ${deviceName} accessories`
        }
      }

      console.log(`[Feed] Fetching results for Device: ${deviceName || 'N/A'}, Gender: ${gender}, Category: ${category}`)

      const remoteProducts = await fetchAliExpressProducts(keywords, page, PAGE_SIZE, gender, categoryIds)
      console.log('[FeedScreen] Fetched products:', remoteProducts.length, 'page:', page, 'append:', append, 'category:', category, 'keywords:', keywords)
      if (remoteProducts.length < PAGE_SIZE) setHasMore(false)

      // Direct state hydration — append unique items only
      setCatalog((prev) => {
        const existingIds = new Set(prev.map((p) => p.aliexpressSku).filter(Boolean))
        const deduped = remoteProducts.filter((p) => !p.aliexpressSku || !existingIds.has(p.aliexpressSku))
        const next = append ? [...prev, ...deduped] : deduped
        console.log('[FeedScreen] Catalog after update:', next.length, 'deduped:', remoteProducts.length - deduped.length)
        return next
      })
      if (!append && remoteProducts.length === 0) setProductsError('לא נמצאו מוצרים חיים כרגע')
    } catch (error: unknown) {
      if (!append) setCatalog([])
      setProductsError(error instanceof Error ? error.message : 'לא ניתן לטעון מוצרים חיים')
    } finally {
      setIsLoadingProducts(false)
      setIsLoadingMore(false)
    }
  }, [scannedSizes?.gender, scannedSizes?.style?.aestheticTags, scannedSizes?.style?.primaryStyle, detectedDevice])

  const handleFilterChange = useCallback((newFilter: typeof filter) => {
    console.log(`[Feed] Category changed to: ${newFilter}`)
    setFilter(newFilter)
    setPageNo(1)
    setHasMore(true)
    setCatalog([])
    void loadProducts(1, false, newFilter)
  }, [loadProducts])

  useEffect(() => {
    setPageNo(1)
    setHasMore(true)
    setCatalog([])
    void loadProducts(1, false, 'all')
  }, [loadProducts])

  useEffect(() => {
    onCatalogChange(catalog)
  }, [catalog, onCatalogChange])

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore || isLoadingProducts) return
    const nextPage = pageNo + 1
    console.log(`[Feed] Loading next page: ${nextPage}`)
    setPageNo(nextPage)
    void loadProducts(nextPage, true, filter)
  }, [isLoadingMore, hasMore, isLoadingProducts, pageNo, filter, loadProducts])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  const filtered = catalog.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.brand.toLowerCase().includes(search.toLowerCase())
    const price = typeof p.price === 'number' && !isNaN(p.price) ? p.price : 0
    const matchBudget = price >= budget[0] && price <= budget[1]
    return matchSearch && matchBudget
  })

  console.log('[Feed UI] Products to display in render:', filtered.length, 'of', catalog.length, 'budget:', budget)

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={feedStyles.header}>
        <View style={feedStyles.statusRow}>
          <View style={feedStyles.statusLeft}>
            <View style={feedStyles.statusDot} />
            <Text style={feedStyles.statusText}>
              {scannedSizes ? `מידות: ${scannedSizes.sizing.top} · ${scannedSizes.sizing.bottom} · ${scannedSizes.sizing.fit}` : 'טרם נסרקת'}
            </Text>
            {user ? (
              <View style={feedStyles.loggedInBadge}><Text style={feedStyles.loggedInBadgeText}>מחובר ✓</Text></View>
            ) : (
              <View style={feedStyles.guestBadge}><Text style={feedStyles.guestBadgeText}>אורח</Text></View>
            )}
          </View>
          <TouchableOpacity onPress={() => onNav('profile')} activeOpacity={0.7} style={[feedStyles.avatarBtn, user ? feedStyles.avatarBtnUser : feedStyles.avatarBtnGuest]}>
            <Text style={feedStyles.avatarText}>{user ? user.name[0] : '👤'}</Text>
            {user && <View style={feedStyles.avatarDot} />}
          </TouchableOpacity>
        </View>

        <Text style={feedStyles.feedTitle}>הפיד שלי</Text>

        <BudgetSlider budget={budget} setBudget={setBudget} />

        <View style={feedStyles.searchBox}>
          <Text style={{ color: '#94A3B8' }}>🔍</Text>
          <TextInput
            placeholder="חפש בגדים, נעליים, אביזרים..."
            value={search}
            onChangeText={setSearch}
            style={feedStyles.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={feedStyles.filterRow} contentContainerStyle={{ gap: 7, paddingBottom: 14 }}>
          {[
            { key: 'all', label: 'הכל' },
            { key: 'clothing', label: '👕 בגדים' },
            { key: 'shoes', label: '👟 נעליים' },
            { key: 'accessories', label: '📱 אביזרים' },
          ].map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => handleFilterChange(key as typeof filter)}
              activeOpacity={0.7}
              style={[feedStyles.filterBtn, filter === key && feedStyles.filterBtnActive]}
            >
              <Text style={[feedStyles.filterBtnText, filter === key && feedStyles.filterBtnTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
        <LinearGradient colors={['#0B1437', '#1A2F7A']} style={feedStyles.aiMatchBar}>
          <Text style={{ fontSize: 22 }}>🎯</Text>
          <View style={{ flex: 1 }}>
            <Text style={feedStyles.aiMatchTitle}>Fitgura AI Match פעיל</Text>
            <Text style={feedStyles.aiMatchSub}>כל הפריטים מסוננים לפי סריקת AI + תקציב</Text>
          </View>
          <View style={feedStyles.aiMatchCount}>
            <Text style={feedStyles.aiMatchCountText}>{filtered.length} פריטים</Text>
          </View>
        </LinearGradient>

        {isLoadingProducts && (
          <View style={feedStyles.loadingState}>
            <Text style={{ fontSize: 20 }}>⟳</Text>
            <Text style={feedStyles.loadingText}>טוען מוצרים חדשים מ-AliExpress...</Text>
          </View>
        )}

        {productsError && !isLoadingProducts && (
          <View style={feedStyles.productsNotice}>
            <Text style={feedStyles.productsNoticeTitle}>לא ניתן לטעון מוצרים מ-AliExpress</Text>
            <Text style={feedStyles.productsNoticeText}>{productsError}</Text>
            <TouchableOpacity onPress={() => void loadProducts(1, false, filter)} style={feedStyles.retryBtn} activeOpacity={0.8}>
              <Text style={feedStyles.retryBtnText}>נסה שוב</Text>
            </TouchableOpacity>
          </View>
        )}

        {filtered.length === 0 && !isLoadingProducts && !productsError && (
          <View style={feedStyles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔍</Text>
            <Text style={feedStyles.emptyText}>אין פריטים בטווח התקציב הנבחר</Text>
            <TouchableOpacity
              onPress={() => { handleFilterChange('all'); setSearch(''); setBudget([0, 5000]); }}
              activeOpacity={0.8}
              style={{ marginTop: 12, backgroundColor: '#2E5BFF', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" }}>אפס סינון</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={feedStyles.productGrid}>
          {filtered.map((product) => {
            const globalIdx = catalog.indexOf(product)
            return (
              <ProductCard
                key={globalIdx}
                product={product}
                inWishlist={wishlistItems.includes(globalIdx)}
                onToggleWishlist={() => onToggleWishlist(globalIdx)}
                scannedSizes={scannedSizes}
              />
            )
          })}
        </View>

        <View ref={sentinelRef} style={{ height: 1, width: '100%' }} />

        {isLoadingMore && (
          <View style={feedStyles.loadingState}>
            <Text style={{ fontSize: 20 }}>⟳</Text>
            <Text style={feedStyles.loadingText}>טוען עוד מוצרים...</Text>
          </View>
        )}

        <View style={feedStyles.familyTeaser}>
          <Text style={{ fontSize: 26 }}>👨‍👩‍👧</Text>
          <View style={{ flex: 1 }}>
            <Text style={feedStyles.familyTitle}>רוצה לסנכרן גם את בני המשפחה?</Text>
            <Text style={feedStyles.familySub}>סריקת AI לכל הבית — בקרוב</Text>
          </View>
          <View style={feedStyles.familyBadge}><Text style={feedStyles.familyBadgeText}>בקרוב</Text></View>
        </View>
      </ScrollView>

      <BottomNav current="feed" onNav={onNav} />
    </View>
  )
}

function BudgetSlider({ budget, setBudget }: { budget: [number, number]; setBudget: (b: [number, number]) => void }) {
  const MIN = 0
  const MAX = 5000
  const STEP = 10

  function getPercent(val: number) { return ((val - MIN) / (MAX - MIN)) * 100 }

  function clamp(val: number) { return Math.max(MIN, Math.min(MAX, val)) }

  function setLow(val: number) {
    setBudget([Math.min(clamp(val), budget[1] - STEP), budget[1]])
  }

  function setHigh(val: number) {
    setBudget([budget[0], Math.max(clamp(val), budget[0] + STEP)])
  }

  return (
    <View style={feedStyles.budgetCard}>
      <View style={feedStyles.budgetHeader}>
        <Text style={feedStyles.budgetTitle}>הגדר תקציב</Text>
        <Text style={feedStyles.budgetValue}>₪{budget[0]} – ₪{budget[1]}</Text>
      </View>
      <View style={feedStyles.budgetRailWrap}>
        <View style={feedStyles.budgetRail} />
        <View
          style={[
            feedStyles.budgetFill,
            { left: `${getPercent(budget[0])}%`, right: `${100 - getPercent(budget[1])}%` },
          ]}
        />
        <input
          type="range"
          className="budget-range-input"
          min={MIN}
          max={MAX}
          step={STEP}
          value={budget[0]}
          onChange={(e) => setLow(Number(e.target.value))}
          style={{
            ...feedStyles.budgetRangeInput,
            left: 0,
            right: '50%',
          }}
        />
        <input
          type="range"
          className="budget-range-input"
          min={MIN}
          max={MAX}
          step={STEP}
          value={budget[1]}
          onChange={(e) => setHigh(Number(e.target.value))}
          style={{
            ...feedStyles.budgetRangeInput,
            left: '50%',
            right: 0,
          }}
        />
      </View>
      <View style={feedStyles.budgetLabels}>
        {['₪0', '₪1000', '₪2500', '₪5000'].map((l) => (
          <Text key={l} style={feedStyles.budgetLabel}>{l}</Text>
        ))}
      </View>
    </View>
  )
}

function formatPrice(price: number, currency?: string): string {
  const symbol = currency ?? '₪'
  return `${symbol}${price.toLocaleString()}`
}

function ProductCard({ product, inWishlist, onToggleWishlist, scannedSizes }: { product: Product; inWishlist: boolean; onToggleWishlist: () => void; scannedSizes: ScannedSizes | null }) {
  return (
    <View style={feedStyles.productCard}>
      <View style={feedStyles.productImageWrap}>
        <Image
          source={{ uri: product.img.startsWith('http') ? product.img : `https://images.unsplash.com/${product.img}?w=300&h=345&fit=crop&auto=format` }}
          style={feedStyles.productImage}
        />
        <TouchableOpacity
          onPress={onToggleWishlist}
          activeOpacity={0.7}
          style={feedStyles.heartBtn}
        >
          <Text style={{ fontSize: 15 }}>{inWishlist ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
        <View style={feedStyles.aiBadge}>
          <View style={feedStyles.aiBadgeDot} />
          <Text style={feedStyles.aiBadgeText}>AI Match</Text>
        </View>
      </View>
      <View style={feedStyles.productInfo}>
        <View style={feedStyles.matchChip}>
          <Text style={feedStyles.matchChipText}>
            {scannedSizes ? `✓ מתאים למידה: ${scannedSizes.sizing.top} / ${scannedSizes.sizing.bottom}` : '✓ מתאים למידה שנסרקה'}
          </Text>
        </View>
        <Text style={feedStyles.productName}>{product.name}</Text>
        <Text style={feedStyles.productBrand}>{product.brand}</Text>
        <View style={feedStyles.priceRow}>
          <Text style={feedStyles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
          {product.originalPrice && product.originalPrice > product.price && (
            <Text style={feedStyles.productOriginalPrice}>{formatPrice(product.originalPrice, product.currency)}</Text>
          )}
        </View>
        <View style={feedStyles.buyBtnRow}>
          <TouchableOpacity
            onPress={() => window.open(product.aliexpressUrl ?? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(product.brand + ' ' + product.name)}`, '_blank')}
            activeOpacity={0.8}
            style={feedStyles.buyBtnAli}
          >
            <Text style={feedStyles.buyBtnText}>🛒 AliExpress</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const feedStyles = StyleSheet.create({
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingTop: 52, paddingHorizontal: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ED573' },
  statusText: { fontSize: 12, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  loggedInBadge: { backgroundColor: '#EEF2FF', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  loggedInBadgeText: { fontSize: 11, color: '#2E5BFF', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  guestBadge: { backgroundColor: '#FFF7ED', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  guestBadgeText: { fontSize: 11, color: '#EA580C', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  avatarBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarBtnUser: { backgroundColor: '#2E5BFF' },
  avatarBtnGuest: { backgroundColor: '#94A3B8' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  avatarDot: { position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#2ED573', borderWidth: 2, borderColor: '#fff' },
  feedTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginBottom: 14, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  budgetCard: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 12 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  budgetTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  budgetValue: { fontSize: 13, fontWeight: '700', color: '#2E5BFF' },
  budgetRailWrap: { position: 'relative', height: 22, justifyContent: 'center' },
  budgetRail: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3 },
  budgetFill: { position: 'absolute', top: 8, height: 6, backgroundColor: '#2E5BFF', borderRadius: 3 },
  budgetRangeInput: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 'auto',
    height: 22,
    margin: 0,
    padding: 0,
    background: 'transparent',
    outline: 'none',
  } as React.CSSProperties,
  budgetLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  budgetLabel: { fontSize: 10, color: '#CBD5E1' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 13, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  filterRow: { flexGrow: 0 },
  filterBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#F1F5F9' },
  filterBtnActive: { backgroundColor: '#2E5BFF' },
  filterBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  filterBtnTextActive: { color: '#fff' },
  aiMatchBar: { borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiMatchTitle: { fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  aiMatchSub: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  aiMatchCount: { backgroundColor: 'rgba(46,213,115,0.2)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  aiMatchCountText: { fontSize: 12, fontWeight: '700', color: '#2ED573' },
  loadingState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: '#EEF2FF', borderRadius: 12 },
  loadingText: { color: '#2E5BFF', fontSize: 12, fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  productsNotice: { padding: 16, backgroundColor: '#FFF7ED', borderRadius: 12, borderWidth: 1, borderColor: '#FED7AA', gap: 8 },
  productsNoticeTitle: { color: '#C2410C', fontSize: 14, fontWeight: '700', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  productsNoticeText: { color: '#9A3412', fontSize: 12, textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  retryBtn: { alignSelf: 'center', marginTop: 8, backgroundColor: '#C2410C', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  retryBtnText: { color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  productCard: { width: '48%', backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' },
  productImageWrap: { position: 'relative', height: 200, backgroundColor: '#F1F5F9' },
  productImage: { width: '100%', height: '100%' },
  heartBtn: { position: 'absolute', top: 8, left: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  aiBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(11,20,55,0.85)', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiBadgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#2ED573' },
  aiBadgeText: { fontSize: 9, color: '#fff', fontWeight: '600' },
  productInfo: { padding: 10 },
  matchChip: { backgroundColor: '#F0FFF6', borderWidth: 1, borderColor: 'rgba(46,213,115,0.35)', borderRadius: 7, paddingVertical: 3, paddingHorizontal: 7, marginBottom: 6, alignSelf: 'flex-start' },
  matchChipText: { fontSize: 9, fontWeight: '700', color: '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  productName: { fontSize: 13, fontWeight: '600', color: '#1E293B', lineHeight: 17, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  productBrand: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  productPrice: { fontSize: 14, fontWeight: '700', color: '#2E5BFF' },
  productOriginalPrice: { fontSize: 12, color: '#94A3B8', textDecorationLine: 'line-through' },
  buyBtnRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  buyBtnAli: { flex: 1, backgroundColor: '#FF4747', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  buyBtnText: { color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  familyTeaser: { backgroundColor: '#FFF5F0', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,107,107,0.2)' },
  familyTitle: { fontSize: 13, fontWeight: '700', color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  familySub: { fontSize: 11, color: '#FB923C', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  familyBadge: { backgroundColor: 'rgba(255,107,107,0.12)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  familyBadgeText: { fontSize: 11, fontWeight: '700', color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
