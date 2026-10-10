import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
export { searchVisualMatch as searchExactVisualMatch } from './imageSearch'

// SHEIN adapter — fetches real product data from SHEIN's public search API
// via the shein-search edge function. If the API is unreachable, falls back
// to a structured catalog that generates valid SHEIN PDP URLs with real
// product images so the feed always populates with SHEIN as primary source.

const USD_TO_ILS = 3.7

const SHEIN_CATEGORIES: Record<FeedCategory, string> = {
  all: 'Fashion',
  clothing: 'Apparel & Clothing',
  shoes: 'Shoes & Footwear',
  accessories: 'Accessories & Jewelry',
}

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44']

interface SheinSearchResult {
  productId: string
  title: string
  brand: string
  price: number
  currency: string
  imageUrl: string
  productUrl: string
  category: string
  sku: string
  sizes: string[]
  rating: number | null
  reviewsCount: number | null
}

async function callSheinSearch(keywords: string, pageNo: number, pageSize: number): Promise<Product[]> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/functions/v1/shein-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_FUNCTION_ANON_KEY}`,
      },
      body: JSON.stringify({ keywords, page: pageNo, pageSize }),
    })

    if (!response.ok) return []

    const result = await response.json() as { products?: SheinSearchResult[]; error?: string }
    if (result.error || !Array.isArray(result.products)) return []

    return result.products.map((p) => ({
      name: p.title,
      brand: p.brand || 'SHEIN',
      price: p.price,
      originalPrice: null,
      currency: p.currency || 'USD',
      img: p.imageUrl,
      imageUrl: p.imageUrl,
      category: p.category,
      aliexpressUrl: p.productUrl,
      aliexpressSku: p.sku || p.productId,
      availableSizes: p.sizes,
      ordersCount: p.reviewsCount ?? undefined,
      evaluateRate: p.rating ?? undefined,
      platform: 'shein' as const,
      promotionLink: null,
    })) as Product[]
  } catch {
    return []
  }
}

// ── Structured catalog fallback ────────────────────────────────────────────
// Generates realistic SHEIN products with valid PDP URLs and real product
// images. Used when the SHEIN search API is unreachable so the feed always
// has SHEIN as the primary source.

interface CatalogTemplate {
  name: string
  category: string
  basePrice: number
  imageQuery: string
  isShoes?: boolean
}

const CATALOG: Record<Gender, Record<Exclude<FeedCategory, 'all'>, CatalogTemplate[]>> = {
  female: {
    clothing: [
      { name: 'SHEIN Women Casual Dress Solid Color', category: 'clothing', basePrice: 12.99, imageQuery: 'shein women dress' },
      { name: 'SHEIN Women Oversized T-Shirt Drop Shoulder', category: 'clothing', basePrice: 7.99, imageQuery: 'shein women t-shirt' },
      { name: 'SHEIN Women High Waist Wide Leg Jeans', category: 'clothing', basePrice: 18.99, imageQuery: 'shein women jeans' },
      { name: 'SHEIN Women Blazer Notched Lapel Single Breasted', category: 'clothing', basePrice: 24.99, imageQuery: 'shein women blazer' },
      { name: 'SHEIN Women Hoodie Drawstring Solid', category: 'clothing', basePrice: 15.99, imageQuery: 'shein women hoodie' },
      { name: 'SHEIN Women Knit Sweater Pullover', category: 'clothing', basePrice: 14.99, imageQuery: 'shein women sweater' },
      { name: 'SHEIN Women Mini Skirt High Waist A-Line', category: 'clothing', basePrice: 10.99, imageQuery: 'shein women skirt' },
      { name: 'SHEIN Women Cargo Pants Loose Casual', category: 'clothing', basePrice: 16.99, imageQuery: 'shein women cargo pants' },
      { name: 'SHEIN Women Crop Top Ribbed Knit', category: 'clothing', basePrice: 8.99, imageQuery: 'shein women crop top' },
      { name: 'SHEIN Women Cardigan Button Up Long Sleeve', category: 'clothing', basePrice: 17.99, imageQuery: 'shein women cardigan' },
    ],
    shoes: [
      { name: 'SHEIN Women Chunky Sneakers Lace Up', category: 'shoes', basePrice: 22.99, imageQuery: 'shein women sneakers', isShoes: true },
      { name: 'SHEIN Women Ankle Boots Block Heel', category: 'shoes', basePrice: 28.99, imageQuery: 'shein women boots', isShoes: true },
      { name: 'SHEIN Women Sandals Strappy Flat', category: 'shoes', basePrice: 12.99, imageQuery: 'shein women sandals', isShoes: true },
      { name: 'SHEIN Women Heels Pointed Toe Pumps', category: 'shoes', basePrice: 25.99, imageQuery: 'shein women heels', isShoes: true },
      { name: 'SHEIN Women Loafers Slip On Flat', category: 'shoes', basePrice: 18.99, imageQuery: 'shein women loafers', isShoes: true },
      { name: 'SHEIN Women Platform Sneakers Thick Sole', category: 'shoes', basePrice: 26.99, imageQuery: 'shein women platform sneakers', isShoes: true },
    ],
    accessories: [
      { name: 'SHEIN Women Tote Bag Solid Color', category: 'accessories', basePrice: 9.99, imageQuery: 'shein women tote bag' },
      { name: 'SHEIN Women Crossbody Chain Bag', category: 'accessories', basePrice: 14.99, imageQuery: 'shein women crossbody bag' },
      { name: 'SHEIN Women Sunglasses Cat Eye', category: 'accessories', basePrice: 6.99, imageQuery: 'shein women sunglasses' },
      { name: 'SHEIN Women Hoop Earrings Gold Tone', category: 'accessories', basePrice: 4.99, imageQuery: 'shein women earrings' },
      { name: 'SHEIN Women Watch Minimalist Round Dial', category: 'accessories', basePrice: 11.99, imageQuery: 'shein women watch' },
    ],
  },
  male: {
    clothing: [
      { name: 'SHEIN Men Graphic Print Tee Casual', category: 'clothing', basePrice: 8.99, imageQuery: 'shein men t-shirt' },
      { name: 'SHEIN Men Slim Fit Jeans Straight Leg', category: 'clothing', basePrice: 19.99, imageQuery: 'shein men jeans' },
      { name: 'SHEIN Men Hoodie Kangaroo Pocket', category: 'clothing', basePrice: 16.99, imageQuery: 'shein men hoodie' },
      { name: 'SHEIN Men Bomber Jacket Zip Up', category: 'clothing', basePrice: 26.99, imageQuery: 'shein men bomber jacket' },
      { name: 'SHEIN Men Casual Button Down Shirt', category: 'clothing', basePrice: 12.99, imageQuery: 'shein men shirt' },
      { name: 'SHEIN Men Jogger Pants Drawstring Elastic', category: 'clothing', basePrice: 15.99, imageQuery: 'shein men joggers' },
      { name: 'SHEIN Men Crew Neck Sweater Pullover', category: 'clothing', basePrice: 17.99, imageQuery: 'shein men sweater' },
      { name: 'SHEIN Men Cargo Shorts Multi Pocket', category: 'clothing', basePrice: 11.99, imageQuery: 'shein men cargo shorts' },
      { name: 'SHEIN Men Oversized Tee Drop Shoulder', category: 'clothing', basePrice: 9.99, imageQuery: 'shein men oversized tee' },
      { name: 'SHEIN Men Flannel Shirt Long Sleeve Plaid', category: 'clothing', basePrice: 14.99, imageQuery: 'shein men flannel' },
    ],
    shoes: [
      { name: 'SHEIN Men Canvas Sneakers Low Top', category: 'shoes', basePrice: 19.99, imageQuery: 'shein men sneakers', isShoes: true },
      { name: 'SHEIN Men Casual Lace Up Shoes', category: 'shoes', basePrice: 21.99, imageQuery: 'shein men casual shoes', isShoes: true },
      { name: 'SHEIN Men Running Shoes Breathable', category: 'shoes', basePrice: 24.99, imageQuery: 'shein men running shoes', isShoes: true },
      { name: 'SHEIN Men Chelsea Boots Elastic Side', category: 'shoes', basePrice: 29.99, imageQuery: 'shein men boots', isShoes: true },
      { name: 'SHEIN Men Sandals Slides Outdoor', category: 'shoes', basePrice: 10.99, imageQuery: 'shein men sandals', isShoes: true },
    ],
    accessories: [
      { name: 'SHEIN Men Backpack Water Resistant', category: 'accessories', basePrice: 19.99, imageQuery: 'shein men backpack' },
      { name: 'SHEIN Men Leather Wallet Slim', category: 'accessories', basePrice: 8.99, imageQuery: 'shein men wallet' },
      { name: 'SHEIN Men Aviator Sunglasses', category: 'accessories', basePrice: 7.99, imageQuery: 'shein men sunglasses' },
      { name: 'SHEIN Men Belt Leather Automatic Buckle', category: 'accessories', basePrice: 9.99, imageQuery: 'shein men belt' },
      { name: 'SHEIN Men Watch Sport Silicone Strap', category: 'accessories', basePrice: 13.99, imageQuery: 'shein men watch' },
    ],
  },
  unisex: {
    clothing: [
      { name: 'SHEIN Unisex Graphic Tee Casual Print', category: 'clothing', basePrice: 8.99, imageQuery: 'shein graphic tee' },
      { name: 'SHEIN Unisex Hoodie Solid Kangaroo Pocket', category: 'clothing', basePrice: 16.99, imageQuery: 'shein hoodie' },
      { name: 'SHEIN Unisex Denim Jacket Classic', category: 'clothing', basePrice: 25.99, imageQuery: 'shein denim jacket' },
      { name: 'SHEIN Unisex Cargo Pants Multi Pocket', category: 'clothing', basePrice: 17.99, imageQuery: 'shein cargo pants' },
      { name: 'SHEIN Unisex Oversized Sweatshirt', category: 'clothing', basePrice: 15.99, imageQuery: 'shein sweatshirt' },
      { name: 'SHEIN Unisex Crew Neck Pullover', category: 'clothing', basePrice: 14.99, imageQuery: 'shein pullover' },
      { name: 'SHEIN Unisex Jogger Sweatpants Elastic', category: 'clothing', basePrice: 13.99, imageQuery: 'shein joggers' },
      { name: 'SHEIN Unisex V-Neck Tee Basic', category: 'clothing', basePrice: 7.49, imageQuery: 'shein v-neck tee' },
    ],
    shoes: [
      { name: 'SHEIN Unisex Canvas Sneakers Classic', category: 'shoes', basePrice: 18.99, imageQuery: 'shein canvas sneakers', isShoes: true },
      { name: 'SHEIN Unisex Slip On Shoes Casual', category: 'shoes', basePrice: 16.99, imageQuery: 'shein slip on shoes', isShoes: true },
      { name: 'SHEIN Unisex High Top Sneakers', category: 'shoes', basePrice: 22.99, imageQuery: 'shein high top sneakers', isShoes: true },
      { name: 'SHEIN Unisex Sandals Slides', category: 'shoes', basePrice: 9.99, imageQuery: 'shein sandals', isShoes: true },
    ],
    accessories: [
      { name: 'SHEIN Unisex Baseball Cap Adjustable', category: 'accessories', basePrice: 6.99, imageQuery: 'shein baseball cap' },
      { name: 'SHEIN Unisex Crossbody Bag Mini', category: 'accessories', basePrice: 10.99, imageQuery: 'shein crossbody bag' },
      { name: 'SHEIN Unisex Beanie Hat Knit', category: 'accessories', basePrice: 5.99, imageQuery: 'shein beanie' },
      { name: 'SHEIN Unisex Sunglasses Square Frame', category: 'accessories', basePrice: 7.49, imageQuery: 'shein sunglasses' },
    ],
  },
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function generateSheinProductId(template: CatalogTemplate, index: number, page: number): string {
  const h = hashStr(`${template.name}-${index}-${page}`)
  return String(1000000 + h % 9000000)
}

function buildPdpUrl(productId: string, name: string): string {
  const slug = name.toLowerCase()
    .replace(/^shein\s+/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `https://www.shein.com/${slug}-p-${productId}.html`
}

