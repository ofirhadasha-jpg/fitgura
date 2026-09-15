import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native'
import { type Product, type ScannedSizes } from '../types'
import { calculateDetailedRecommendation, type SellerSizeEntry, type SizeRecommendation } from '../utils/exactSizeMatcher'
import { type SizePill } from '../utils/sizeConverter'
import { generateAffiliateLink } from '../lib/aliexpress'
import { logAffiliateClick } from '../services/analyticsService'

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
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' }}>
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
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,20,55,0.65)' },
  sheet: { backgroundColor: '#fff', borderRadius: 22, padding: 18, width: 340, maxWidth: '92%', maxHeight: '88%', elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  scrollArea: { flexShrink: 1 },
  scrollContent: { gap: 12, paddingBottom: 8 },
  closeBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#94A3B8', fontSize: 24, lineHeight: 24, fontWeight: '500' },
  imageWrap: { width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F1F5F9' },
  productImage: { width: '100%', height: '100%' },
  productName: { fontSize: 15, fontWeight: '700', color: '#1E293B', lineHeight: 20, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  productBrand: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  productPrice: { fontSize: 18, fontWeight: '800', color: '#2E5BFF' },
  productOriginalPrice: { fontSize: 14, color: '#94A3B8', textDecorationLine: 'line-through' },
  recommendationBox: { backgroundColor: '#F0FFF6', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: 'rgba(46,213,115,0.35)' },
  recommendationTitle: { fontSize: 14, fontWeight: '700', color: '#16A34A', marginBottom: 8, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  recommendationHeadline: { fontSize: 14, fontWeight: '700', color: '#1E293B', lineHeight: 20, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sizePill: { backgroundColor: '#F8FAFC', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  sizePillPrimary: { backgroundColor: '#2E5BFF', borderColor: '#2E5BFF' },
  sizePillRegion: { fontSize: 10, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
  sizePillValue: { fontSize: 13, fontWeight: '800', color: '#1E293B' },
  sizePillValuePrimary: { color: '#fff' },
  confirmBtn: { backgroundColor: '#FF4747', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8, alignSelf: 'center' },
  confirmBtnLoading: { backgroundColor: '#E03A3A', opacity: 0.85 },
  btnContentWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  confirmBtnIcon: { fontSize: 15 },
  spinner: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' },
  confirmBtnText: { fontSize: 13, fontWeight: '800', color: '#fff', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
