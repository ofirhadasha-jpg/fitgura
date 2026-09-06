import type { Product } from '../types'
import type { Gender, FeedCategory } from '../services/aliexpressClient'

const MOCK_IMAGES = [
  'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=300&h=345&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1542272604-787c3835535d?w=300&h=345&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1551232864-3f0890e5801e?w=300&h=345&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=300&h=345&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1558105147-52d5063f1d2a?w=300&h=345&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=300&h=345&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1600185365926-3b7c5a3b00a8?w=300&h=345&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=300&h=345&fit=crop&auto=format',
]

const MOCK_CLOTHING = [
  { name: 'Casual Cotton T-Shirt Slim Fit', price: 45 },
  { name: 'Denim Jacket Classic Blue', price: 89 },
  { name: 'Slim Fit Chino Pants Stretch', price: 59 },
  { name: 'Oversized Hoodie Sweatshirt', price: 65 },
  { name: 'Knit Sweater Pullover Warm', price: 72 },
  { name: 'Casual Button Shirt Long Sleeve', price: 52 },
  { name: 'High Waist Jeans Slim Cut', price: 68 },
  { name: 'Cotton Shorts Summer Casual', price: 38 },
  { name: 'Blazer Suit Jacket Slim Fit', price: 120 },
  { name: 'Pajama Set Cotton Sleepwear', price: 42 },
  { name: 'Polo Shirt Classic Pique Cotton', price: 55 },
  { name: 'Tracksuit Set Athletic Casual', price: 78 },
]

const MOCK_SHOES = [
  { name: 'Running Sneakers Lightweight Breathable', price: 85 },
  { name: 'Casual Canvas Shoes Flat Comfort', price: 52 },
  { name: 'Leather Boots Ankle High Top', price: 110 },
  { name: 'Sport Sneakers Mesh Athletic', price: 72 },
  { name: 'Slip On Loafers Casual Comfort', price: 65 },
  { name: 'High Heels Pumps Elegant Party', price: 78 },
  { name: 'Sandals Summer Beach Flat', price: 42 },
  { name: 'Wedge Heels Platform Casual', price: 68 },
  { name: 'Slippers Indoor Comfort Soft', price: 35 },
  { name: 'Ankle Boots Chelsea Classic', price: 95 },
]

const MOCK_ACCESSORIES = [
  { name: 'Phone Case Cover Silicone Shockproof', price: 25 },
  { name: 'Screen Protector Tempered Glass Clear', price: 18 },
  { name: 'Charging Cable USB Fast Data', price: 22 },
  { name: 'Phone Holder Stand Desktop Adjustable', price: 30 },
  { name: 'Wireless Charger Pad Fast Charge', price: 45 },
  { name: 'Earbuds Case Protective Cover', price: 20 },
  { name: 'Phone Lanyard Strap Wristband', price: 15 },
  { name: 'Power Bank Portable Charger 10000mAh', price: 55 },
  { name: 'Car Phone Mount Holder Magnetic', price: 28 },
  { name: 'Phone Ring Holder Kickstand Metal', price: 12 },
]

function pickFrom<T>(arr: T[], offset: number, count: number): T[] {
  const result: T[] = []
  for (let i = 0; i < count; i++) {
    result.push(arr[(offset + i) % arr.length])
  }
  return result
}

export function generateMockProducts(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  pageSize: number,
  deviceKeywords?: string,
): Product[] {
  const prefix = gender === 'male' ? 'Men ' : gender === 'female' ? 'Women ' : ''
  const offset = (pageNo - 1) * 3

  let pool: { name: string; price: number }[]
  let cat: string

  if (category === 'shoes') {
    pool = MOCK_SHOES
    cat = 'shoes'
  } else if (category === 'accessories') {
    pool = MOCK_ACCESSORIES
    cat = 'accessories'
  } else if (category === 'clothing') {
    pool = MOCK_CLOTHING
    cat = 'clothing'
  } else {
    pool = [...MOCK_CLOTHING, ...MOCK_SHOES]
    cat = 'all'
  }

  const items = pickFrom(pool, offset, pageSize)

  return items.map((item, i) => {
    const sku = `mock-${cat}-${pageNo}-${i}`
    return {
      name: `${prefix}${item.name}`,
      brand: 'AliExpress',
      price: item.price,
      originalPrice: Math.round(item.price * 1.3),
      currency: '₪',
      img: MOCK_IMAGES[(offset + i) % MOCK_IMAGES.length],
      category: cat,
      aliexpressUrl: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(prefix + item.name)}`,
      aliexpressSku: sku,
      matchScore: 85 + ((offset + i) % 10),
      ordersCount: 500 + ((offset + i) * 37) % 3000,
      volume: 500 + ((offset + i) * 37) % 3000,
      evaluateRate: 0.9 + ((offset + i) % 10) / 100,
    }
  })
}