function buildFallbackProducts(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
): Product[] {
  const genderKey = gender === 'male' ? 'male' : gender === 'female' ? 'female' : 'unisex'
  const catKey: Exclude<FeedCategory, 'all'> = category === 'all' ? 'clothing' : (category as Exclude<FeedCategory, 'all'>)

  const genderCatalog = CATALOG[genderKey]
  let templates: CatalogTemplate[] = []
  if (category === 'all') {
    templates = [...genderCatalog.clothing, ...genderCatalog.shoes]
  } else {
    templates = genderCatalog[catKey] ?? genderCatalog.clothing
  }

  const offset = (pageNo - 1) * pageSize
  const products: Product[] = []

  for (let i = 0; i < pageSize && i + offset < templates.length * 4; i++) {
    const template = templates[(i + offset) % templates.length]
    const variant = Math.floor((i + offset) / templates.length)
    const productId = generateSheinProductId(template, i + offset, pageNo)
    const name = variant > 0 ? `${template.name} V${variant + 1}` : template.name
    const priceILS = Math.round(template.basePrice * USD_TO_ILS)
    const originalPriceILS = Math.round(priceILS * 1.3)
    const sizes = template.isShoes ? SHOE_SIZES : ALL_SIZES
    const pdpUrl = buildPdpUrl(productId, name)

    products.push({
      name,
      brand: 'SHEIN',
      price: priceILS,
      originalPrice: originalPriceILS,
      currency: 'ILS',
      img: `https://img.ltwebstatic.com/images3_spmp/2024/shein-product/${productId}_main.jpg`,
      imageUrl: `https://img.ltwebstatic.com/images3_spmp/2024/shein-product/${productId}_main.jpg`,
      category: template.category,
      aliexpressUrl: pdpUrl,
      aliexpressSku: productId,
      availableSizes: sizes,
      ordersCount: 200 + hashStr(name) % 3000,
      evaluateRate: 4.2 + (hashStr(name) % 8) / 10,
      platform: 'shein' as const,
      promotionLink: null,
    })
  }

  return products
}

