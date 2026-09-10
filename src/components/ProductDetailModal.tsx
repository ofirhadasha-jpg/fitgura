import React, { useState } from 'react'
import type { GestureResponderEvent } from 'react-native'
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native'
import { type Product, type ScannedSizes } from '../types'
import { getRecommendedSize, type SellerSizeEntry, type SizeMatchResult } from '../utils/exactSizeMatcher'
import { supabase } from '../lib/supabase'
import { logAffiliateClick } from '../services/analyticsService'

function formatPrice(price: number, currency?: string): string {
  const symbol = currency ?? '₪'
  return `${symbol}${price.toLocaleString()}`
}

function normalizeProductImageUrl(imageUrl: string): string | null {
  const value = imageUrl.trim()
  if (!value) return null
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('http://')) return value.replace('http://', 'https://')
  if (value.startsWith('https://')) return value
  return null
}

const DEVICE_ACCESSORY_KEYWORDS = /\b(phone|mobile|tablet|ipad|iphone|android|laptop|desktop|computer|watch|case|cover|protector|charger|charging|cable|adapter|strap|band|holder|stand|dock|keyboard|mouse|screen)\b/i
const FOOTWEAR_KEYWORDS = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|slipper|slippers|footwear|pump|pumps|loafer|loafers|wedge|wedges|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i

function detectEffectiveCategory(productName: string, category: string): string {
  if (category !== 'all') return category
  if (FOOTWEAR_KEYWORDS.test(productName)) return 'shoes'
  if (DEVICE_ACCESSORY_KEYWORDS.test(productName)) return 'accessories'
  return 'clothing'
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
  const effectiveCategory = detectEffectiveCategory(product.name, category)
  const isDeviceAccessory = effectiveCategory === 'accessories'
  const showSizeRecommendation = !isDeviceAccessory

  const sizeMatch: SizeMatchResult | null = showSizeRecommendation
    ? getRecommendedSize(scannedSizes, sellerSizeChart, effectiveCategory)
    : null

  async function handleProceedToBuy(e: GestureResponderEvent & { preventDefault: () => void }) {
    e.preventDefault()
    e.stopPropagation()
    setIsRedirecting(true)

    let targetUrl = product.promotionLink ?? null
    if (!targetUrl) {
      const sourceUrl = product.aliexpressUrl ?? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(product.brand + ' ' + product.name)}`
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const invokeHeaders: Record<string, string> = {}
        if (session?.access_token) {
          invokeHeaders['Authorization'] = `Bearer ${session.access_token}`
        }
        const { data } = await supabase.functions.invoke('aliexpress-search', {
          body: { action: 'affiliate-link', sourceUrl },
          headers: invokeHeaders,
        })
        const links = (data as Record<string, unknown>)?.links as { promotion_link?: string }[] | undefined
        targetUrl = links?.[0]?.promotion_link ?? null
      } catch {
        targetUrl = null
      }
    }
    const finalUrl = targetUrl ?? product.aliexpressUrl ?? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(product.brand + ' ' + product.name)}`

    await logAffiliateClick({
      product_id: product.aliexpressSku ?? '',
      title: product.name,
      promotion_link: finalUrl,
    })

    window.open(finalUrl, '_blank', 'noopener,noreferrer')
    setIsRedirecting(false)
    onDismiss()
  }

  const recommendedLabel = sizeMatch?.sizeLabel ?? ''

  return (
    <View style={modalStyles.overlay}>
      <TouchableOpacity onPress={onDismiss} activeOpacity={1} style={modalStyles.backdrop} />
      <View style={modalStyles.sheet}>
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={modalStyles.closeBtn}>
          <Text style={modalStyles.closeText}>×</Text>
        </TouchableOpacity>

        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
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

          {showSizeRecommendation && sizeMatch && (
            <View style={modalStyles.recommendationBox}>
              <Text style={modalStyles.recommendationTitle}>🎯 Fitgura Smart Size</Text>
              <Text style={modalStyles.recommendationHeadline}>
                המידה המומלצת עבורך במוצר זה: <Text style={modalStyles.recommendationSize}>{recommendedLabel}</Text>
              </Text>
              <Text style={modalStyles.recommendationSource}>
                {sizeMatch.source === 'seller_chart'
                  ? '(לפי טבלת המוכר בס"מ)'
                  : sizeMatch.source === 'asian_conversion'
                    ? '(המרת מידה אסייתית)'
                    : '(לפי סריקת AI)'}
              </Text>
              <Text style={modalStyles.recommendationReason}>{sizeMatch.reason}</Text>
            </View>
          )}

          {!showSizeRecommendation && (
            <View style={modalStyles.recommendationBox}>
              <Text style={modalStyles.recommendationTitle}>📱 מוצר אביזר</Text>
              <Text style={modalStyles.recommendationHeadline}>לא נדרשת התאמת מידה למוצר זה</Text>
            </View>
          )}
        </ScrollView>

        <TouchableOpacity
          onPress={handleProceedToBuy}
          activeOpacity={0.8}
          style={modalStyles.confirmBtn}
          disabled={isRedirecting}
        >
          <Text style={modalStyles.confirmBtnText}>
            {isRedirecting
              ? 'מעביר לרכישה...'
              : showSizeRecommendation && recommendedLabel
                ? `המשך לרכישת מידה ${recommendedLabel} בעליאקספרס`
                : 'המשך לרכישה בעליאקספרס'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const modalStyles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400, justifyContent: 'center', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,20,55,0.65)' },
  sheet: { backgroundColor: '#fff', borderRadius: 22, padding: 18, width: 340, maxWidth: '92%', gap: 12, elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  closeBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#94A3B8', fontSize: 24, lineHeight: 24, fontWeight: '500' },
  imageWrap: { width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F1F5F9' },
  productImage: { width: '100%', height: '100%' },
  productName: { fontSize: 15, fontWeight: '700', color: '#1E293B', lineHeight: 20, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  productBrand: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  productPrice: { fontSize: 18, fontWeight: '800', color: '#2E5BFF' },
  productOriginalPrice: { fontSize: 14, color: '#94A3B8', textDecorationLine: 'line-through' },
  recommendationBox: { backgroundColor: '#F0FFF6', borderRadius: 14, padding: 14, gap: 6, borderWidth: 1.5, borderColor: 'rgba(46,213,115,0.35)' },
  recommendationTitle: { fontSize: 13, fontWeight: '800', color: '#16A34A', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  recommendationHeadline: { fontSize: 15, fontWeight: '700', color: '#1E293B', lineHeight: 21, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  recommendationSize: { fontSize: 17, fontWeight: '800', color: '#2E5BFF' },
  recommendationSource: { fontSize: 11, color: '#64748B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  recommendationReason: { fontSize: 12, color: '#475569', lineHeight: 17, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  confirmBtn: { width: '100%', backgroundColor: '#FF4747', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 8, alignItems: 'center', marginTop: 4 },
  confirmBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
