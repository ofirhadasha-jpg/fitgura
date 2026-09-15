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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E0' }}>
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
              {recommendedSize.pills
                .filter((p: SizePill) => p.isPrimary)
                .map((pill: SizePill, idx: number) => (
                  <View key={idx} style={[cardStyles.sizePill, cardStyles.sizePillPrimary]}>
                    <Text style={cardStyles.sizePillRegion}>{pill.region}</Text>
                    <Text style={[cardStyles.sizePillValue, cardStyles.sizePillValuePrimary]}>
                      {pill.value}
                    </Text>
                  </View>
                ))
              }
              {recommendedSize.pills
                .filter((p: SizePill) => !p.isPrimary)
                .slice(0, 2)
                .map((pill: SizePill, idx: number) => (
                  <View key={idx} style={cardStyles.sizePill}>
                    <Text style={cardStyles.sizePillRegion}>{pill.region}</Text>
                    <Text style={cardStyles.sizePillValue}>{pill.value}</Text>
                  </View>
                ))
              }
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
  productCard: { width: '48%', backgroundColor: '#FFFEF5', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', overflow: 'visible', minHeight: 390, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  productImageWrap: { position: 'relative', height: 200, backgroundColor: '#F5F0E0', borderTopLeftRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', borderTopRightRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', overflow: 'hidden' } as React.CSSProperties,
  productImage: { width: '100%', height: '100%' },
  heartBtn: { position: 'absolute', top: 8, left: 8, width: 32, height: 32, borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', backgroundColor: '#FFFEF5', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' } as React.CSSProperties,
  aiBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: '#FFE566', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', paddingVertical: 3, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  aiBadgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#00FF66' },
  aiBadgeText: { fontSize: 9, color: '#1A1A1A', fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  productInfo: { padding: 10, paddingBottom: 14, minHeight: 190, flexShrink: 1 },
  matchChip: { backgroundColor: '#E0FFF0', borderWidth: 1.5, borderColor: '#00CC52', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', paddingVertical: 4, paddingHorizontal: 6, marginBottom: 6, alignSelf: 'flex-start' } as React.CSSProperties,
  matchChipTitle: { fontSize: 9, fontWeight: '700', color: '#00CC52', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Permanent Marker', cursive", marginBottom: 3 },
  matchChipText: { fontSize: 10, fontWeight: '700', color: '#00CC52', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  sizePill: { backgroundColor: '#FFFEF5', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', paddingVertical: 2, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#9A9A9A' } as React.CSSProperties,
  sizePillPrimary: { backgroundColor: '#FFE566', borderColor: '#1A1A1A' },
  sizePillRegion: { fontSize: 8, fontWeight: '700', color: '#4A4A4A', letterSpacing: 0.3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizePillValue: { fontSize: 10, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sizePillValuePrimary: { color: '#1A1A1A' },
  productName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', lineHeight: 18, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  productBrand: { fontSize: 12, color: '#9A9A9A', marginTop: 2, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  productPrice: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  productOriginalPrice: { fontSize: 13, color: '#9A9A9A', textDecorationLine: 'line-through', fontFamily: "'Permanent Marker', cursive" },
  buyBtnRow: { flexDirection: 'row', gap: 6, marginTop: 10, minHeight: 38 },
  buyBtnAli: { flex: 1, minHeight: 44, backgroundColor: '#00FF66', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' } as React.CSSProperties,
  buyBtnIcon: { fontSize: 14, marginBottom: 2 },
  buyBtnText: { color: '#1A1A1A', fontSize: 12, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  toast: { marginTop: 6, backgroundColor: '#1A1A1A', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' } as React.CSSProperties,
  toastText: { color: '#FFFEF5', fontSize: 11, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sizeBadge: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: '#FFE566', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1.5, borderColor: '#1A1A1A' } as React.CSSProperties,
  sizeBadgeText: { fontSize: 10, fontWeight: '700', color: '#1A1A1A', textAlign: 'right', writingDirection: 'rtl', fontFamily: "'Permanent Marker', cursive" },
  })
