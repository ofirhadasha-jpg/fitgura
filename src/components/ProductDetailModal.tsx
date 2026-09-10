import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { type Product, type ScannedSizes } from '../types'
import { calculateRecommendedSize, type SellerSizeEntry } from '../utils/exactSizeMatcher'
import { generateAffiliateLink } from '../lib/aliexpress'
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
  const recommendedSize = accessory ? null : calculateRecommendedSize(scannedSizes, sellerSizeChart, category, product.name)

  async function handleProceedToBuy() {
    setIsRedirecting(true)

    const fallbackUrl = product.aliexpressUrl ?? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(product.brand + ' ' + product.name)}`

    let finalUrl = product.promotionLink ?? null
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
      title: product.name,
      promotion_link: finalUrl,
    }).catch(() => {})

    setIsRedirecting(false)
    onDismiss()

    try {
      const newTab = window.open(finalUrl, '_blank')
      if (!newTab) {
        window.location.href = finalUrl
      }
    } catch {
      window.location.href = finalUrl
    }
  }

  return (
    <View style={modalStyles.overlay}>
      <TouchableOpacity onPress={onDismiss} activeOpacity={1} style={modalStyles.backdrop} />
      <View style={modalStyles.sheet}>
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={modalStyles.closeBtn}>
          <Text style={modalStyles.closeText}>×</Text>
        </TouchableOpacity>

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
            <Text style={modalStyles.recommendationHeadline}>
              🎯 המידה המומלצת עבורך: <Text style={modalStyles.recommendationSize}>{recommendedSize}</Text>
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleProceedToBuy}
          activeOpacity={0.8}
          style={modalStyles.confirmBtn}
          disabled={isRedirecting}
        >
          <Text style={modalStyles.confirmBtnText}>
            {isRedirecting ? 'מעביר לרכישה...' : 'המשך לרכישה בעליאקספרס'}
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
  recommendationBox: { backgroundColor: '#F0FFF6', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: 'rgba(46,213,115,0.35)' },
  recommendationHeadline: { fontSize: 16, fontWeight: '700', color: '#1E293B', lineHeight: 22, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  recommendationSize: { fontSize: 18, fontWeight: '800', color: '#2E5BFF' },
  confirmBtn: { width: '100%', backgroundColor: '#FF4747', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 8, alignItems: 'center', marginTop: 4 },
  confirmBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', textAlign: 'center', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
