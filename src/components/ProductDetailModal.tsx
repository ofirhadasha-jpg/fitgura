import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native'
import { type Product, type ScannedSizes, type Offer, type PriceComparisonEntry } from '../types'
import { calculateDetailedRecommendation, type SellerSizeEntry, type SizeRecommendation } from '../utils/exactSizeMatcher'
import { type SizePill } from '../utils/sizeConverter'
import { logAffiliateClick } from '../services/analyticsService'
import { PLATFORM_LABELS, PLATFORM_COLORS, PLATFORM_LOGOS, isDirectPdpUrl } from '../services/multiPlatformService'
import { normalizeProductImageUrl } from '../utils/productImages'
import { searchAllVisualMatches, getMissingPlatforms, getFallbackSearchUrl } from '../services/imageSearch'
import { wrapWithSkimlinks } from '../utils/skimlinks'
import type { ExactVisualMatch } from '../services/adapterTypes'
import type { ProductPlatform } from '../types'
import { type AnchorPos, computePopupStyle } from '../utils/popupPosition'
import { useEscToDismiss } from '../utils/useEscToDismiss'

function formatPrice(price: number | null | undefined, currency?: string): string {
  const isUSD = currency === 'USD'
  const symbol = isUSD || !currency || currency === 'ILS' ? '₪' : currency
  const safePrice = typeof price === 'number' && !isNaN(price) ? price : 0
  const displayPrice = isUSD ? Math.round(safePrice * 3.7) : safePrice
  return `${symbol}${displayPrice.toLocaleString()}`
}

function normalizeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (trimmed.startsWith('http://')) return trimmed.replace('http://', 'https://')
  return trimmed.startsWith('https://') ? trimmed : null
}

const FOOTWEAR_RE = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|slipper|slippers|footwear|pump|pumps|loafer|loafers|wedge|wedges|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i
const DEVICE_RE = /\b(phone|mobile|tablet|ipad|iphone|android|laptop|desktop|computer|watch|case|cover|protector|charger|charging|cable|adapter|strap|band|holder|stand|dock|keyboard|mouse|screen)\b/i

function isAccessory(productName: string, category: string): boolean {
  if (category === 'accessories') return true
  if (category === 'shoes' || FOOTWEAR_RE.test(productName)) return false
  return DEVICE_RE.test(productName)
}

