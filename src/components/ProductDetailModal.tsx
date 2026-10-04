import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native'
import { type Product, type ScannedSizes } from '../types'
import { calculateDetailedRecommendation, type SellerSizeEntry, type SizeRecommendation } from '../utils/exactSizeMatcher'
import { type SizePill } from '../utils/sizeConverter'
import { generateAffiliateLink } from '../lib/aliexpress'
import { logAffiliateClick } from '../services/analyticsService'
import { PLATFORM_LABELS, PLATFORM_COLORS, PLATFORM_LOGOS } from '../services/multiPlatformService'

function formatPrice(price: number | null | undefined, currency?: string): string {
  const symbol = currency ?? '₪'
  const safePrice = typeof price === 'number' && !isNaN(price) ? price : 0
  return `${symbol}${safePrice.toLocaleString()}`
}

function normalizeProductImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  const value = imageUrl.trim()
  if (!value) return null
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('http://')) return value.replace('http://', 'https://')
  if (value.startsWith('https://')) return value
  return null
}

// Category-based fallback fashion images so the modal never shows a box placeholder.
const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  shirts:   'https://images.pexels.com/photos/14564843/pexels-photo-14564843.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  tops:     'https://images.pexels.com/photos/14564843/pexels-photo-14564843.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  pants:    'https://images.pexels.com/photos/6439226/pexels-photo-6439226.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  jeans:    'https://images.pexels.com/photos/6439226/pexels-photo-6439226.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  bottoms:  'https://images.pexels.com/photos/6439226/pexels-photo-6439226.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  shoes:    'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  sneakers: 'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  footwear: 'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  dresses:  'https://images.pexels.com/photos/39873869/pexels-photo-39873869.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  dress:    'https://images.pexels.com/photos/39873869/pexels-photo-39873869.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  jackets:  'https://images.pexels.com/photos/4398944/pexels-photo-4398944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  outerwear:'https://images.pexels.com/photos/4398944/pexels-photo-4398944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  coats:    'https://images.pexels.com/photos/4398944/pexels-photo-4398944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  accessories: 'https://images.pexels.com/photos/19869755/pexels-photo-19869755.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
}

