import React, { useEffect, useState, useRef, useCallback } from 'react'
import type { GestureResponderEvent } from 'react-native'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Image } from 'react-native'
import { LinearGradient, BottomNav } from '../components'
import { type Screen, type User, type Product, type ScannedSizes, type DetectedDevice } from '../types'
import { fetchAliExpressProducts } from '../lib/aliexpress'
import { formatFullPantsSizeLabel, euToUsPants, type SizeRegion } from '../utils/sizeConverter'

const PAGE_SIZE = 50

const CATEGORY_IDS: Record<string, string> = {
  all: '200000783,200000782,200000835,200000832,200000831',
  clothing: '200000783,200000782,200000835',
  shoes: '200000832,200000831',
  accessories: '5090301,509',
}

// Apparel + footwear category IDs to hard-exclude from accessories searches
const APPAREL_EXCLUDE_IDS = ['200000783', '200000782', '200000835', '200000832', '200000831']

// Clothing/footwear keywords to client-side filter out of accessories results
const CLOTHING_KEYWORDS_REGEX = /\b(shirt|pants|dress|hoodie|jacket|sweater|jeans|shorts|skirt|blouse|coat|t-shirt|tank\s*top|underwear|shoes|socks|sneakers|boots|sandals|חולצה|מכנסיים|שמלה|נעליים|גרביים|ז'?קט|מעיל|בגד|גופייה)\b/i

// Tech accessory keywords — products must match at least one to be included in accessories
const TECH_ACCESSORY_KEYWORDS_REGEX = /\b(case|cover|protector|charger|holder|cable|adapter|stand|mount|screen\s*protector|wireless\s*charger|camera\s*lens|tempered\s*glass|dock|hub|power\s*bank|car\s*charger)\b/i

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

      if (category === 'accessories') {
        // Accessories: build device-specific search from the recognized device model.
        // AliExpress titles typically use the model name alone (e.g. "Galaxy S23 case", "iPhone 15 Pro cover")
        // so we prefer the model over brand+model, and keep keywords short for better API results.
        if (detectedDevice) {
          const model = detectedDevice.model.trim()
          const isDesktop = detectedDevice.brand === 'Desktop'
          if (isDesktop) {
            keywords = `laptop case cover sleeve stand`
          } else {
            // Use just the model name — it's the most specific and common in product titles
            keywords = `${model} case cover protector`
          }
        } else {
          keywords = `phone case cover protector`
        }
      } else if (category === 'clothing') {
        // Clothing: filtered by gender and size attributes
        if (scannedSizes?.style?.aestheticTags?.length) {
          keywords = `${keywords} ${scannedSizes.style.aestheticTags.slice(0, 2).join(' ')}`
        }
        if (scannedSizes?.style?.primaryStyle) {
          keywords = `${keywords} ${scannedSizes.style.primaryStyle}`
        }
        // Include both EU and US pants size equivalencies for broader seller matching
        if (scannedSizes?.sizing?.bottom) {
          const euSize = scannedSizes.sizing.bottom
          const usSize = euToUsPants(euSize)
          keywords = `${keywords} size ${euSize} EU ${usSize} US`
        }
      } else if (category === 'shoes') {
        // Shoes: filtered by gender and shoe size
        const shoeSize = scannedSizes?.shoeSize
        keywords = `${keywords} ${gender}`
        if (shoeSize) {
          keywords = `${keywords} size ${shoeSize} EU`
        }
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

      // Client-side filtering for accessories:
      //  Exclusion: discard any product whose title contains apparel/footwear keywords
      //  (Inclusion is handled by the search keywords + category_ids — no extra device-name gate)
      const cleanedProducts = category === 'accessories'
        ? remoteProducts.filter((p) => !CLOTHING_KEYWORDS_REGEX.test(p.name))
        : remoteProducts

      // Direct state hydration — append unique items only
      setCatalog((prev) => {
        const existingIds = new Set(prev.map((p) => p.aliexpressSku).filter(Boolean))
        const deduped = cleanedProducts.filter((p) => !p.aliexpressSku || !existingIds.has(p.aliexpressSku))
        const next = append ? [...prev, ...deduped] : deduped
        console.log('[FeedScreen] Catalog after update:', next.length, 'deduped:', cleanedProducts.length - deduped.length)
        return next
      })
      if (!append && cleanedProducts.length === 0) setProductsError('לא נמצאו מוצרים חיים כרגע')
    } catch (error: unknown) {
      if (!append) setCatalog([])
      setProductsError(error instanceof Error ? error.message : 'לא ניתן לטעון מוצרים חיים')
    } finally {
      setIsLoadingProducts(false)
      setIsLoadingMore(false)
    }
  }, [scannedSizes?.gender, scannedSizes?.style?.aestheticTags, scannedSizes?.style?.primaryStyle, scannedSizes?.sizing.top, scannedSizes?.sizing.bottom, scannedSizes?.shoeSize, detectedDevice])

  const handleFilterChange = useCallback((newFilter: typeof filter) => {
    console.log(`[Feed] Category changed to: ${newFilter}`)
    setFilter(newFilter)
    setPageNo(1)
    setHasMore(true)
    setCatalog([])
    void loadProducts(1, false, newFilter)
  }, [loadProducts])

  // Measurements signature — changes when any size field the feed depends on changes
  const measurementsSignature = [
    scannedSizes?.gender,
    scannedSizes?.sizing.top,
    scannedSizes?.sizing.bottom,
    scannedSizes?.sizing.fit,
    scannedSizes?.shoeSize,
    scannedSizes?.style?.primaryStyle,
    scannedSizes?.style?.aestheticTags?.join(','),
    detectedDevice?.brand,
    detectedDevice?.model,
  ].join('|')

  // Initial load
  useEffect(() => {
    setPageNo(1)
    setHasMore(true)
    setCatalog([])
    void loadProducts(1, false, 'all')
  }, [loadProducts])

  // Re-fetch when measurements change (but not on initial mount — the effect above handles that)
  const prevSignatureRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevSignatureRef.current === null) {
      prevSignatureRef.current = measurementsSignature
      return
    }
    if (prevSignatureRef.current !== measurementsSignature) {
      prevSignatureRef.current = measurementsSignature
      console.log('[Feed] Re-fetching feed with updated profile measurements:', scannedSizes)
      setPageNo(1)
      setHasMore(true)
      setCatalog([])
      void loadProducts(1, false, filter)
    }
  }, [measurementsSignature, loadProducts, filter, scannedSizes])

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
    // Accessories tab: only exclude clothing items that leaked through
    if (filter === 'accessories' && CLOTHING_KEYWORDS_REGEX.test(p.name)) return false
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
              {scannedSizes ? `מידות: ${scannedSizes.sizing.top} · ${scannedSizes.sizing.bottom} EU · ${scannedSizes.sizing.fit}` : 'טרם נסרקת'}
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
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
                category={filter}
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

        <View style={{ height: 80 }} />
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

