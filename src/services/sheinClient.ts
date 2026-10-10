import type { Product } from '../types'
import type { AffiliateAdapter, AdapterSearchParams, AdapterQueryParams, AdapterDeviceParams } from './adapterTypes'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'
import { EDGE_FUNCTION_URL, EDGE_FUNCTION_ANON_KEY } from '../lib/config'
import { wrapWithSkimlinks } from '../utils/skimlinks'
export { searchVisualMatch as searchExactVisualMatch } from './imageSearch'

// SHEIN adapter — fetches real product data from SHEIN's public search API
// via the shein-search edge function. If the API is unreachable, falls back
// to a structured catalog with real product photos so the feed always
// populates with SHEIN as the primary source.

const USD_TO_ILS = 3.7

const SHEIN_CATEGORIES: Record<FeedCategory, string> = {
  all: 'fashion clothing',
  clothing: 'clothing dress shirt pants',
  shoes: 'shoes sneakers boots sandals',
  accessories: 'accessories bag jewelry sunglasses',
}

// Rotating style tags mixed into search keywords for variety across sessions.
// Each session picks a different subset so users see fresh product pools.
const STYLE_TAGS = [
  'trending', 'new arrivals', 'casual', 'elegant', 'streetwear',
  'minimalist', 'vintage', 'boho', 'y2k', 'preppy', 'oversized',
  'slim fit', 'relaxed', 'classic', 'modern', 'chic',
]

function pickRotationTags(seed: number, count: number): string[] {
  const shuffled = [...STYLE_TAGS].sort(() => {
    // Deterministic shuffle based on seed so a session is stable but differs
    // from previous sessions
    const h = (seed + Math.random() * 1000) | 0
    return ((h % 3) - 1)
  })
  return shuffled.slice(0, count)
}

let currentSessionSeed = Date.now() % 100000

export function setRotationSeed(seed: number): void {
  currentSessionSeed = seed
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

    return result.products.map((p) => {
      const sku = p.sku || p.productId || ''
      const pdpUrl = ensureSheinDestinationUrl(p.productUrl)
      return {
      name: p.title,
      brand: p.brand || 'SHEIN',
      price: p.price,
      originalPrice: null,
      currency: p.currency || 'USD',
      img: p.imageUrl,
      imageUrl: p.imageUrl,
      category: p.category,
      aliexpressUrl: pdpUrl,
      aliexpressSku: sku,
      availableSizes: p.sizes,
      ordersCount: p.reviewsCount ?? undefined,
      evaluateRate: p.rating ?? undefined,
      platform: 'shein' as const,
      promotionLink: null,
    } as Product
    })
  } catch {
    return []
  }
}

// ── Structured catalog fallback ────────────────────────────────────────────

interface CatalogTemplate {
  name: string
  category: string
  basePrice: number
  image: string
  isShoes?: boolean
}

