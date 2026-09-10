import React, { useState } from 'react'
import type { GestureResponderEvent } from 'react-native'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { type Product, type ScannedSizes } from '../types'
import { formatFullPantsSizeLabel } from '../utils/sizeConverter'
import { ProductDetailModal } from './ProductDetailModal'

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

const SUIT_KEYWORDS = /\b(suit|blazer set|two.?piece|tracksuit|set|חליפה|סט|סט חליפה)\b/i
const SHIRT_KEYWORDS = /\b(shirt|t-?shirt|hoodie|sweater|jacket|coat|polo|tank|top|blouse|חולצה|ג'?קט|מעיל|סוודר|בגד עליון)\b/i
const PANTS_KEYWORDS = /\b(pants|jeans|trousers|shorts|leggings|jogger|מכנסיים|מכנס)\b/i
const DEVICE_ACCESSORY_KEYWORDS = /\b(phone|mobile|tablet|ipad|iphone|android|laptop|desktop|computer|watch|case|cover|protector|charger|charging|cable|adapter|strap|band|holder|stand|dock|keyboard|mouse|screen)\b/i

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
  return [
    { label: 'חולצה', value: top },
    { label: 'מכנסיים', value: formatFullPantsSizeLabel(bottom) },
  ]
}

function getRecommendedSizeLabel(productName: string, scannedSizes: ScannedSizes | null, category: string): string | null {
  if (!scannedSizes) return null
  if (category === 'shoes') {
    return scannedSizes.shoeSize ? `נעל: EU ${scannedSizes.shoeSize}` : null
  }
  if (category === 'accessories') return null
  const top = scannedSizes.sizing.top
  const bottom = scannedSizes.sizing.bottom
  const isSuit = SUIT_KEYWORDS.test(productName)
  const isShirt = SHIRT_KEYWORDS.test(productName)
  const isPants = PANTS_KEYWORDS.test(productName)
  if (isSuit || (isShirt && isPants)) {
    return `חולצה: ${top}  |  מכנסיים: ${formatFullPantsSizeLabel(bottom)}`
  }
  if (isShirt && !isPants) return `חולצה: ${top}`
  if (isPants && !isShirt) return `מכנסיים: ${formatFullPantsSizeLabel(bottom)}`
  return `חולצה: ${top}  |  מכנסיים: ${formatFullPantsSizeLabel(bottom)}`
}



export default function ProductCard({ product, inWishlist, onToggleWishlist, scannedSizes, category }: {
  product: Product;
  inWishlist: boolean;
  onToggleWishlist: () => void;
  scannedSizes: ScannedSizes | null;
  category: string;
}) {
  const [toast, setToast] = useState<string | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [imgError, setImgError] = useState(false)

  const imageUrl = normalizeProductImageUrl(product.img)

  const isDeviceAccessory = category === 'accessories' || DEVICE_ACCESSORY_KEYWORDS.test(product.name)
  const showSizeRecommendation = !isDeviceAccessory && category !== 'accessories'
  const recommendedSize = showSizeRecommendation ? getRecommendedSizeLabel(product.name, scannedSizes, category) : null
  const sizeBreakdown = showSizeRecommendation ? getSizeBreakdown(product.name, scannedSizes, category) : []

  function handleBuy() {
    setShowDetailModal(true)
  }



  return (
    <View style={cardStyles.productCard} className="product-card">
      <View style={cardStyles.productImageWrap}>
        {imgError || !imageUrl ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' }}>
            <Text style={{ fontSize: 36 }}>📦</Text>
          </View>
        ) : (
          <Image
            source={{ uri: imageUrl }}
            style={cardStyles.productImage}
            onError={() => setImgError(true)}
          />
        )}
        <TouchableOpacity
          onPress={(e: GestureResponderEvent & { preventDefault: () => void }) => { e.preventDefault(); e.stopPropagation(); onToggleWishlist() }}
          activeOpacity={0.7}
          style={cardStyles.heartBtn}
        >
          <Text style={{ fontSize: 15 }}>{inWishlist ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
        <View style={cardStyles.aiBadge}>
          <View style={cardStyles.aiBadgeDot} />
          <Text style={cardStyles.aiBadgeText}>AI Match</Text>
        </View>
        {recommendedSize && showSizeRecommendation && (
          <View style={cardStyles.sizeBadge}>
            <Text style={cardStyles.sizeBadgeText}>מידה מומלצת עבורך: {recommendedSize}</Text>
          </View>
        )}
      </View>
      <View style={cardStyles.productInfo}>
        {showSizeRecommendation && (
          <View style={cardStyles.matchChip}>
            <Text style={cardStyles.matchChipText}>
              {category === 'shoes' && scannedSizes?.shoeSize
                ? `✓ מתאים למידה נעל: EU ${scannedSizes.shoeSize}`
                : scannedSizes
                  ? `✓ מתאים למידה: ${scannedSizes.sizing.top}/${scannedSizes.sizing.bottom} EU`
                  : '✓ מתאים למידה שנסרקת'}
            </Text>
          </View>
        )}
        <Text style={cardStyles.productName}>{product.name}</Text>
        <Text style={cardStyles.productBrand}>{product.brand}</Text>
        <View style={cardStyles.priceRow}>
          <Text style={cardStyles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
          {product.originalPrice && product.originalPrice > product.price && (
            <Text style={cardStyles.productOriginalPrice}>{formatPrice(product.originalPrice, product.currency)}</Text>
          )}
        </View>
        <View style={cardStyles.buyBtnRow}>
          <TouchableOpacity
            onPress={handleBuy}
            activeOpacity={0.8}
            style={cardStyles.buyBtnAli}
          >
            <Text style={cardStyles.buyBtnText}>🛒 לקניה במחיר הטוב ביותר</Text>
          </TouchableOpacity>
        </View>
        {toast && (
          <View style={cardStyles.toast}>
            <Text style={cardStyles.toastText}>{toast}</Text>
          </View>
        )}
      </View>

      <ProductDetailModal
        product={product}
        scannedSizes={scannedSizes}
        category={category}
        visible={showDetailModal}
        onDismiss={() => setShowDetailModal(false)}
      />
    </View>
  )
}

const cardStyles = StyleSheet.create({
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
  toast: { marginTop: 6, backgroundColor: '#0B1437', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 10, fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeBadge: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: '#2E5BFF', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  sizeBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  })
