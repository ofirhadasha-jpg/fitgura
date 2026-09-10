import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { type Product, type ScannedSizes } from '../types'
import { calculateDetailedRecommendation, type SizeRecommendation } from '../utils/exactSizeMatcher'
import { type SizePill } from '../utils/sizeConverter'
import { ProductDetailModal } from './ProductDetailModal'

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

const SUIT_KEYWORDS = /\b(suit|blazer set|two.?piece|tracksuit|set|חליפה|סט|סט חליפה)\b/i
const SHIRT_KEYWORDS = /\b(shirt|t-?shirt|hoodie|sweater|jacket|coat|polo|tank|top|blouse|חולצה|ג'?קט|מעיל|סוודר|בגד עליון)\b/i
const PANTS_KEYWORDS = /\b(pants|jeans|trousers|shorts|leggings|jogger|מכנסיים|מכנס)\b/i
const FOOTWEAR_KEYWORDS = /\b(shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|slipper|slippers|footwear|pump|pumps|loafer|loafers|wedge|wedges|נעל|נעליים|סניקרס|מגף|מגפיים|סנדל|סנדלים)\b/i
const DEVICE_ACCESSORY_KEYWORDS = /\b(phone|mobile|tablet|ipad|iphone|android|laptop|desktop|computer|watch|case|cover|protector|charger|charging|cable|adapter|strap|band|holder|stand|dock|keyboard|mouse|screen)\b/i

function detectEffectiveCategory(productName: string, category: string): string {
  if (category !== 'all') return category
  if (FOOTWEAR_KEYWORDS.test(productName)) return 'shoes'
  if (DEVICE_ACCESSORY_KEYWORDS.test(productName)) return 'accessories'
  return 'clothing'
}

function getRecommendedSizeLabel(product: Product, scannedSizes: ScannedSizes | null, category: string): SizeRecommendation | null {
  if (!scannedSizes) return null
  return calculateDetailedRecommendation(scannedSizes, [], category, product.name, product.availableSizes ?? [])
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

  const effectiveCategory = detectEffectiveCategory(product.name, category)
  const isDeviceAccessory = effectiveCategory === 'accessories'
  const showSizeRecommendation = !isDeviceAccessory
  const recommendedSize = showSizeRecommendation ? getRecommendedSizeLabel(product, scannedSizes, category) : null
  const hasScanned = scannedSizes != null

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
          onPress={() => onToggleWishlist()}
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
            <Text style={cardStyles.sizeBadgeText}>מידה: {recommendedSize.pills.find(p => p.isPrimary)?.value ?? recommendedSize.size}</Text>
          </View>
        )}
        {!recommendedSize && showSizeRecommendation && !hasScanned && (
          <View style={cardStyles.sizeBadge}>
            <Text style={cardStyles.sizeBadgeText}>סרוק להמלצת מידה</Text>
          </View>
        )}
      </View>
      <View style={cardStyles.productInfo}>
        {showSizeRecommendation && recommendedSize && (
          <View style={cardStyles.matchChip}>
            <Text style={cardStyles.matchChipTitle}>✓ מתאים לך</Text>
            <View style={cardStyles.pillRow}>
              {recommendedSize.pills.map((pill: SizePill, idx: number) => (
                <View key={idx} style={[cardStyles.sizePill, pill.isPrimary && cardStyles.sizePillPrimary]}>
                  <Text style={cardStyles.sizePillRegion}>{pill.region}</Text>
                  <Text style={[cardStyles.sizePillValue, pill.isPrimary && cardStyles.sizePillValuePrimary]}>
                    {pill.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {showSizeRecommendation && !recommendedSize && !hasScanned && (
          <View style={cardStyles.matchChip}>
            <Text style={cardStyles.matchChipText}>
              סרוק להמלצת מידה
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
            activeOpacity={0.7}
            style={cardStyles.buyBtnAli}
            accessibilityRole="button"
            accessibilityLabel={`קניה: ${product.name}`}
          >
            <Text style={cardStyles.buyBtnIcon}>🛒</Text>
            <Text style={cardStyles.buyBtnText}>לקניה במחיר הטוב ביותר</Text>
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
  productCard: { width: '48%', backgroundColor: '#fff', borderRadius: 20, overflow: 'visible', minHeight: 390 },
  productImageWrap: { position: 'relative', height: 200, backgroundColor: '#F1F5F9', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  productImage: { width: '100%', height: '100%' },
  heartBtn: { position: 'absolute', top: 8, left: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  aiBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(11,20,55,0.85)', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiBadgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#2ED573' },
  aiBadgeText: { fontSize: 9, color: '#fff', fontWeight: '600' },
  productInfo: { padding: 10, paddingBottom: 14, minHeight: 190 },
  matchChip: { backgroundColor: '#F0FFF6', borderWidth: 1, borderColor: 'rgba(46,213,115,0.35)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6, marginBottom: 6, alignSelf: 'flex-start' },
  matchChipTitle: { fontSize: 8, fontWeight: '700', color: '#16A34A', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif", marginBottom: 3 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  sizePill: { backgroundColor: '#F8FAFC', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  sizePillPrimary: { backgroundColor: '#2E5BFF', borderColor: '#2E5BFF' },
  sizePillRegion: { fontSize: 7, fontWeight: '700', color: '#64748B', letterSpacing: 0.3 },
  sizePillValue: { fontSize: 9, fontWeight: '700', color: '#1E293B' },
  sizePillValuePrimary: { color: '#fff' },
  productName: { fontSize: 13, fontWeight: '600', color: '#1E293B', lineHeight: 17, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  productBrand: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  productPrice: { fontSize: 14, fontWeight: '700', color: '#2E5BFF' },
  productOriginalPrice: { fontSize: 12, color: '#94A3B8', textDecorationLine: 'line-through' },
  buyBtnRow: { flexDirection: 'row', gap: 6, marginTop: 10, minHeight: 38 },
  buyBtnAli: { flex: 1, minHeight: 44, backgroundColor: '#FF4747', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  buyBtnIcon: { fontSize: 14, marginBottom: 2 },
  buyBtnText: { color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  toast: { marginTop: 6, backgroundColor: '#0B1437', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 10, fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sizeBadge: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: '#2E5BFF', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  sizeBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  })
