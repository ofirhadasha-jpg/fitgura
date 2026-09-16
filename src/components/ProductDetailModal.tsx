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

const FOOTWEAR_RE = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|slipper|slippers|footwear|pump|pumps|loafer|loafers|wedge|wedges|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i
const DEVICE_RE = /\b(phone|mobile|tablet|ipad|iphone|android|laptop|desktop|computer|watch|case|cover|protector|charger|charging|cable|adapter|strap|band|holder|stand|dock|keyboard|mouse|screen)\b/i

function isAccessory(productName: string, category: string): boolean {
  if (category === 'accessories') return true
  if (category === 'shoes' || FOOTWEAR_RE.test(productName)) return false
  return DEVICE_RE.test(productName)
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

  if (!visible) return null

  const imageUrl = normalizeProductImageUrl(product.img)
  const accessory = isAccessory(product.name, category)
  const recommendedSize: SizeRecommendation | null = accessory ? null : calculateDetailedRecommendation(scannedSizes, sellerSizeChart, category, product.name, product.availableSizes ?? [])
  const hasScanned = scannedSizes != null

  async function handleProceedToBuy() {
    setIsRedirecting(true)

    const fallbackUrl = product.aliexpressUrl?.trim()
      || `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent((product.brand ?? '') + ' ' + (product.name ?? ''))}`

    let finalUrl = product.promotionLink?.trim() || null
    try {
      if (!finalUrl) {
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
        finalUrl = await Promise.race([generateAffiliateLink(fallbackUrl), timeoutPromise])
      }
    } catch {
      // Affiliate link generation failed — fall back to direct product URL
    }
    finalUrl = finalUrl ?? fallbackUrl

    logAffiliateClick({
      product_id: product.aliexpressSku ?? '',
      title: product.name ?? '',
      promotion_link: finalUrl,
    }).catch(() => {})

    setIsRedirecting(false)
    onDismiss()

    try {
      const a = document.createElement('a')
      a.href = finalUrl
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      window.open(finalUrl, '_blank', 'noopener,noreferrer')
    }
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
            {imgError || !imageUrl ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E0' }}>
                <Text style={{ fontSize: 48 }}>📦</Text>
              </View>
            ) : (
              <Image
                source={{ uri: imageUrl }}
                style={modalStyles.productImage}
                onError={() => setImgError(true)}
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
                      onPress={() => {
                        const url = entry.productUrl
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
                      }}
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

        <TouchableOpacity
          onPress={handleProceedToBuy}
          activeOpacity={0.7}
          style={[
            modalStyles.confirmBtn,
            isRedirecting && modalStyles.confirmBtnLoading,
          ]}
          disabled={isRedirecting}
          accessibilityRole="button"
          accessibilityLabel={isRedirecting ? 'מעביר לרכישה, אנא המתן' : 'מתאים לי, המשך לרכישה בעליאקספרס'}
          accessibilityState={{ disabled: isRedirecting }}
        >
          {isRedirecting ? (
            <View style={modalStyles.btnContentWrap}>
              <View style={modalStyles.spinner} className="fitgura-spinner" />
              <Text style={modalStyles.confirmBtnText}>מעביר לרכישה...</Text>
            </View>
          ) : (
            <View style={modalStyles.btnContentWrap}>
              <Text style={modalStyles.confirmBtnIcon}>🛒</Text>
              <Text style={modalStyles.confirmBtnText}>מתאים לי</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const modalStyles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400, justifyContent: 'center', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.65)' },
  sheet: { backgroundColor: '#FFFEF5', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', padding: 18, width: 340, maxWidth: '92%', maxHeight: '88%', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  scrollArea: { flexShrink: 1 },
  scrollContent: { gap: 12, paddingBottom: 8 },
  closeBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#9A9A9A', fontSize: 24, lineHeight: 24, fontWeight: '500' },
  imageWrap: { width: '100%', height: 200, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', overflow: 'hidden', backgroundColor: '#F5F0E0', borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  productImage: { width: '100%', height: '100%' },
  productName: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', lineHeight: 22, fontFamily: "'Permanent Marker', cursive" },
  productBrand: { fontSize: 13, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  productPrice: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  productOriginalPrice: { fontSize: 15, color: '#9A9A9A', textDecorationLine: 'line-through', fontFamily: "'Permanent Marker', cursive" },
  recommendationBox: { backgroundColor: '#E0FFF0', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', padding: 14, borderWidth: 1.5, borderColor: '#00CC52', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  recommendationTitle: { fontSize: 16, fontWeight: '700', color: '#00CC52', marginBottom: 8, fontFamily: "'Permanent Marker', cursive" },
  recommendationHeadline: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', lineHeight: 22, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sizePill: { backgroundColor: '#FFFEF5', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', paddingVertical: 5, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  sizePillPrimary: { backgroundColor: '#FFE566', borderColor: '#1A1A1A' },
  sizePillRegion: { fontSize: 11, fontWeight: '700', color: '#4A4A4A', letterSpacing: 0.5, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizePillValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sizePillValuePrimary: { color: '#1A1A1A' },
  confirmBtn: { backgroundColor: '#00FF66', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8, alignSelf: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  confirmBtnLoading: { backgroundColor: '#00CC52', opacity: 0.85 },
  btnContentWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  confirmBtnIcon: { fontSize: 15 },
  spinner: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(26,26,26,0.3)', borderTopColor: '#1A1A1A' },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonBox: { backgroundColor: '#FFFEF5', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', padding: 12, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #FFE566' } as React.CSSProperties,
  comparisonTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 10, textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Permanent Marker', cursive" },
  comparisonTable: { gap: 6 },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F0E0', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  comparisonRowLowest: { backgroundColor: '#E0FFF0', borderColor: '#00CC52' } as React.CSSProperties,
  comparisonPlatformCell: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 90, flexShrink: 1 },
  comparisonPlatformEmoji: { fontSize: 12 },
  comparisonPlatformName: { fontSize: 11, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonPriceCell: { width: 70, alignItems: 'flex-start' },
  comparisonPrice: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  lowestPriceTag: { fontSize: 8, fontWeight: '700', color: '#00CC52', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonSizesCell: { flex: 1, flexShrink: 1 },
  comparisonSizesText: { fontSize: 10, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  comparisonBuyBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', borderWidth: 1, borderColor: '#1A1A1A' } as React.CSSProperties,
  comparisonBuyBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFEF5', fontFamily: "'Permanent Marker', cursive" },
})