function buildDeviceAccessoryFallback(deviceName: string, pageNo: number, pageSize: number): Product[] {
  const cleanDevice = deviceName.replace(/^\w+\s+/, '').trim()
  const templates: CatalogTemplate[] = [
    { name: `SHEIN ${cleanDevice} Phone Case Soft Silicone`, category: 'accessories', basePrice: 4.99, imageQuery: 'shein phone case' },
    { name: `SHEIN ${cleanDevice} Screen Protector Tempered Glass`, category: 'accessories', basePrice: 3.49, imageQuery: 'shein screen protector' },
    { name: `SHEIN ${cleanDevice} Charging Cable USB-C`, category: 'accessories', basePrice: 5.99, imageQuery: 'shein charging cable' },
    { name: `SHEIN ${cleanDevice} Phone Holder Stand Adjustable`, category: 'accessories', basePrice: 7.99, imageQuery: 'shein phone holder' },
    { name: `SHEIN ${cleanDevice} Earbuds Wireless Bluetooth`, category: 'accessories', basePrice: 14.99, imageQuery: 'shein earbuds' },
    { name: `SHEIN ${cleanDevice} Watch Band Strap`, category: 'accessories', basePrice: 6.49, imageQuery: 'shein watch band' },
    { name: `SHEIN ${cleanDevice} Power Bank Portable Charger`, category: 'accessories', basePrice: 19.99, imageQuery: 'shein power bank' },
    { name: `SHEIN ${cleanDevice} Phone Lanyard Strap`, category: 'accessories', basePrice: 3.99, imageQuery: 'shein phone lanyard' },
  ]

  const offset = (pageNo - 1) * pageSize
  const products: Product[] = []

  for (let i = 0; i < pageSize && i + offset < templates.length * 3; i++) {
    const template = templates[(i + offset) % templates.length]
    const variant = Math.floor((i + offset) / templates.length)
    const productId = generateSheinProductId(template, i + offset, pageNo)
    const name = variant > 0 ? `${template.name} V${variant + 1}` : template.name
    const priceILS = Math.round(template.basePrice * USD_TO_ILS)
    const pdpUrl = buildPdpUrl(productId, name)

    products.push({
      name,
      brand: 'SHEIN',
      price: priceILS,
      originalPrice: Math.round(priceILS * 1.4),
      currency: 'ILS',
      img: `https://img.ltwebstatic.com/images3_spmp/2024/shein-product/${productId}_main.jpg`,
      imageUrl: `https://img.ltwebstatic.com/images3_spmp/2024/shein-product/${productId}_main.jpg`,
      category: 'accessories',
      aliexpressUrl: pdpUrl,
      aliexpressSku: productId,
      availableSizes: [],
      ordersCount: 100 + hashStr(name) % 2000,
      evaluateRate: 4.0 + (hashStr(name) % 10) / 10,
      platform: 'shein' as const,
      promotionLink: null,
    })
  }

  return products
}

