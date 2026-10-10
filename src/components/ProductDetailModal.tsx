import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native'
import { type Product, type ScannedSizes, type Offer, type PriceComparisonEntry } from '../types'
import { calculateDetailedRecommendation, type SellerSizeEntry, type SizeRecommendation } from '../utils/exactSizeMatcher'
import { type SizePill } from '../utils/sizeConverter'
import { generateAffiliateLink } from '../lib/aliexpress'
import { logAffiliateClick } from '../services/analyticsService'
import { PLATFORM_LABELS, PLATFORM_COLORS, PLATFORM_LOGOS } from '../services/multiPlatformService'
import { resolveProductImage, getFallbackImage } from '../utils/productImages'
import { searchAllVisualMatches, getExclusivePlatforms } from '../services/imageSearch'
import type { ExactVisualMatch } from '../services/adapterTypes'
import type { ProductPlatform } from '../types'

function formatPrice(price: number | null | undefined, currency?: string): string {
  const symbol = currency ?? '₪'
  const safePrice = typeof price === 'number' && !isNaN(price) ? price : 0
  return `${symbol}${safePrice.toLocaleString()}`
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
}

export function ProductDetailModal({ product, scannedSizes, category, sellerSizeChart = [], visible, onDismiss }: ProductDetailModalProps) {
  const [imgError, setImgError] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [redirectingOffer, setRedirectingOffer] = useState<string | null>(null)
  const [selectedOfferKey, setSelectedOfferKey] = useState<string | null>(null)
  const [exactMatches, setExactMatches] = useState<ExactVisualMatch[]>([])
  const [isSearchingExactMatches, setIsSearchingExactMatches] = useState(false)
  const [searchComplete, setSearchComplete] = useState(false)

  useEffect(() => {
    if (!visible) return
    const imageUrl = product.imageUrl ?? product.img
    let cancelled = false
    setExactMatches([])
    setSearchComplete(false)
    setIsSearchingExactMatches(true)
    void searchAllVisualMatches(imageUrl)
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
  }, [visible, product.imageUrl, product.img])

  if (!visible) return null

  // Image: always resolve to a valid URL — never show a box placeholder
  const fallbackUrl = getFallbackImage(category, product.name)
  const primaryImageUrl = resolveProductImage(product.img, category, product.name)
  const imageUrl = imgError ? fallbackUrl : primaryImageUrl

  const accessory = isAccessory(product.name, category)
  const recommendedSize: SizeRecommendation | null = accessory ? null : calculateDetailedRecommendation(scannedSizes, sellerSizeChart, category, product.name, product.availableSizes ?? [])
  const hasScanned = scannedSizes != null

  const aliExpressUrl = product.buyUrl ?? product.aliexpressUrl ?? product.primaryOffer?.url ?? ''
  const primaryOffer: Offer | null = aliExpressUrl ? {
    platform: 'aliexpress',
    label: PLATFORM_LABELS.aliexpress,
    price: product.price,
    currency: '₪',
    url: aliExpressUrl,
  } : null
  const secondaryOffers: Offer[] = exactMatches.map((match) => ({
    platform: match.platform,
    label: PLATFORM_LABELS[match.platform],
    price: match.price,
    currency: '₪',
    url: match.productUrl,
  }))
  const comparisonEntries: PriceComparisonEntry[] = [
    ...(primaryOffer ? [{ platform: 'aliexpress' as const, price: product.price, currency: '₪', productUrl: aliExpressUrl, sizesAvailable: product.availableSizes ?? [], isLowestPrice: false }] : []),
    ...exactMatches.map((match) => ({
      platform: match.platform,
      price: match.price,
      currency: '₪',
      productUrl: match.productUrl,
      sizesAvailable: match.sizes,
      isLowestPrice: false,
    })),
  ]
  const minComparisonPrice = comparisonEntries.length > 0 ? Math.min(...comparisonEntries.map((entry) => entry.price)) : 0
  comparisonEntries.forEach((entry) => { entry.isLowestPrice = entry.price === minComparisonPrice })

  const exclusivePlatforms: ProductPlatform[] = searchComplete ? getExclusivePlatforms(exactMatches) : []

  async function handlePrimaryBuy() {
    if (!primaryOffer || !primaryOffer.url) return
    setIsRedirecting(true)
    setRedirectingOffer('primary')

    let finalUrl = primaryOffer.url
    // Try affiliate wrapping for non-Skimlinks URLs
    if (!primaryOffer.url.includes('go.skimresources') && !primaryOffer.url.includes('go.redirecting')) {
      try {
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
        const wrapped = await Promise.race([generateAffiliateLink(primaryOffer.url), timeoutPromise])
        if (wrapped) finalUrl = wrapped
      } catch {
        // fall back to direct URL
      }
    }

    openUrl(finalUrl, product)
    setIsRedirecting(false)
    setRedirectingOffer(null)
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
      <View style={modalStyles.sheet}>
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={modalStyles.closeBtn}>
          <Text style={modalStyles.closeText}>×</Text>
        </TouchableOpacity>

        <ScrollView style={modalStyles.scrollArea} contentContainerStyle={modalStyles.scrollContent}>
          {/* ── Product image (never shows box placeholder) ── */}
          <View style={modalStyles.imageWrap}>
            <Image
              source={{ uri: imageUrl }}
              style={modalStyles.productImage}
              onError={() => setImgError(true)}
            />
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
              <View style={modalStyles.primaryOfferInfo}>
                <Text style={modalStyles.primaryOfferPlatform}>
                  {PLATFORM_LOGOS[primaryOffer.platform] ?? '🛍️'}{' '}
                  {primaryOffer.label}
                </Text>
                <Text style={modalStyles.primaryOfferPrice}>
                  {formatPrice(primaryOffer.price, primaryOffer.currency)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handlePrimaryBuy}
                activeOpacity={0.7}
                style={[
                  modalStyles.primaryOfferBtn,
                  isRedirecting && redirectingOffer === 'primary' && modalStyles.primaryOfferBtnLoading,
                ]}
                disabled={isRedirecting && redirectingOffer === 'primary'}
                accessibilityRole="button"
                accessibilityLabel="מתאים לי, המשך לרכישה"
              >
                {isRedirecting && redirectingOffer === 'primary' ? (
                  <View style={modalStyles.btnContentWrap}>
                    <View style={modalStyles.spinner} className="fitgura-spinner" />
                    <Text style={modalStyles.primaryOfferBtnText}>מעביר לרכישה...</Text>
                  </View>
                ) : (
                  <View style={modalStyles.btnContentWrap}>
                    <Text style={modalStyles.confirmBtnIcon}>🛒</Text>
                    <Text style={modalStyles.primaryOfferBtnText}>מתאים לי</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* B. Verified exact visual matches (SHEIN / Temu) */}
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
                    <Text style={modalStyles.secondaryOfferPlatform}>
                      {PLATFORM_LOGOS[offer.platform] ?? '🛍️'}{' '}
                      {offer.label}
                    </Text>
                    <Text style={modalStyles.secondaryOfferPrice}>
                      {formatPrice(offer.price, offer.currency)}
                    </Text>
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
          {/* C. Exclusive badges for platforms where no match was found */}
          {searchComplete && exclusivePlatforms.length > 0 && (
            <View style={modalStyles.exclusiveContainer}>
              {exclusivePlatforms.map((plat: ProductPlatform) => (
                <View key={plat} style={modalStyles.exclusiveBadge}>
                  <Text style={modalStyles.exclusiveText}>
                    בלעדי ב-{PLATFORM_LABELS[plat]}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

const modalStyles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400, justifyContent: 'center', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.65)' },
  sheet: { backgroundColor: '#FFFEF5', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)', borderRadius: 12, padding: 18, width: 340, maxWidth: '92%', maxHeight: '88%', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
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
  primaryOfferInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
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
  secondaryOfferPlatform: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  secondaryOfferPrice: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  secondaryOfferBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1.5, borderColor: '#1A1A1A', backgroundColor: '#FFFEF5' } as React.CSSProperties,
  secondaryOfferBtnLoading: { opacity: 0.6 },
  secondaryOfferBtnText: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  // ── exclusive badges ──
  exclusiveContainer: { gap: 6 },
  exclusiveBadge: { backgroundColor: '#F5F0E0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#9A9A9A', alignItems: 'center' } as React.CSSProperties,
  exclusiveText: { fontSize: 12, fontWeight: '700', color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
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