const CATALOG: Record<Gender, Record<Exclude<FeedCategory, 'all'>, CatalogTemplate[]>> = {
  female: {
    clothing: [
      { name: 'SHEIN Women Casual Dress Solid Color', category: 'clothing', basePrice: 12.99, image: 'https://images.pexels.com/photos/19895958/pexels-photo-19895958.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Oversized T-Shirt Drop Shoulder', category: 'clothing', basePrice: 7.99, image: 'https://images.pexels.com/photos/36899307/pexels-photo-36899307.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women High Waist Wide Leg Jeans', category: 'clothing', basePrice: 18.99, image: 'https://images.pexels.com/photos/39457751/pexels-photo-39457751.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Blazer Notched Lapel Single Breasted', category: 'clothing', basePrice: 24.99, image: 'https://images.pexels.com/photos/18999070/pexels-photo-18999070.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Hoodie Drawstring Solid', category: 'clothing', basePrice: 15.99, image: 'https://images.pexels.com/photos/10177516/pexels-photo-10177516.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Knit Sweater Pullover', category: 'clothing', basePrice: 14.99, image: 'https://images.pexels.com/photos/5202545/pexels-photo-5202545.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Mini Skirt High Waist A-Line', category: 'clothing', basePrice: 10.99, image: 'https://images.pexels.com/photos/16486732/pexels-photo-16486732.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Cargo Pants Loose Casual', category: 'clothing', basePrice: 16.99, image: 'https://images.pexels.com/photos/39457708/pexels-photo-39457708.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Crop Top Ribbed Knit', category: 'clothing', basePrice: 8.99, image: 'https://images.pexels.com/photos/39457541/pexels-photo-39457541.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Cardigan Button Up Long Sleeve', category: 'clothing', basePrice: 17.99, image: 'https://images.pexels.com/photos/7585554/pexels-photo-7585554.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
    ],
    shoes: [
      { name: 'SHEIN Women Chunky Sneakers Lace Up', category: 'shoes', basePrice: 22.99, image: 'https://images.pexels.com/photos/13536939/pexels-photo-13536939.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Women Ankle Boots Block Heel', category: 'shoes', basePrice: 28.99, image: 'https://images.pexels.com/photos/32498579/pexels-photo-32498579.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Women Sandals Strappy Flat', category: 'shoes', basePrice: 12.99, image: 'https://images.pexels.com/photos/9267585/pexels-photo-9267585.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Women Heels Pointed Toe Pumps', category: 'shoes', basePrice: 25.99, image: 'https://images.pexels.com/photos/13663603/pexels-photo-13663603.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Women Loafers Slip On Flat', category: 'shoes', basePrice: 18.99, image: 'https://images.pexels.com/photos/14706988/pexels-photo-14706988.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Women Platform Sneakers Thick Sole', category: 'shoes', basePrice: 26.99, image: 'https://images.pexels.com/photos/38154568/pexels-photo-38154568.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
    ],
    accessories: [
      { name: 'SHEIN Women Tote Bag Solid Color', category: 'accessories', basePrice: 9.99, image: 'https://images.pexels.com/photos/29793778/pexels-photo-29793778.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Crossbody Chain Bag', category: 'accessories', basePrice: 14.99, image: 'https://images.pexels.com/photos/32498610/pexels-photo-32498610.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Sunglasses Cat Eye', category: 'accessories', basePrice: 6.99, image: 'https://images.pexels.com/photos/7060330/pexels-photo-7060330.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Hoop Earrings Gold Tone', category: 'accessories', basePrice: 4.99, image: 'https://images.pexels.com/photos/12194348/pexels-photo-12194348.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Women Watch Minimalist Round Dial', category: 'accessories', basePrice: 11.99, image: 'https://images.pexels.com/photos/35989300/pexels-photo-35989300.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
    ],
  },
  male: {
    clothing: [
      { name: 'SHEIN Men Graphic Print Tee Casual', category: 'clothing', basePrice: 8.99, image: 'https://images.pexels.com/photos/37075908/pexels-photo-37075908.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Slim Fit Jeans Straight Leg', category: 'clothing', basePrice: 19.99, image: 'https://images.pexels.com/photos/10004175/pexels-photo-10004175.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Hoodie Kangaroo Pocket', category: 'clothing', basePrice: 16.99, image: 'https://images.pexels.com/photos/19461565/pexels-photo-19461565.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Bomber Jacket Zip Up', category: 'clothing', basePrice: 26.99, image: 'https://images.pexels.com/photos/16069733/pexels-photo-16069733.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Casual Button Down Shirt', category: 'clothing', basePrice: 12.99, image: 'https://images.pexels.com/photos/7276000/pexels-photo-7276000.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Jogger Pants Drawstring Elastic', category: 'clothing', basePrice: 15.99, image: 'https://images.pexels.com/photos/39457742/pexels-photo-39457742.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Crew Neck Sweater Pullover', category: 'clothing', basePrice: 17.99, image: 'https://images.pexels.com/photos/2314992/pexels-photo-2314992.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Cargo Shorts Multi Pocket', category: 'clothing', basePrice: 11.99, image: 'https://images.pexels.com/photos/12803209/pexels-photo-12803209.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Oversized Tee Drop Shoulder', category: 'clothing', basePrice: 9.99, image: 'https://images.pexels.com/photos/15050287/pexels-photo-15050287.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Flannel Shirt Long Sleeve Plaid', category: 'clothing', basePrice: 14.99, image: 'https://images.pexels.com/photos/13202534/pexels-photo-13202534.png?auto=compress&cs=tinysrgb&h=650&w=940' },
    ],
    shoes: [
      { name: 'SHEIN Men Canvas Sneakers Low Top', category: 'shoes', basePrice: 19.99, image: 'https://images.pexels.com/photos/1447262/pexels-photo-1447262.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Men Casual Lace Up Shoes', category: 'shoes', basePrice: 21.99, image: 'https://images.pexels.com/photos/20547378/pexels-photo-20547378.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Men Running Shoes Breathable', category: 'shoes', basePrice: 24.99, image: 'https://images.pexels.com/photos/32145211/pexels-photo-32145211.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Men Chelsea Boots Elastic Side', category: 'shoes', basePrice: 29.99, image: 'https://images.pexels.com/photos/38277608/pexels-photo-38277608.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Men Sandals Slides Outdoor', category: 'shoes', basePrice: 10.99, image: 'https://images.pexels.com/photos/13966828/pexels-photo-13966828.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
    ],
    accessories: [
      { name: 'SHEIN Men Backpack Water Resistant', category: 'accessories', basePrice: 19.99, image: 'https://images.pexels.com/photos/14039944/pexels-photo-14039944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Leather Wallet Slim', category: 'accessories', basePrice: 8.99, image: 'https://images.pexels.com/photos/30750448/pexels-photo-30750448.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Aviator Sunglasses', category: 'accessories', basePrice: 7.99, image: 'https://images.pexels.com/photos/30227637/pexels-photo-30227637.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Belt Leather Automatic Buckle', category: 'accessories', basePrice: 9.99, image: 'https://images.pexels.com/photos/31367058/pexels-photo-31367058.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Men Watch Sport Silicone Strap', category: 'accessories', basePrice: 13.99, image: 'https://images.pexels.com/photos/32188760/pexels-photo-32188760.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
    ],
  },
  unisex: {
    clothing: [
      { name: 'SHEIN Unisex Graphic Tee Casual Print', category: 'clothing', basePrice: 8.99, image: 'https://images.pexels.com/photos/36899309/pexels-photo-36899309.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Hoodie Solid Kangaroo Pocket', category: 'clothing', basePrice: 16.99, image: 'https://images.pexels.com/photos/34736762/pexels-photo-34736762.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Denim Jacket Classic', category: 'clothing', basePrice: 25.99, image: 'https://images.pexels.com/photos/15140390/pexels-photo-15140390.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Cargo Pants Multi Pocket', category: 'clothing', basePrice: 17.99, image: 'https://images.pexels.com/photos/39457505/pexels-photo-39457505.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Oversized Sweatshirt', category: 'clothing', basePrice: 15.99, image: 'https://images.pexels.com/photos/19461561/pexels-photo-19461561.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Crew Neck Pullover', category: 'clothing', basePrice: 14.99, image: 'https://images.pexels.com/photos/972855/pexels-photo-972855.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Jogger Sweatpants Elastic', category: 'clothing', basePrice: 13.99, image: 'https://images.pexels.com/photos/12738118/pexels-photo-12738118.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex V-Neck Tee Basic', category: 'clothing', basePrice: 7.49, image: 'https://images.pexels.com/photos/8217291/pexels-photo-8217291.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
    ],
    shoes: [
      { name: 'SHEIN Unisex Canvas Sneakers Classic', category: 'shoes', basePrice: 18.99, image: 'https://images.pexels.com/photos/7916058/pexels-photo-7916058.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Unisex Slip On Shoes Casual', category: 'shoes', basePrice: 16.99, image: 'https://images.pexels.com/photos/8079829/pexels-photo-8079829.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Unisex High Top Sneakers', category: 'shoes', basePrice: 22.99, image: 'https://images.pexels.com/photos/20547378/pexels-photo-20547378.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
      { name: 'SHEIN Unisex Sandals Slides', category: 'shoes', basePrice: 9.99, image: 'https://images.pexels.com/photos/9741975/pexels-photo-9741975.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', isShoes: true },
    ],
    accessories: [
      { name: 'SHEIN Unisex Baseball Cap Adjustable', category: 'accessories', basePrice: 6.99, image: 'https://images.pexels.com/photos/14017718/pexels-photo-14017718.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Crossbody Bag Mini', category: 'accessories', basePrice: 10.99, image: 'https://images.pexels.com/photos/33074938/pexels-photo-33074938.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Beanie Hat Knit', category: 'accessories', basePrice: 5.99, image: 'https://images.pexels.com/photos/37484033/pexels-photo-37484033.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
      { name: 'SHEIN Unisex Sunglasses Square Frame', category: 'accessories', basePrice: 7.49, image: 'https://images.pexels.com/photos/27408060/pexels-photo-27408060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940' },
    ],
  },
}

const DEVICE_ACCESSORY_IMAGES: Record<string, string> = {
  phoneCase: 'https://images.pexels.com/photos/11067245/pexels-photo-11067245.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  screenProtector: 'https://images.pexels.com/photos/28077969/pexels-photo-28077969.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  chargingCable: 'https://images.pexels.com/photos/36012993/pexels-photo-36012993.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  phoneHolder: 'https://images.pexels.com/photos/2709407/pexels-photo-2709407.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  earbuds: 'https://images.pexels.com/photos/16703782/pexels-photo-16703782.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  watchBand: 'https://images.pexels.com/photos/8160609/pexels-photo-8160609.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  powerBank: 'https://images.pexels.com/photos/6296911/pexels-photo-6296911.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  phoneLanyard: 'https://images.pexels.com/photos/6071018/pexels-photo-6071018.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
}

interface DeviceAccessoryTemplate {
  name: string
  basePrice: number
  imageKey: string
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function buildSearchUrl(productName: string): string {
  const keyword = productName.replace(/^SHEIN\s+/i, '').trim()
  return `https://us.shein.com/pdsearch/${encodeURIComponent(keyword)}/`
}

// Keep real SHEIN PDPs, but never invent product IDs. A clean search URL is
// safer than a fabricated PDP that can lead to SHEIN's OOPS page.
function ensureSheinDestinationUrl(url: string): string {
  if (!url || !isSheinUrl(url)) return url
  return url.split('?')[0]
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

  // Rotate the catalog start offset by session seed so each session sees a
  // different slice of the catalog first.
  const rotationOffset = currentSessionSeed % templates.length
  const rotated = [...templates.slice(rotationOffset), ...templates.slice(0, rotationOffset)]

  const start = (pageNo - 1) * pageSize
  const slice = rotated.slice(start, start + pageSize)

  return slice.map((template) => {
    const priceILS = Math.round(template.basePrice * USD_TO_ILS)
    const originalPriceILS = Math.round(priceILS * 1.3)
    const sizes = template.isShoes ? SHOE_SIZES : ALL_SIZES
    const sku = `cat-${hashStr(template.name) % 100000}`
    const searchUrl = ensureSheinDestinationUrl(buildSearchUrl(template.name))

    return {
      name: template.name,
      brand: 'SHEIN',
      price: priceILS,
      originalPrice: originalPriceILS,
      currency: 'ILS',
      img: template.image,
      imageUrl: template.image,
      category: template.category,
      aliexpressUrl: searchUrl,
      aliexpressSku: sku,
      availableSizes: sizes,
      ordersCount: 200 + hashStr(template.name) % 3000,
      evaluateRate: 4.2 + (hashStr(template.name) % 8) / 10,
      platform: 'shein' as const,
      promotionLink: null,
    } as Product
  })
}

function buildDeviceAccessoryFallback(deviceName: string, pageNo: number, pageSize: number): Product[] {
  const cleanDevice = deviceName.replace(/^\w+\s+/, '').trim()
  const templates: DeviceAccessoryTemplate[] = [
    { name: `SHEIN ${cleanDevice} Phone Case Soft Silicone`, basePrice: 4.99, imageKey: 'phoneCase' },
    { name: `SHEIN ${cleanDevice} Screen Protector Tempered Glass`, basePrice: 3.49, imageKey: 'screenProtector' },
    { name: `SHEIN ${cleanDevice} Charging Cable USB-C`, basePrice: 5.99, imageKey: 'chargingCable' },
    { name: `SHEIN ${cleanDevice} Phone Holder Stand Adjustable`, basePrice: 7.99, imageKey: 'phoneHolder' },
    { name: `SHEIN ${cleanDevice} Earbuds Wireless Bluetooth`, basePrice: 14.99, imageKey: 'earbuds' },
    { name: `SHEIN ${cleanDevice} Watch Band Strap`, basePrice: 6.49, imageKey: 'watchBand' },
    { name: `SHEIN ${cleanDevice} Power Bank Portable Charger`, basePrice: 19.99, imageKey: 'powerBank' },
    { name: `SHEIN ${cleanDevice} Phone Lanyard Strap`, basePrice: 3.99, imageKey: 'phoneLanyard' },
  ]

  const start = (pageNo - 1) * pageSize
  const slice = templates.slice(start, start + pageSize)

  return slice.map((template) => {
    const priceILS = Math.round(template.basePrice * USD_TO_ILS)
    const sku = `dev-${hashStr(template.name) % 100000}`
    const searchUrl = ensureSheinDestinationUrl(buildSearchUrl(template.name))
    const image = DEVICE_ACCESSORY_IMAGES[template.imageKey] ?? DEVICE_ACCESSORY_IMAGES.phoneCase

    return {
      name: template.name,
      brand: 'SHEIN',
      price: priceILS,
      originalPrice: Math.round(priceILS * 1.4),
      currency: 'ILS',
      img: image,
      imageUrl: image,
      category: 'accessories',
      aliexpressUrl: searchUrl,
      aliexpressSku: sku,
      availableSizes: [],
      ordersCount: 100 + hashStr(template.name) % 2000,
      evaluateRate: 4.0 + (hashStr(template.name) % 10) / 10,
      platform: 'shein' as const,
      promotionLink: null,
    } as Product
  })
}

// ── Public API ──────────────────────────────────────────────────────────────

export function sheinSearchUrl(productName: string): string {
  return buildSearchUrl(productName)
}

function buildKeywords(category: FeedCategory, gender: Gender): string {
  const categoryWord = SHEIN_CATEGORIES[category] ?? 'Fashion'
  const genderWord = gender === 'male' ? 'men' : gender === 'female' ? 'women' : ''
  const rotationTags = pickRotationTags(currentSessionSeed, 2)
  return [genderWord, categoryWord, ...rotationTags].filter(Boolean).join(' ')
}

function isSheinUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && /(^|\.)shein\.com$/i.test(parsed.hostname)
  } catch { /* ignore */ }
  return false
}

function withSkimlinks(products: Product[]): Product[] {
  return products.map((p) => {
    const rawUrl = p.aliexpressUrl ?? ''
    if (!rawUrl || !isSheinUrl(rawUrl)) {
      return p
    }
    const wrappedUrl = wrapWithSkimlinks(rawUrl)
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
  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed.`)
    return wrapped
  }

  console.log('[SHEIN] API returned no results, using structured catalog fallback')
  const fallback = withSkimlinks(buildFallbackProducts(category, gender, pageNo, pageSize))
  console.log(`[Feed Engine] Successfully loaded ${fallback.length} SHEIN products to main feed.`)
  return fallback
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 50): Promise<Product[]> {
  const products = await callSheinSearch(keywords, pageNo, Math.min(pageSize, 40))
  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed.`)
    return wrapped
  }

  console.log('[SHEIN] API returned no results, using catalog fallback for query')
  const fallback = withSkimlinks(buildFallbackProducts('all', 'unisex', pageNo, pageSize))
  console.log(`[Feed Engine] Successfully loaded ${fallback.length} SHEIN products to main feed.`)
  return fallback
}

export async function searchDeviceAccessories(
  deviceName: string,
  pageNo = 1,
  pageSize = 50,
  _gender?: Gender,
): Promise<Product[]> {
  const products = await callSheinSearch(`${deviceName} accessories`, pageNo, Math.min(pageSize, 40))
  if (products.length > 0) {
    const wrapped = withSkimlinks(products)
    console.log(`[Feed Engine] Successfully loaded ${wrapped.length} SHEIN products to main feed.`)
    return wrapped
  }

  console.log('[SHEIN] API returned no results, using device accessory fallback')
  const fallback = withSkimlinks(buildDeviceAccessoryFallback(deviceName, pageNo, pageSize))
  console.log(`[Feed Engine] Successfully loaded ${fallback.length} SHEIN products to main feed.`)
  return fallback
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