function getFallbackImage(category: string, productName: string): string {
  const cat = category.toLowerCase().trim()
  if (CATEGORY_FALLBACK_IMAGES[cat]) return CATEGORY_FALLBACK_IMAGES[cat]
  // Keyword matching on product name
  const name = productName.toLowerCase()
  if (/\b(shirt|tshirt|tee|top|blouse)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.tops
  if (/\b(pant|jean|trouser|short)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.pants
  if (/\b(shoe|sneaker|boot|sandal|heel)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.shoes
  if (/\b(dress|gown|skirt)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.dresses
  if (/\b(jacket|coat|blazer|parka|windbreaker)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.jackets
  if (/\b(bag|purse|wallet|belt|hat|cap|scarf|glasses|watch|jewelr)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.accessories
  // Default: generic clothing
  return CATEGORY_FALLBACK_IMAGES.tops
}

const FOOTWEAR_RE = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|slipper|slippers|footwear|pump|pumps|loafer|loafers|wedge|wedges|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i
const DEVICE_RE = /\b(phone|mobile|tablet|ipad|iphone|android|laptop|desktop|computer|watch|case|cover|protector|charger|charging|cable|adapter|strap|band|holder|stand|dock|keyboard|mouse|screen)\b/i

function isAccessory(productName: string, category: string): boolean {
  if (category === 'accessories') return true
  if (category === 'shoes' || FOOTWEAR_RE.test(productName)) return false
  return DEVICE_RE.test(productName)
}

// ── Multi-offer helpers ──────────────────────────────────────────────────────

interface OfferEntry {
  platform: string
  label: string
  price: number
  currency?: string
  url: string
}

function buildOffers(product: Product): OfferEntry[] {
  const offers: OfferEntry[] = []

  // Primary: SHEIN (or product's own platform if it's shein)
  const sheinComparison = product.priceComparison?.find(
    (e) => e.platform === 'shein',
  )
  if (sheinComparison) {
    offers.push({
      platform: 'shein',
      label: PLATFORM_LABELS.shein,
      price: sheinComparison.price,
      currency: sheinComparison.currency,
      url: sheinComparison.productUrl,
    })
  } else if (product.platform === 'shein') {
    offers.push({
      platform: 'shein',
      label: PLATFORM_LABELS.shein,
      price: product.price,
      currency: product.currency,
      url: product.buyUrl || product.aliexpressUrl || '',
    })
  }

  // Secondary: AliExpress, Temu, CJ
  const secondaryPlatforms: string[] = ['aliexpress', 'temu', 'cj']
  for (const plat of secondaryPlatforms) {
    const cmp = product.priceComparison?.find((e) => e.platform === plat)
    if (cmp) {
      offers.push({
        platform: plat,
        label: PLATFORM_LABELS[plat as keyof typeof PLATFORM_LABELS] ?? plat,
        price: cmp.price,
        currency: cmp.currency,
        url: cmp.productUrl,
      })
    } else if (product.platform === plat) {
      offers.push({
        platform: plat,
        label: PLATFORM_LABELS[plat as keyof typeof PLATFORM_LABELS] ?? plat,
        price: product.price,
        currency: product.currency,
        url: product.buyUrl || product.aliexpressUrl || '',
      })
    }
  }

  // If no offers were built from priceComparison, use the product itself as primary
  if (offers.length === 0) {
    const plat = product.platform ?? 'aliexpress'
    offers.push({
      platform: plat,
      label: PLATFORM_LABELS[plat as keyof typeof PLATFORM_LABELS] ?? plat,
      price: product.price,
      currency: product.currency,
      url: product.buyUrl || product.aliexpressUrl || product.promotionLink || '',
    })
  }

  return offers
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

  if (!visible) return null

  // Image: use normalized URL; on error, fall back to category-appropriate fashion image (never the box)
  const rawImageUrl = normalizeProductImageUrl(product.img)
  const fallbackUrl = getFallbackImage(category, product.name)
  const imageUrl = rawImageUrl ?? fallbackUrl
  const usingFallback = !rawImageUrl

  const accessory = isAccessory(product.name, category)
  const recommendedSize: SizeRecommendation | null = accessory ? null : calculateDetailedRecommendation(scannedSizes, sellerSizeChart, category, product.name, product.availableSizes ?? [])
  const hasScanned = scannedSizes != null

  const offers = buildOffers(product)
  const primaryOffer = offers[0] ?? null
  const secondaryOffers = offers.slice(1)

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

  function handleSecondaryBuy(offer: OfferEntry) {
    if (!offer.url) return
    setRedirectingOffer(offer.platform)
    openUrl(offer.url, product)
    setRedirectingOffer(null)
  }

  return (
    <View style={modalStyles.overlay}>
      <TouchableOpacity onPress={onDismiss} activeOpacity={1} style={modalStyles.backdrop} />
      <View style={modalStyles.sheet}>
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={modalStyles.closeBtn}>
          <Text style={modalStyles.closeText}>×</Text>
        </TouchableOpacity>

        <ScrollView style={modalStyles.scrollArea} contentContainerStyle={modalStyles.scrollContent}>
          <View style={modalStyles.imageWrap}>
            <Image
              source={{ uri: imageUrl }}
              style={modalStyles.productImage}
              onError={() => {
                if (!usingFallback) {
                  setImgError(true)
                }
              }}
            />
            {imgError && usingFallback === false && (
              <Image
                source={{ uri: fallbackUrl }}
                style={[modalStyles.productImage, { position: 'absolute', top: 0, left: 0 }]}
              />
            )}
          </View>

          <Text style={modalStyles.productName} numberOfLines={3}>{product.name}</Text>
          <Text style={modalStyles.productBrand}>{product.brand}</Text>

          <View style={modalStyles.priceRow}>
            <Text style={modalStyles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
            {product.originalPrice && product.originalPrice > product.price && (
              <Text style={modalStyles.productOriginalPrice}>{formatPrice(product.originalPrice, product.currency)}</Text>
            )}
          </View>

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

          {product.priceComparison && product.priceComparison.length > 1 && (
            <View style={modalStyles.comparisonBox}>
              <Text style={modalStyles.comparisonTitle}>השוואת מחירים ומידות</Text>
              <View style={modalStyles.comparisonTable}>
                {product.priceComparison.map((entry, idx) => (
                  <View key={idx} style={[modalStyles.comparisonRow, entry.isLowestPrice && modalStyles.comparisonRowLowest]}>
                    <View style={modalStyles.comparisonPlatformCell}>
                      <Text style={modalStyles.comparisonPlatformEmoji}>{PLATFORM_LOGOS[entry.platform]}</Text>
                      <Text style={modalStyles.comparisonPlatformName}>{PLATFORM_LABELS[entry.platform]}</Text>
                    </View>
                    <View style={modalStyles.comparisonPriceCell}>
                      <Text style={modalStyles.comparisonPrice}>{formatPrice(entry.price, entry.currency)}</Text>
                      {entry.isLowestPrice && (
                        <Text style={modalStyles.lowestPriceTag}>הכי זול</Text>
                      )}
                    </View>
                    <View style={modalStyles.comparisonSizesCell}>
                      <Text style={modalStyles.comparisonSizesText}>
                        {entry.sizesAvailable.length > 0 ? entry.sizesAvailable.slice(0, 5).join(', ') : '—'}
                        {entry.sizesAvailable.length > 5 ? '...' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => openUrl(entry.productUrl, product)}
                      activeOpacity={0.7}
                      style={[modalStyles.comparisonBuyBtn, { backgroundColor: PLATFORM_COLORS[entry.platform] } as React.CSSProperties]}
                    >
                      <Text style={modalStyles.comparisonBuyBtnText}>קנה</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Multi-offer action area (replaces single green button) ── */}
        <View style={modalStyles.offerArea}>
          {/* Primary verified offer (SHEIN or first available) */}
          {primaryOffer && (
            <View style={modalStyles.primaryOfferContainer}>
              <View style={modalStyles.primaryOfferInfo}>
                <Text style={modalStyles.primaryOfferPlatform}>
                  {PLATFORM_LOGOS[primaryOffer.platform as keyof typeof PLATFORM_LOGOS] ?? '🛍️'}{' '}
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

          {/* Secondary potential offers (AliExpress / Temu / CJ) */}
          {secondaryOffers.length > 0 && (
            <View style={modalStyles.secondaryOffersContainer}>
              <Text style={modalStyles.secondaryOffersHeader}>התאמה משוערת - שווה לבדוק</Text>
              {secondaryOffers.map((offer, idx) => (
                <View key={idx} style={modalStyles.secondaryOfferRow}>
                  <View style={modalStyles.secondaryOfferInfo}>
                    <Text style={modalStyles.secondaryOfferPlatform}>
                      {PLATFORM_LOGOS[offer.platform as keyof typeof PLATFORM_LOGOS] ?? '🛍️'}{' '}
                      {offer.label}
                    </Text>
                    <Text style={modalStyles.secondaryOfferPrice}>
                      {formatPrice(offer.price, offer.currency)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleSecondaryBuy(offer)}
                    activeOpacity={0.7}
                    style={[
                      modalStyles.secondaryOfferBtn,
                      redirectingOffer === offer.platform && modalStyles.secondaryOfferBtnLoading,
                    ]}
                    disabled={redirectingOffer === offer.platform}
                    accessibilityRole="button"
                    accessibilityLabel={`שווה בדיקה ב${offer.label}`}
                  >
                    <Text style={modalStyles.secondaryOfferBtnText}>
                      {redirectingOffer === offer.platform ? '...' : 'שווה בדיקה'}
                    </Text>
                  </TouchableOpacity>
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
  secondaryOfferRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F0E0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  secondaryOfferInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  secondaryOfferPlatform: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  secondaryOfferPrice: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  secondaryOfferBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1.5, borderColor: '#1A1A1A', backgroundColor: '#FFFEF5' } as React.CSSProperties,
  secondaryOfferBtnLoading: { opacity: 0.6 },
  secondaryOfferBtnText: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  // ── shared ──
  btnContentWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  confirmBtnIcon: { fontSize: 15 },
  spinner: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(26,26,26,0.3)', borderTopColor: '#1A1A1A' },
  // ── comparison (preserved) ──
  comparisonBox: { backgroundColor: '#FFFEF5', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFE566' } as React.CSSProperties,
  comparisonTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 10, textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Permanent Marker', cursive" },
  comparisonTable: { gap: 6 },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F0E0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  comparisonRowLowest: { backgroundColor: '#E0FFF0', borderColor: '#00CC52' } as React.CSSProperties,
  comparisonPlatformCell: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 90, flexShrink: 1 },
  comparisonPlatformEmoji: { fontSize: 12 },
  comparisonPlatformName: { fontSize: 11, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonPriceCell: { width: 70, alignItems: 'flex-start' },
  comparisonPrice: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  lowestPriceTag: { fontSize: 8, fontWeight: '700', color: '#00CC52', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonSizesCell: { flex: 1, flexShrink: 1 },
  comparisonSizesText: { fontSize: 10, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonBuyBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1A1A1A' } as React.CSSProperties,
  comparisonBuyBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFEF5', fontFamily: "'Permanent Marker', cursive" },
})