const SUIT_KEYWORDS = /\b(suit|blazer set|two.?piece|tracksuit|set|חליפה|סט|סט חליפה)\b/i
const SHIRT_KEYWORDS = /\b(shirt|t-?shirt|hoodie|sweater|jacket|coat|polo|tank|top|blouse|חולצה|ג'?קט|מעיל|סוודר|בגד עליון)\b/i
const PANTS_KEYWORDS = /\b(pants|jeans|trousers|shorts|leggings|jogger|מכנסיים|מכנס)\b/i

type SizeBreakdownItem = { label: string; value: string }

function getSizeBreakdown(productName: string, scannedSizes: ScannedSizes | null, category: string): SizeBreakdownItem[] {
  if (!scannedSizes) return []
  if (category === 'shoes') {
    return scannedSizes.shoeSize ? [{ label: 'נעל', value: `EU ${scannedSizes.shoeSize}` }] : []
  }
  if (category === 'accessories') return []

  const top = scannedSizes.sizing.top
  const bottom = scannedSizes.sizing.bottom

  const isSuit = SUIT_KEYWORDS.test(productName)
  const isShirt = SHIRT_KEYWORDS.test(productName)
  const isPants = PANTS_KEYWORDS.test(productName)

  if (isSuit || (isShirt && isPants)) {
    return [
      { label: 'חולצה', value: top },
      { label: 'מכנסיים', value: formatFullPantsSizeLabel(bottom) },
    ]
  }
  if (isShirt) {
    return [{ label: 'חולצה', value: top }]
  }
  if (isPants) {
    return [{ label: 'מכנסיים', value: formatFullPantsSizeLabel(bottom) }]
  }
  // Default: show both for generic clothing
  return [
    { label: 'חולצה', value: top },
    { label: 'מכנסיים', value: formatFullPantsSizeLabel(bottom) },
  ]
}

function formatSizeBreakdown(items: SizeBreakdownItem[]): string {
  return items.map((item) => `${item.label}: ${item.value}`).join('  |  ')
}

function getRecommendedSizeLabel(productName: string, scannedSizes: ScannedSizes | null, category: string): string | null {
  if (!scannedSizes) return null
  if (category === 'shoes') {
    return scannedSizes.shoeSize ? `EU ${scannedSizes.shoeSize}` : null
  }
  const top = scannedSizes.sizing.top
  const bottom = scannedSizes.sizing.bottom
  if (SHIRT_KEYWORDS.test(productName) && !PANTS_KEYWORDS.test(productName) && !SUIT_KEYWORDS.test(productName)) return top
  if (PANTS_KEYWORDS.test(productName) && !SHIRT_KEYWORDS.test(productName) && !SUIT_KEYWORDS.test(productName)) return formatFullPantsSizeLabel(bottom)
  return `${top}/${formatFullPantsSizeLabel(bottom)}`
}

function ProductCard({ product, inWishlist, onToggleWishlist, scannedSizes, category }: { product: Product; inWishlist: boolean; onToggleWishlist: () => void; scannedSizes: ScannedSizes | null; category: string }) {
  const [toast, setToast] = useState<string | null>(null)
  const [showSizeModal, setShowSizeModal] = useState(false)

  const recommendedSize = getRecommendedSizeLabel(product.name, scannedSizes, category)
  const sizeBreakdown = getSizeBreakdown(product.name, scannedSizes, category)

  function handleBuy() {
    setShowSizeModal(true)
  }

  function confirmBuy(e: GestureResponderEvent & { preventDefault: () => void }) {
    e.preventDefault()
    e.stopPropagation()
    setShowSizeModal(false)
    const targetUrl = product.aliexpressUrl ?? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(product.brand + ' ' + product.name)}`
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
    setToast('מעביר ל-AliExpress...')
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <View style={feedStyles.productCard}>
      <View style={feedStyles.productImageWrap}>
        <Image
          source={{ uri: product.img.startsWith('http') ? product.img : `https://images.unsplash.com/${product.img}?w=300&h=345&fit=crop&auto=format` }}
          style={feedStyles.productImage}
        />
        <TouchableOpacity
          onPress={(e: GestureResponderEvent & { preventDefault: () => void }) => { e.preventDefault(); e.stopPropagation(); onToggleWishlist() }}
          activeOpacity={0.7}
          style={feedStyles.heartBtn}
        >
          <Text style={{ fontSize: 15 }}>{inWishlist ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
        <View style={feedStyles.aiBadge}>
          <View style={feedStyles.aiBadgeDot} />
          <Text style={feedStyles.aiBadgeText}>AI Match</Text>
        </View>
        {recommendedSize && (
          <View style={feedStyles.sizeBadge}>
            <Text style={feedStyles.sizeBadgeText}>מידה מומלצת עבורך: {recommendedSize}</Text>
          </View>
        )}
      </View>
      <View style={feedStyles.productInfo}>
        <View style={feedStyles.matchChip}>
          <Text style={feedStyles.matchChipText}>
            {category === 'shoes' && scannedSizes?.shoeSize
              ? `✓ מתאים למידה נעל: EU ${scannedSizes.shoeSize}`
              : scannedSizes
                ? `✓ מתאים למידה: ${scannedSizes.sizing.top}/${scannedSizes.sizing.bottom} EU`
                : '✓ מתאים למידה שנסרקת'}
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
            onPress={handleBuy}
            activeOpacity={0.8}
            style={feedStyles.buyBtnAli}
          >
            <Text style={feedStyles.buyBtnText}>🛒 לקנייה ב-AliExpress</Text>
          </TouchableOpacity>
        </View>
        {toast && (
          <View style={feedStyles.toast}>
            <Text style={feedStyles.toastText}>{toast}</Text>
          </View>
        )}
      </View>

      {showSizeModal && (
        <SizeReminderModal
          recommendedSize={recommendedSize}
          sizeBreakdown={sizeBreakdown}
          onConfirm={confirmBuy}
          onDismiss={() => setShowSizeModal(false)}
        />
      )}
    </View>
  )
}

function SizeReminderModal({ recommendedSize, sizeBreakdown, onConfirm, onDismiss }: {
  recommendedSize: string | null
  sizeBreakdown: SizeBreakdownItem[]
  onConfirm: (e: GestureResponderEvent & { preventDefault: () => void }) => void
  onDismiss: () => void
}) {
  return (
    <View style={feedStyles.sizeModalOverlay}>
      <TouchableOpacity onPress={onDismiss} activeOpacity={1} style={feedStyles.sizeModalBackdrop} />
      <View style={feedStyles.sizeModalSheet}>
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={feedStyles.sizeModalCloseBtn}>
          <Text style={feedStyles.sizeModalCloseText}>×</Text>
        </TouchableOpacity>
        <View style={feedStyles.sizeModalLogo}>
          <Text style={feedStyles.sizeModalLogoText}>Fitgura</Text>
        </View>
        <Text style={feedStyles.sizeModalHighlightValue} numberOfLines={2}>
          {recommendedSize ? `מידה מומלצת: ${recommendedSize}` : 'מידה מומלצת'}
        </Text>
        {sizeBreakdown.length > 0 && (
          <View style={feedStyles.sizeBreakdownBox}>
            {sizeBreakdown.map((item) => (
              <View key={item.label} style={feedStyles.sizeBreakdownRow}>
                <Text style={feedStyles.sizeBreakdownLabel}>{item.label}</Text>
                <Text style={feedStyles.sizeBreakdownValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity onPress={onConfirm} activeOpacity={0.8} style={feedStyles.sizeModalConfirmBtn}>
          <Text style={feedStyles.sizeModalConfirmBtnText}>המשך לרכישה</Text>
        </TouchableOpacity>
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
  matchChipText: { fontSize: 9, fontWeight: '700', color: '#16A34A', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif" },
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
  toast: { marginTop: 6, backgroundColor: '#0B1437', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 10, fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeBadge: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: '#2E5BFF', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  sizeBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeModalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 300, justifyContent: 'center', alignItems: 'center' },
  sizeModalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,20,55,0.65)' },
  sizeModalSheet: { backgroundColor: '#fff', borderRadius: 20, padding: 18, width: 320, maxWidth: '90%', gap: 12, elevation: 10 },
  sizeModalCloseBtn: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  sizeModalCloseText: { color: '#94A3B8', fontSize: 22, lineHeight: 22, fontWeight: '500' },
  sizeModalLogo: { alignSelf: 'center', backgroundColor: '#0B1437', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 14 },
  sizeModalLogoText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeModalHighlightValue: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: '#2E5BFF', textAlign: 'center', writingDirection: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeModalConfirmBtn: { width: '100%', backgroundColor: '#FF4747', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 8, alignItems: 'center' },
  sizeModalConfirmBtnText: { fontSize: 13, fontWeight: '800', color: '#fff', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeBreakdownBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, gap: 10, borderWidth: 1.5, borderColor: '#E2E8F0' },
  sizeBreakdownRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', minHeight: 24 },
  sizeBreakdownLabel: { width: 76, fontSize: 13, lineHeight: 20, fontWeight: '700', color: '#64748B', textAlign: 'right', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeBreakdownValue: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '800', color: '#2E5BFF', textAlign: 'left', writingDirection: 'ltr', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