function openUrl(url: string, product: Product) {
  logAffiliateClick({
    product_id: product.aliexpressSku ?? '',
    title: product.name ?? '',
    promotion_link: url,
  }).catch(() => {})
  try {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export interface ProductDetailModalProps {
  product: Product
  scannedSizes: ScannedSizes | null
  category: string
  sellerSizeChart?: SellerSizeEntry[]
  visible: boolean
  onDismiss: () => void
  anchorPos?: AnchorPos
}

export function ProductDetailModal({ product, scannedSizes, category, sellerSizeChart = [], visible, onDismiss, anchorPos }: ProductDetailModalProps) {
  const [imgError, setImgError] = useState(false)
  const [redirectingOffer, setRedirectingOffer] = useState<string | null>(null)
  const [selectedOfferKey, setSelectedOfferKey] = useState<string | null>(null)
  const [exactMatches, setExactMatches] = useState<ExactVisualMatch[]>([])
  const [isSearchingExactMatches, setIsSearchingExactMatches] = useState(false)
  const [searchComplete, setSearchComplete] = useState(false)

  const productPlatform = product.platform ?? 'shein'

  useEffect(() => {
    if (!visible) return
    const imageUrl = product.imageUrl ?? product.img
    let cancelled = false
    setExactMatches([])
    setSearchComplete(false)
    setIsSearchingExactMatches(true)
    void searchAllVisualMatches(imageUrl, productPlatform)
      .then((matches) => {
        if (!cancelled) setExactMatches(matches)
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearchingExactMatches(false)
          setSearchComplete(true)
        }
      })
    return () => { cancelled = true }
  }, [visible, product.imageUrl, product.img, productPlatform])

  useEscToDismiss(visible, onDismiss)

  if (!visible) return null

  const primaryImageUrl = normalizeProductImageUrl(product.img)
  const imageUrl = imgError ? null : primaryImageUrl

  const accessory = isAccessory(product.name, category)
  const recommendedSize: SizeRecommendation | null = accessory ? null : calculateDetailedRecommendation(scannedSizes, sellerSizeChart, category, product.name, product.availableSizes ?? [])
  const hasScanned = scannedSizes != null

  // Use the service-built primaryOffer when available — it is the source of
  // truth for platform-to-URL binding. Only construct a fallback if it's
  // missing AND the URL is a verified PDP or SHEIN search URL.
  const primaryOffer: Offer | null = product.primaryOffer ?? (() => {
    if (productPlatform === 'shein') {
      const sheinUrl = product.buyUrl ?? ''
      if (sheinUrl && isDirectPdpUrl(sheinUrl)) {
        return {
          platform: 'shein' as ProductPlatform,
          label: PLATFORM_LABELS.shein,
          price: product.price,
          currency: product.currency ?? '₪',
          url: sheinUrl,
        }
      }
      return null
    }
    const fallbackUrl = product.buyUrl ?? product.aliexpressUrl ?? ''
    if (fallbackUrl && isDirectPdpUrl(fallbackUrl)) {
      return {
        platform: productPlatform,
        label: PLATFORM_LABELS[productPlatform],
        price: product.price,
        currency: product.currency ?? '₪',
        url: fallbackUrl,
      }
    }
    return null
  })()
  const primaryUrl = primaryOffer?.url ?? ''
  const secondaryOffers: Offer[] = exactMatches.map((match) => ({
    platform: match.platform,
    label: PLATFORM_LABELS[match.platform],
    price: match.price,
    currency: '₪',
    url: match.productUrl,
  }))
  const comparisonEntries: PriceComparisonEntry[] = [
    ...(primaryOffer ? [{ platform: primaryOffer.platform, price: primaryOffer.price, currency: primaryOffer.currency ?? '₪', productUrl: primaryUrl, sizesAvailable: product.availableSizes ?? [], isLowestPrice: false }] : []),
    ...exactMatches.map((match) => ({
      platform: match.platform,
      price: match.price,
      currency: match.currency ?? '₪',
      productUrl: match.productUrl,
      sizesAvailable: match.sizes,
      isLowestPrice: false,
    })),
  ]
  const minComparisonPrice = comparisonEntries.length > 0 ? Math.min(...comparisonEntries.map((entry) => entry.price)) : 0
  comparisonEntries.forEach((entry) => { entry.isLowestPrice = entry.price === minComparisonPrice })

  const missingPlatforms: ProductPlatform[] = searchComplete ? getMissingPlatforms(exactMatches, productPlatform) : []

  function handlePrimaryBuy() {
    if (!primaryOffer || !primaryOffer.url) return
    if (!isDirectPdpUrl(primaryOffer.url)) {
      console.warn('[BUY BUTTON] Rejected non-PDP/search URL:', primaryOffer.url)
      return
    }
    const alreadyWrapped = primaryOffer.url.includes('go.skimlinks') || primaryOffer.url.includes('go.skimresources') || primaryOffer.url.includes('go.redirecting')
    const finalUrl = alreadyWrapped ? primaryOffer.url : wrapWithSkimlinks(primaryOffer.url)
    console.log('[BUY BUTTON] Opening destination:', primaryOffer.url)
    openUrl(finalUrl, product)
    onDismiss()
  }

  function handleSecondaryBuy(offer: Offer) {
    if (!offer.url) return
    setSelectedOfferKey(offer.platform)
    setRedirectingOffer(offer.platform)
    openUrl(offer.url, product)
    setRedirectingOffer(null)
  }

  function handleComparisonClick(entry: PriceComparisonEntry, entryKey: string) {
    setSelectedOfferKey(entryKey)
    openUrl(entry.productUrl, product)
  }

  return (
    <View style={modalStyles.overlay}>
      <TouchableOpacity onPress={onDismiss} activeOpacity={1} style={modalStyles.backdrop} />
      <View style={[modalStyles.sheet, anchorPos ? { position: 'fixed' as React.CSSProperties, ...computePopupStyle(anchorPos, 340, 500) } : null]}>
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={modalStyles.closeBtn}>
          <Text style={modalStyles.closeText}>×</Text>
        </TouchableOpacity>

        <ScrollView style={modalStyles.scrollArea} contentContainerStyle={modalStyles.scrollContent}>
          {/* ── Product image (shows placeholder if no image available) ── */}
          <View style={modalStyles.imageWrap}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={modalStyles.productImage}
                onError={() => setImgError(true)}
              />
            ) : (
              <View style={[modalStyles.productImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E0' }]}>
                <Text style={{ fontSize: 28 }}>📸</Text>
              </View>
            )}
          </View>

          {/* ── Title, brand badge, price tags (PRESERVED) ── */}
          <Text style={modalStyles.productName} numberOfLines={3}>{product.name}</Text>
          <Text style={modalStyles.productBrand}>{product.brand}</Text>

          <View style={modalStyles.priceRow}>
            <Text style={modalStyles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
            {product.originalPrice && product.originalPrice > product.price && (
              <Text style={modalStyles.productOriginalPrice}>{formatPrice(product.originalPrice, product.currency)}</Text>
            )}
          </View>

          {/* ── Size recommendation box (PRESERVED — do not touch) ── */}
          {recommendedSize && (
            <View style={modalStyles.recommendationBox}>
              <Text style={modalStyles.recommendationTitle}>🎯 מתאים לך</Text>
              <View style={modalStyles.pillRow}>
                {recommendedSize.pills.map((pill: SizePill, idx: number) => (
                  <View key={idx} style={[modalStyles.sizePill, pill.isPrimary && modalStyles.sizePillPrimary]}>
                    <Text style={modalStyles.sizePillRegion}>{pill.region}</Text>
                    <Text style={[modalStyles.sizePillValue, pill.isPrimary && modalStyles.sizePillValuePrimary]}>
                      {pill.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {!recommendedSize && !accessory && !hasScanned && (
            <View style={modalStyles.recommendationBox}>
              <Text style={modalStyles.recommendationHeadline}>
                סרוק את עצמך כדי לקבל המלצת מידה מדויקת
              </Text>
            </View>
          )}

          {/* ── Price comparison table (redesigned) ── */}
          {comparisonEntries.length > 1 && (
            <View style={modalStyles.comparisonBox}>
              <Text style={modalStyles.comparisonTitle}>השוואת מחירים ומידות</Text>
              <View style={modalStyles.comparisonTable}>
                {comparisonEntries.map((entry, idx) => {
                  const entryKey = `${entry.platform}-${idx}`
                  const isSelected = selectedOfferKey === entryKey
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleComparisonClick(entry, entryKey)}
                      activeOpacity={0.6}
                      style={[
                        modalStyles.comparisonRow,
                        entry.isLowestPrice && modalStyles.comparisonRowLowest,
                        isSelected && modalStyles.comparisonRowSelected,
                        { cursor: 'pointer' } as React.CSSProperties,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${PLATFORM_LABELS[entry.platform]} ${formatPrice(entry.price, entry.currency)}`}
                    >
                      {/* Left: platform logo + name + sizes */}
                      <View style={modalStyles.comparisonLeftCell}>
                        <View style={modalStyles.comparisonPlatformCell}>
                          <Text style={modalStyles.comparisonPlatformEmoji}>{PLATFORM_LOGOS[entry.platform]}</Text>
                          <Text style={modalStyles.comparisonPlatformName}>{PLATFORM_LABELS[entry.platform]}</Text>
                        </View>
                        <Text style={modalStyles.comparisonSizesText} numberOfLines={1}>
                          {entry.sizesAvailable.length > 0 ? entry.sizesAvailable.slice(0, 4).join(', ') : '—'}
                        </Text>
                      </View>

                      {/* Right: price + lowest badge */}
                      <View style={modalStyles.comparisonRightCell}>
                        <Text style={modalStyles.comparisonPrice}>{formatPrice(entry.price, entry.currency)}</Text>
                        {entry.isLowestPrice && (
                          <Text style={modalStyles.lowestPriceTag}>הכי זול</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Multi-offer action area (replaces single green button) ── */}
        <View style={modalStyles.offerArea}>
          {/* A. Primary verified offer (SHEIN) */}
          {primaryOffer && (
            <View style={modalStyles.primaryOfferContainer}>
              <View style={modalStyles.primaryOfferRow}>
                <Image
                  source={{ uri: imageUrl }}
                  style={modalStyles.offerThumbnail}
                  accessibilityLabel={`תמונה של ${product.name}`}
                />
                <View style={modalStyles.primaryOfferInfo}>
                  <Text style={modalStyles.primaryOfferPlatform}>
                    {PLATFORM_LOGOS[primaryOffer.platform] ?? '🛍️'}{' '}
                    {primaryOffer.label}
                  </Text>
                  <Text style={modalStyles.primaryOfferPrice}>
                    {formatPrice(primaryOffer.price, primaryOffer.currency)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handlePrimaryBuy}
                activeOpacity={0.7}
                style={[
                  modalStyles.primaryOfferBtn,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`מתאים לי, המשך לרכישה ב-${primaryOffer.label}`}
              >
                <View style={modalStyles.btnContentWrap}>
                  <Text style={modalStyles.confirmBtnIcon}>🛒</Text>
                  <Text style={modalStyles.primaryOfferBtnText}>מתאים לי</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* B. Verified exact visual matches (Temu / AliExpress) */}
          {isSearchingExactMatches && (
            <View style={modalStyles.secondaryOffersContainer}>
              <Text style={modalStyles.secondaryOffersHeader}>מחפש התאמות זהות לפי תמונה...</Text>
            </View>
          )}
          {searchComplete && secondaryOffers.length > 0 && (
            <View style={modalStyles.secondaryOffersContainer}>
              <Text style={modalStyles.secondaryOffersHeader}>התאמות זהות שנמצאו</Text>
              {secondaryOffers.map((offer: Offer, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleSecondaryBuy(offer)}
                  activeOpacity={0.6}
                  style={[
                    modalStyles.secondaryOfferRow,
                    selectedOfferKey === offer.platform && modalStyles.secondaryOfferRowSelected,
                    { cursor: 'pointer' } as React.CSSProperties,
                  ]}
                  disabled={redirectingOffer === offer.platform}
                  accessibilityRole="button"
                  accessibilityLabel={`שווה בדיקה ב${offer.label}`}
                >
                  <View style={modalStyles.secondaryOfferInfo}>
                    <Image
                      source={{ uri: normalizeImageUrl(exactMatches[idx]?.imageUrl) ?? imageUrl }}
                      style={modalStyles.offerThumbnailSmall}
                      accessibilityLabel={`תמונה של ${exactMatches[idx]?.name ?? product.name}`}
                    />
                    <View style={modalStyles.secondaryOfferText}>
                      <Text style={modalStyles.secondaryOfferPlatform}>
                        {PLATFORM_LOGOS[offer.platform] ?? '🛍️'}{' '}
                        {offer.label}
                      </Text>
                      <Text style={modalStyles.secondaryOfferPrice}>
                        {formatPrice(offer.price, offer.currency)}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    modalStyles.secondaryOfferBtn,
                    redirectingOffer === offer.platform && modalStyles.secondaryOfferBtnLoading,
                  ]}>
                    <Text style={modalStyles.secondaryOfferBtnText}>
                      {redirectingOffer === offer.platform ? '...' : 'שווה בדיקה'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* C. Fallback search buttons for platforms with no visual match */}
          {searchComplete && missingPlatforms.length > 0 && (
            <View style={modalStyles.exclusiveContainer}>
              {missingPlatforms.map((plat: ProductPlatform) => (
                <TouchableOpacity
                  key={plat}
                  onPress={() => {
                    const fallbackUrl = getFallbackSearchUrl(plat, product.name)
                    if (fallbackUrl) openUrl(fallbackUrl, product)
                  }}
                  activeOpacity={0.6}
                  style={[modalStyles.exclusiveBadge, { cursor: 'pointer' } as React.CSSProperties]}
                  accessibilityRole="button"
                  accessibilityLabel={`חפש פריטים דומים ב-${PLATFORM_LABELS[plat]}`}
                >
                  <Text style={modalStyles.exclusiveText}>
                    חפש פריטים דומים ב-{PLATFORM_LABELS[plat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

const modalStyles = StyleSheet.create({
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'center', alignItems: 'center', padding: 16, backdropFilter: 'blur(2px)' } as React.CSSProperties,
  backdrop: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: '#FFFEF5', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)', borderRadius: 12, padding: 18, width: '100%', maxWidth: 340, maxHeight: '90vh', overflowY: 'auto', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A', display: 'flex', flexDirection: 'column' } as React.CSSProperties,
  scrollArea: { flexShrink: 1 },
  scrollContent: { gap: 12, paddingBottom: 8 },
  closeBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#9A9A9A', fontSize: 24, lineHeight: 24, fontWeight: '500' },
  imageWrap: { width: '100%', height: 200, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F5F0E0', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  productImage: { width: '100%', height: '100%' },
  productName: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', lineHeight: 22, fontFamily: "'Permanent Marker', cursive" },
  productBrand: { fontSize: 13, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  productPrice: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  productOriginalPrice: { fontSize: 15, color: '#9A9A9A', textDecorationLine: 'line-through', fontFamily: "'Permanent Marker', cursive" },
  recommendationBox: { backgroundColor: '#E0FFF0', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#00CC52', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  recommendationTitle: { fontSize: 16, fontWeight: '700', color: '#00CC52', marginBottom: 8, fontFamily: "'Permanent Marker', cursive" },
  recommendationHeadline: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', lineHeight: 22, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sizePill: { backgroundColor: '#FFFEF5', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  sizePillPrimary: { backgroundColor: '#FFE566', borderColor: '#1A1A1A' },
  sizePillRegion: { fontSize: 11, fontWeight: '700', color: '#4A4A4A', letterSpacing: 0.5, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizePillValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sizePillValuePrimary: { color: '#1A1A1A' },
  // ── Multi-offer styles ──
  offerArea: { marginTop: 8, gap: 10 },
  primaryOfferContainer: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFE566' } as React.CSSProperties,
  primaryOfferRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  offerThumbnail: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#F5F0E0', borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  offerThumbnailSmall: { width: 40, height: 40, borderRadius: 7, backgroundColor: '#FFFEF5', borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  primaryOfferInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  primaryOfferPlatform: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  primaryOfferPrice: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  primaryOfferBtn: { backgroundColor: '#00FF66', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  primaryOfferBtnLoading: { backgroundColor: '#00CC52', opacity: 0.85 },
  primaryOfferBtnText: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  secondaryOffersContainer: { gap: 6 },
  secondaryOffersHeader: { fontSize: 13, fontWeight: '700', color: '#4A4A4A', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  secondaryOfferRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F0E0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#9A9A9A', minHeight: 44 } as React.CSSProperties,
  secondaryOfferRowSelected: { borderWidth: 2, borderColor: '#1A1A1A', backgroundColor: '#FFFACC' } as React.CSSProperties,
  secondaryOfferInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  secondaryOfferText: { flexShrink: 1 },
  secondaryOfferPlatform: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  secondaryOfferPrice: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  secondaryOfferBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1.5, borderColor: '#1A1A1A', backgroundColor: '#FFFEF5' } as React.CSSProperties,
  secondaryOfferBtnLoading: { opacity: 0.6 },
  secondaryOfferBtnText: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  // ── exclusive badges ──
  exclusiveContainer: { gap: 6 },
  exclusiveBadge: { backgroundColor: '#F5F0E0', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#1A1A1A', alignItems: 'center' } as React.CSSProperties,
  exclusiveText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  // ── shared ──
  btnContentWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  confirmBtnIcon: { fontSize: 15 },
  spinner: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(26,26,26,0.3)', borderTopColor: '#1A1A1A' },
  // ── comparison (redesigned) ──
  comparisonBox: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFE566' } as React.CSSProperties,
  comparisonTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 10, textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Permanent Marker', cursive" },
  comparisonTable: { gap: 8 },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F0E0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#9A9A9A', minHeight: 48 } as React.CSSProperties,
  comparisonRowLowest: { backgroundColor: '#E0FFF0', borderColor: '#00CC52' } as React.CSSProperties,
  comparisonRowSelected: { borderWidth: 2, borderColor: '#1A1A1A', backgroundColor: '#FFFACC' } as React.CSSProperties,
  comparisonLeftCell: { flex: 1, flexShrink: 1, alignItems: 'flex-start', gap: 2 },
  comparisonPlatformCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  comparisonPlatformEmoji: { fontSize: 14 },
  comparisonPlatformName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonSizesText: { fontSize: 10, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonRightCell: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  comparisonPrice: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  lowestPriceTag: { fontSize: 9, fontWeight: '700', color: '#00CC52', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
})
