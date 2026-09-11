import React, { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native'
import { LinearGradient, BottomNav } from '../components'
import { AddDeviceModal } from '../components/AddDeviceModal'
import { type Screen, type User, type Product, type ScannedSizes, type DetectedDevice, detectDevice } from '../types'
import { calculateRecommendedSize } from '../utils/exactSizeMatcher'
import {
  searchProductsByCategory,
  searchDeviceAccessories,
  filterProducts,
  filterByPrice,
  isSmartwatch,
  type FeedCategory,
  type Gender,
  type AgeGroupFilter,
} from '../services/aliexpressClient'
import { supabase } from '../lib/supabase'
import ProductCard from '../components/ProductCard'

const PAGE_SIZE = 50

// Footwear terms — used for render-time clothing/shoes separation
const FOOTWEAR_TERMS = ['shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'heel', 'heels', 'sandal', 'sandals', 'slipper', 'slippers', 'footwear', 'pump', 'pumps', 'loafer', 'loafers', 'wedge', 'wedges', 'נעל', 'נעליים', 'סניקרס', 'מגף', 'מגפיים', 'סנדל', 'סנדלים']
const APPAREL_TERMS = ['dress', 'skirt', 'suit', 'bra', 'lingerie', 'panties', 'shirt', 'blouse', 'jacket', 'coat', 'pants', 'trouser', 'hoodie', 'sweater', 'jeans', 'shorts', 'שמלה', 'חצאית', 'חליפה', 'חולצה', 'מעיל', 'מכנסיים', 'בגד']
const FOOTWEAR_RENDER_REGEX = new RegExp(`\\b(${FOOTWEAR_TERMS.join('|')})\\b`, 'i')
const APPAREL_RENDER_REGEX = new RegExp(`\\b(${APPAREL_TERMS.join('|')})\\b`, 'i')

// Gender rejection regexes for render-time validation
const MENS_RENDER_REGEX = /\b(men|men's|mens|male|boy|boys|man|man's|for him)\b/i
const WOMENS_RENDER_REGEX = /\b(women|women's|womens|woman|female|girl|girls|lady|ladies|for her)\b/i
// Products mentioning both genders are unisex-only
const BOTH_GENDERS_RENDER_REGEX = /\b(men|men's|mens|male|boy|boys|man|man's|for him)\b.*\b(women|women's|womens|woman|female|girl|girls|lady|ladies|for her)\b|\b(women|women's|womens|woman|female|girl|girls|lady|ladies|for her)\b.*\b(men|men's|mens|male|boy|boys|man|man's|for him)\b/i

// Clothing/footwear keywords to client-side filter out of accessories results
const CLOTHING_KEYWORDS_REGEX = /\b(shirt|pants|dress|hoodie|jacket|sweater|jeans|shorts|skirt|blouse|coat|t-shirt|tank\s*top|underwear|shoes|socks|sneakers|boots|sandals|חולצה|מכנסיים|שמלה|נעליים|גרביים|ז'?קט|מעיל|בגד|גופייה)\b/i

// Watch accessory terms — explicitly permitted in accessories tab even if they contain words like "band" that might overlap with apparel
const WATCH_ACCESSORY_TERMS = ['strap', 'band', 'wristband', 'bracelet', 'screen protector', 'charging dock', 'bezel']
const WATCH_ACCESSORY_REGEX = /\b(strap|band|wristband|bracelet|screen\s*protector|charging\s*dock|bezel)\b/i

// Sort accessories so products matching the newest device (index 0) appear at the very top
function sortAccessoriesByDevicePriority(products: Product[], devices: string[]): Product[] {
  const deviceModels = devices.map((d) => {
    const model = d.replace(/^\w+\s+/, '').trim().toLowerCase() || d.toLowerCase()
    const parts = model.split(' ')
    return { model, lastPart: parts[parts.length - 1] }
  })
  return [...products].sort((a, b) => {
    const aTitle = (a.name ?? '').toLowerCase()
    const bTitle = (b.name ?? '').toLowerCase()
    // Find the highest-priority device (lowest index) that matches each product
    const aPriority = deviceModels.findIndex((dm) => aTitle.includes(dm.model) || (dm.lastPart.length >= 2 && aTitle.includes(dm.lastPart)))
    const bPriority = deviceModels.findIndex((dm) => bTitle.includes(dm.model) || (dm.lastPart.length >= 2 && bTitle.includes(dm.lastPart)))
    // Products matching no device go last; products matching device 0 go first
    const aRank = aPriority === -1 ? deviceModels.length : aPriority
    const bRank = bPriority === -1 ? deviceModels.length : bPriority
    return aRank - bRank
  })
}

// Check if a product carries the user's recommended size in its available sizes
function productCarriesUserSize(product: Product, scannedSizes: ScannedSizes, category: string): boolean {
  const available = product.availableSizes
  if (!available || available.length === 0) return true // no size data — don't penalize
  const recommended = calculateRecommendedSize(scannedSizes, [], category, product.name, available)
  if (!recommended) return true
  const recNorm = recommended.toUpperCase().replace('XXL', '2XL').replace('XXXL', '3XL')
  return available.some(s => s.toUpperCase().replace('XXL', '2XL').replace('XXXL', '3XL') === recNorm)
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
  registeredDevices,
  onAddDevice,
  onRemoveDevice,
  latestAddedDevice,
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
  registeredDevices: string[]
  onAddDevice: (deviceName: string) => void
  onRemoveDevice: (deviceName: string) => void
  latestAddedDevice: string | null
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
  const [showDeviceModal, setShowDeviceModal] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const selectedDeviceRef = useRef<string | null>(null)
  const [pendingNewDevice, setPendingNewDevice] = useState<string | null>(null)

  // When a new device is added (from any screen), fetch its accessories and prepend to the catalog
  useEffect(() => {
    if (!latestAddedDevice) return
    let cancelled = false
    const gender: Gender = (scannedSizes?.gender as Gender) ?? 'unisex'
    searchDeviceAccessories(latestAddedDevice, 1, PAGE_SIZE, gender)
      .then((newProducts) => {
        if (cancelled || newProducts.length === 0) return
        const cleaned = newProducts.filter((p) => {
          const pName = p.name ?? ''
          if (CLOTHING_KEYWORDS_REGEX.test(pName)) return false
          const titleLower = pName.toLowerCase()
          const model = latestAddedDevice.replace(/^\w+\s+/, '').trim().toLowerCase() || latestAddedDevice.toLowerCase()
          const parts = model.split(' ')
          const lastPart = parts[parts.length - 1]
          return titleLower.includes(model) || (lastPart.length >= 2 && titleLower.includes(lastPart))
        })
        if (cleaned.length === 0) return
        if (selectedDeviceRef.current && selectedDeviceRef.current !== latestAddedDevice) return
        setCatalog((prev) => {
          const newIds = new Set(cleaned.map((p) => p.aliexpressSku).filter(Boolean))
          return [...cleaned, ...prev.filter((p) => !p.aliexpressSku || !newIds.has(p.aliexpressSku))]
        })
        if (filterRef.current !== 'accessories') {
          setPendingNewDevice(latestAddedDevice)
        }
      })
      .catch((err) => console.error('[Feed] Failed to fetch accessories for new device:', err))
    return () => { cancelled = true }
  }, [latestAddedDevice, scannedSizes?.gender])

  // When a device is removed, purge its products from the catalog and re-fetch for remaining devices
  const prevDevicesRef = useRef<string>(registeredDevices.join(','))
  useEffect(() => {
    const currentSig = registeredDevices.join(',')
    if (prevDevicesRef.current === currentSig) return
    const prevDevices = prevDevicesRef.current.split(',').filter(Boolean)
    const currentDevices = currentSig.split(',').filter(Boolean)
    prevDevicesRef.current = currentSig

    if (selectedDevice && !currentDevices.includes(selectedDevice)) {
      selectedDeviceRef.current = null
      setSelectedDevice(null)
    }

    // Only purge if a device was removed (not added — addition is handled by latestAddedDevice effect)
    const removedDevices = prevDevices.filter((d) => !currentDevices.includes(d))
    if (removedDevices.length === 0) return

    console.log('[Feed] Device removed, purging accessories for:', removedDevices)

    // Hard-filter out products matching the removed device
    setCatalog((prev) => prev.filter((p) => {
      const titleLower = (p.name ?? '').toLowerCase()
      return !removedDevices.some((d) => {
        const model = d.replace(/^\w+\s+/, '').trim().toLowerCase() || d.toLowerCase()
        const parts = model.split(' ')
        const lastPart = parts[parts.length - 1]
        return titleLower.includes(model) || (lastPart.length >= 2 && titleLower.includes(lastPart))
      })
    }))

    // If on accessories tab, re-fetch for remaining devices to fill the gap
    if (filterRef.current === 'accessories' && currentDevices.length > 0) {
      setPageNo(1)
      setHasMore(true)
      void loadProductsRef.current(1, false, 'accessories')
    }
  }, [registeredDevices])

  // When user switches to the accessories tab, clear the pending flag so new-device products are already at top
  useEffect(() => {
    if (filter === 'accessories' && pendingNewDevice) {
      setPendingNewDevice(null)
    }
  }, [filter, pendingNewDevice])

  const loadRequestRef = useRef(0)

  const loadProducts = useCallback(async (page: number, append: boolean, category: string) => {
    const requestId = ++loadRequestRef.current
    if (append) setIsLoadingMore(true)
    else setIsLoadingProducts(true)
    setProductsError(null)
    try {
      const gender: Gender = (scannedSizes?.gender as Gender) ?? 'unisex'
      const ageGroup: AgeGroupFilter = (scannedSizes?.ageGroup as AgeGroupFilter) ?? 'adult'
      const feedCategory = category as FeedCategory
      const deviceName = detectedDevice ? `${detectedDevice.brand} ${detectedDevice.model}`.trim() : ''
      const accessoryDevices = category === 'accessories'
        ? (selectedDeviceRef.current ? [selectedDeviceRef.current] : Array.from(new Set(registeredDevices)))
        : []

      console.log(`[Feed] Fetching: gender=${gender}, category=${category}, page=${page}, devices=${accessoryDevices.length}`)

      let remoteProducts: Product[]

      if (category === 'accessories') {
        if (accessoryDevices.length === 0) {
          remoteProducts = []
        } else {
          const deviceResults = await Promise.all(
            accessoryDevices.map((device) => searchDeviceAccessories(device, page, PAGE_SIZE, gender)),
          )
          remoteProducts = deviceResults.flat()
        }
      } else {
        remoteProducts = await searchProductsByCategory(feedCategory, gender, page, PAGE_SIZE, undefined, ageGroup)
      }

      console.log('[FeedScreen] Fetched products:', remoteProducts.length, 'page:', page, 'append:', append, 'category:', category, 'devices:', accessoryDevices)

      if (requestId !== loadRequestRef.current) return

      // The aliexpressClient already applied gender + category filters,
      // but we run a second pass here for accessories device-name matching
      const cleanedProducts = category === 'accessories' && accessoryDevices.length > 0
        ? remoteProducts.filter((p) => {
            const pName = p.name ?? ''
            if (CLOTHING_KEYWORDS_REGEX.test(pName)) return false
            const titleLower = pName.toLowerCase()
            return accessoryDevices.some((d) => {
              const model = d.replace(/^\w+\s+/, '').trim().toLowerCase() || d.toLowerCase()
              const parts = model.split(' ')
              const lastPart = parts[parts.length - 1]
              return titleLower.includes(model) || (lastPart.length >= 2 && titleLower.includes(lastPart))
            })
          })
        : remoteProducts

      // For accessories: sort so newest device (index 0) products appear at the very top
      const sortedProducts = category === 'accessories' && accessoryDevices.length > 1
        ? sortAccessoriesByDevicePriority(cleanedProducts, accessoryDevices)
        : cleanedProducts

      // Direct state hydration — append unique items only
      let newItemsCount = 0
      setCatalog((prev) => {
        const existingIds = new Set(prev.map((p) => p.aliexpressSku).filter(Boolean))
        const deduped = sortedProducts.filter((p) => {
          if (p.aliexpressSku && existingIds.has(p.aliexpressSku)) return false
          return true
        })
        newItemsCount = deduped.length
        const next = append ? [...prev, ...deduped] : deduped
        console.log('[FeedScreen] Catalog after update:', next.length, 'deduped:', sortedProducts.length - deduped.length)
        return next
      })

      // Continue loading as long as we got new unique items.
      // Only stop when a page yields zero new products (exhausted results).
      // Safety cap at 10 pages to avoid infinite loops.
      // For accessories, keep loading until we have a substantial pool
      const minThreshold = category === 'accessories' ? 20 : 0
      if (newItemsCount === 0 || page >= 20 || (append && catalog.length + newItemsCount > 500)) {
        setHasMore(false)
      } else if (category === 'accessories' && newItemsCount < minThreshold && page < 10) {
        // Don't set hasMore=false yet — accessories need more pages to build a full feed
        setHasMore(true)
      }

      if (!append && sortedProducts.length === 0) setProductsError('לא נמצאו מוצרים חיים כרגע')
    } catch (error: unknown) {
      if (requestId !== loadRequestRef.current) return
      if (!append) setCatalog([])
      setProductsError(error instanceof Error ? error.message : 'לא ניתן לטעון מוצרים חיים')
    } finally {
      if (requestId === loadRequestRef.current) {
        setIsLoadingProducts(false)
        setIsLoadingMore(false)
      }
    }
  }, [scannedSizes?.gender, scannedSizes?.ageGroup, scannedSizes?.style?.aestheticTags, scannedSizes?.style?.primaryStyle, scannedSizes?.sizing.top, scannedSizes?.sizing.bottom, scannedSizes?.shoeSize, detectedDevice, registeredDevices])

  // Refs to avoid effect dependency on loadProducts/filter identity — prevents infinite reload loop
  const loadProductsRef = useRef(loadProducts)
  loadProductsRef.current = loadProducts
  const filterRef = useRef(filter)
  filterRef.current = filter

  const handleFilterChange = useCallback((newFilter: typeof filter) => {
    console.log(`[Feed] Category changed to: ${newFilter}`)
    setFilter(newFilter)
    filterRef.current = newFilter
    selectedDeviceRef.current = null
    setSelectedDevice(null)
    setPageNo(1)
    setHasMore(true)
    setCatalog([])

    if (newFilter === 'accessories' && registeredDevices.length === 0) {
      void detectDevice().then((detected) => {
        const deviceName = `${detected.brand} ${detected.model}`.trim()
        onAddDevice(deviceName)
        void loadProductsRef.current(1, false, 'accessories')
      })
      return
    }

    void loadProductsRef.current(1, false, newFilter)
  }, [registeredDevices, onAddDevice])

  const handleSelectDevice = useCallback((device: string | null) => {
    if (selectedDeviceRef.current === device) return
    selectedDeviceRef.current = device
    setSelectedDevice(device)
    setPageNo(1)
    setHasMore(true)
    setCatalog([])
    void loadProductsRef.current(1, false, 'accessories')
  }, [])

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
    registeredDevices.join(','),
  ].join('|')

  // Initial load — only once on mount
  const hasInitiallyLoaded = useRef(false)
  useEffect(() => {
    if (hasInitiallyLoaded.current) return
    hasInitiallyLoaded.current = true
    setPageNo(1)
    setHasMore(true)
    setCatalog([])
    void loadProductsRef.current(1, false, 'all')
  }, [])

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
      void loadProductsRef.current(1, false, filterRef.current)
    }
  }, [measurementsSignature])

  useEffect(() => {
    onCatalogChange(catalog)
  }, [catalog, onCatalogChange])

  // Refs for loadMore guards — keeps loadMore identity stable so the
  // IntersectionObserver is created once instead of being recreated every render
  const pageNoRef = useRef(pageNo)
  pageNoRef.current = pageNo
  const isLoadingMoreRef = useRef(isLoadingMore)
  isLoadingMoreRef.current = isLoadingMore
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const isLoadingProductsRef = useRef(isLoadingProducts)
  isLoadingProductsRef.current = isLoadingProducts

  const loadMore = useCallback(() => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || isLoadingProductsRef.current) return
    const nextPage = pageNoRef.current + 1
    console.log(`[Feed] Loading next page: ${nextPage}`)
    setPageNo(nextPage)
    void loadProductsRef.current(nextPage, true, filterRef.current)
  }, [])

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

  const isFemaleRender = scannedSizes?.gender === 'female'
  const isMaleRender = scannedSizes?.gender === 'male'

  const filtered = catalog.filter((p) => {
    const name = p.name ?? ''
    const brand = p.brand ?? ''
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || brand.toLowerCase().includes(search.toLowerCase())
    const matchBudget = filterByPrice(p, budget[0], budget[1])
    // 1. Gender Validation — render-time double-check
    if (isFemaleRender && MENS_RENDER_REGEX.test(name)) return false
    if (isMaleRender && WOMENS_RENDER_REGEX.test(name)) return false
    // 1b. Products mentioning both genders are unisex-only
    if ((isFemaleRender || isMaleRender) && BOTH_GENDERS_RENDER_REGEX.test(name)) return false
    // 2. Category Validation — render-time double-check
    if (filter === 'clothing' && FOOTWEAR_RENDER_REGEX.test(name)) return false
    if (filter === 'shoes') {
      if (APPAREL_RENDER_REGEX.test(name) && !FOOTWEAR_RENDER_REGEX.test(name)) return false
    }
    // Accessories tab: exclude clothing items that leaked through, but allow watch accessory terms
    if (filter === 'accessories') {
      if (CLOTHING_KEYWORDS_REGEX.test(name) && !WATCH_ACCESSORY_REGEX.test(name)) return false
    }
    return matchSearch && matchBudget
  })

  // Size-aware sorting: products that carry the user's recommended size float to the top;
  // products that don't carry it sink to the bottom. Only applies to clothing/shoes.
  const sizeSorted = (filter === 'all' || filter === 'clothing' || filter === 'shoes') && scannedSizes
    ? [...filtered].sort((a, b) => {
        const aHasSize = productCarriesUserSize(a, scannedSizes, filter)
        const bHasSize = productCarriesUserSize(b, scannedSizes, filter)
        if (aHasSize && !bHasSize) return -1
        if (!aHasSize && bHasSize) return 1
        return 0
      })
    : filtered

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

        {filter === 'accessories' && (
          <View style={feedStyles.deviceBar}>
            <View style={feedStyles.deviceBarHeader}>
              <Text style={feedStyles.deviceBarTitle}>📱 המכשירים שלי</Text>
              <TouchableOpacity
                onPress={() => setShowDeviceModal(true)}
                activeOpacity={0.75}
                style={feedStyles.addDeviceBtn}
              >
                <Text style={feedStyles.addDeviceBtnText}>+ הוסף מכשיר</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8, paddingBottom: 4 }}>
              <TouchableOpacity
                onPress={() => handleSelectDevice(null)}
                activeOpacity={0.75}
                style={[feedStyles.deviceChip, !selectedDevice && feedStyles.deviceChipSelected]}
              >
                <Text style={[feedStyles.deviceChipText, !selectedDevice && feedStyles.deviceChipTextSelected]}>כל המכשירים</Text>
              </TouchableOpacity>
              {registeredDevices.map((device) => (
                <View key={device} style={[feedStyles.deviceChip, selectedDevice === device && feedStyles.deviceChipSelected]}>
                  <TouchableOpacity
                    onPress={() => handleSelectDevice(device)}
                    activeOpacity={0.75}
                    style={feedStyles.deviceChipName}
                  >
                    <Text style={[feedStyles.deviceChipText, selectedDevice === device && feedStyles.deviceChipTextSelected]}>{device}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onRemoveDevice(device)}
                    activeOpacity={0.6}
                    style={feedStyles.deviceChipRemove}
                  >
                    <Text style={feedStyles.deviceChipRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
        <LinearGradient colors={['#0B1437', '#1A2F7A']} style={feedStyles.aiMatchBar}>
          <Text style={{ fontSize: 22 }}>🎯</Text>
          <View style={{ flex: 1 }}>
            <Text style={feedStyles.aiMatchTitle}>Fitgura AI Match פעיל</Text>
            <Text style={feedStyles.aiMatchSub}>כל הפריטים מסוננים לפי סריקת AI + תקציב</Text>
          </View>
          <View style={feedStyles.aiMatchCount}>
            <Text style={feedStyles.aiMatchCountText}>{sizeSorted.length} פריטים</Text>
          </View>
        </LinearGradient>

        {isLoadingProducts && (
          <View style={feedStyles.loadingState}>
            <span className="fitgura-spinner" style={{ fontSize: 20, lineHeight: '20px' }}>⟳</span>
            <Text style={feedStyles.loadingText}>פיטגורה מתאימה מוצרים חדשים עבורך</Text>
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

        {sizeSorted.length === 0 && !isLoadingProducts && !productsError && (
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
          {sizeSorted.map((product) => {
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
            <span className="fitgura-spinner" style={{ fontSize: 20, lineHeight: '20px' }}>⟳</span>
            <Text style={feedStyles.loadingText}>טוען מוצרים נוספים עבורך...</Text>
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

      <AddDeviceModal
        visible={showDeviceModal}
        onClose={() => setShowDeviceModal(false)}
        onAdd={(deviceName) => { onAddDevice(deviceName); setShowDeviceModal(false) }}
      />
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
            right: 0,
            pointerEvents: budget[0] >= budget[1] - STEP ? 'auto' : 'none',
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
            left: 0,
            right: 0,
            pointerEvents: 'auto',
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
  familyTeaser: { backgroundColor: '#FFF5F0', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,107,107,0.2)' },
  familyTitle: { fontSize: 13, fontWeight: '700', color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  familySub: { fontSize: 11, color: '#FB923C', marginTop: 2, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  familyBadge: { backgroundColor: 'rgba(255,107,107,0.12)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  familyBadgeText: { fontSize: 11, fontWeight: '700', color: '#FF6B6B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deviceBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  deviceBarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  deviceBarTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: '#475569', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deviceChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#CBD5E1' },
  deviceChipSelected: { backgroundColor: '#2E5BFF', borderColor: '#2E5BFF' },
  deviceChipName: { paddingVertical: 1 },
  deviceChipText: { fontSize: 12, fontWeight: '600', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  deviceChipTextSelected: { color: '#FFFFFF' },
  deviceChipRemove: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  deviceChipRemoveText: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  addDeviceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E5BFF', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13, minWidth: 112 },
  addDeviceBtnText: { fontSize: 11, fontWeight: '700', color: '#fff', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },

})