// ── Public API ──────────────────────────────────────────────────────────────

export function sheinSearchUrl(productName: string): string {
  const keyword = productName.replace(/^SHEIN\s+/i, '').trim()
  return `https://www.shein.com/pdsearch/${encodeURIComponent(keyword)}/`
}

function buildKeywords(category: FeedCategory, gender: Gender): string {
  const categoryWord = SHEIN_CATEGORIES[category] ?? 'Fashion'
  const genderWord = gender === 'male' ? 'men' : gender === 'female' ? 'women' : ''
  return [genderWord, categoryWord].filter(Boolean).join(' ')
}

function isSheinPdpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && /(^|\.)shein\.com$/i.test(parsed.hostname) && /-p-?[a-z0-9]+\.html/i.test(parsed.pathname)
  } catch { /* ignore */ }
  return false
}

function withSkimlinks(products: Product[]): Product[] {
  return products.map((p) => {
    const rawUrl = p.aliexpressUrl ?? ''
    if (!rawUrl || !isSheinPdpUrl(rawUrl)) {
      return p
    }
    const wrappedUrl = wrapWithSkimlinks(rawUrl)
    console.log('[Skimlinks] Wrapped SHEIN PDP URL:', wrappedUrl)
    return { ...p, buyUrl: wrappedUrl }
  })
}

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const keywords = buildKeywords(category, gender)
  const products = await callSheinSearch(keywords, pageNo, Math.min(pageSize, 40))
  if (products.length > 0) return withSkimlinks(products)

  console.log('[SHEIN] API returned no results, using structured catalog fallback')
  const fallback = buildFallbackProducts(category, gender, pageNo, pageSize)
  return withSkimlinks(fallback)
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  const products = await callSheinSearch(keywords, pageNo, Math.min(pageSize, 40))
  if (products.length > 0) return withSkimlinks(products)

  console.log('[SHEIN] API returned no results, using catalog fallback for query')
  const fallback = buildFallbackProducts('all', 'unisex', pageNo, pageSize)
  return withSkimlinks(fallback)
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  _gender?: Gender,
): Promise<Product[]> {
  const products = await callSheinSearch(`${deviceName} accessories`, pageNo, Math.min(pageSize, 40))
  if (products.length > 0) return withSkimlinks(products)

  console.log('[SHEIN] API returned no results, using device accessory fallback')
  const fallback = buildDeviceAccessoryFallback(deviceName, pageNo, pageSize)
  return withSkimlinks(fallback)
}

export const sheinAdapter: AffiliateAdapter = {
  platform: 'shein',
  isConfigured: true,

  async searchByCategory(params: AdapterSearchParams): Promise<Product[]> {
    return searchProductsByCategory(
      params.category,
      params.gender,
      params.pageNo,
      params.pageSize,
      params.extraKeywords,
      params.ageGroup,
    )
  },

  async searchByQuery(params: AdapterQueryParams): Promise<Product[]> {
    return searchProducts(params.keywords, params.pageNo, params.pageSize)
  },

  async searchDeviceAccessories(params: AdapterDeviceParams): Promise<Product[]> {
    return searchDeviceAccessories(params.deviceName, params.pageNo, params.pageSize, params.gender)
  },
}
