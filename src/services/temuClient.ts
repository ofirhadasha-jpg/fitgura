import type { Product } from '../types'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'

const TEMU_IMG = 'https://img.temucdn.com/pictures'

function uid(): string {
  return `temu-${Math.random().toString(36).slice(2, 10)}`
}

function temuProduct(partial: Partial<Product> & { name: string; price: number; category: string }): Product {
  return {
    brand: partial.brand ?? 'Temu',
    img: partial.img ?? `${TEMU_IMG}/400x400.jpeg`,
    currency: partial.currency ?? 'ILS',
    ordersCount: partial.ordersCount ?? Math.floor(Math.random() * 10000) + 2000,
    evaluateRate: partial.evaluateRate ?? Math.round((Math.random() * 0.8 + 4.2) * 100) / 100,
    volume: partial.volume ?? Math.floor(Math.random() * 15000) + 3000,
    platform: 'temu',
    ...partial,
  } as Product
}

const TEMU_CLOTHING_FEMALE: Product[] = [
  temuProduct({ name: 'Temu Women Solid Color Bodycon Dress', price: 59, originalPrice: 99, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/f1/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Loose Casual Jumpsuit', price: 65, originalPrice: 109, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/f2/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women V-Neck Long Sleeve Blouse', price: 45, originalPrice: 79, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/f3/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women High Waist Straight Jeans', price: 75, originalPrice: 119, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/f4/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Fleece-Lined Hooded Coat', price: 99, originalPrice: 159, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/f5/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Casual Two-Piece Tracksuit', price: 85, originalPrice: 129, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/f6/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Ribbed Tank Top', price: 35, originalPrice: 59, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/f7/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Wide Leg Cargo Pants', price: 69, originalPrice: 109, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/f8/400x400.jpeg` }),
]

const TEMU_CLOTHING_MALE: Product[] = [
  temuProduct({ name: 'Temu Men Quick-Dry Athletic T-Shirt', price: 39, originalPrice: 69, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/m1/400x400.jpeg` }),
  temuProduct({ name: 'Temu Men Stretch Denim Jeans Slim Fit', price: 69, originalPrice: 109, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/m2/400x400.jpeg` }),
  temuProduct({ name: 'Temu Men Polar Fleece Zip Hoodie', price: 59, originalPrice: 99, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/m3/400x400.jpeg` }),
  temuProduct({ name: 'Temu Men Water-Resistant Windbreaker Jacket', price: 89, originalPrice: 139, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/m4/400x400.jpeg` }),
  temuProduct({ name: 'Temu Men Casual Short Sleeve Button Shirt', price: 45, originalPrice: 75, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/m5/400x400.jpeg` }),
  temuProduct({ name: 'Temu Men Relaxed Fit Cargo Shorts', price: 49, originalPrice: 79, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${TEMU_IMG}/m6/400x400.jpeg` }),
]

const TEMU_SHOES_FEMALE: Product[] = [
  temuProduct({ name: 'Temu Women Platform Chunky Sneakers', price: 89, originalPrice: 139, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${TEMU_IMG}/fs1/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Slip-On Canvas Shoes', price: 49, originalPrice: 79, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${TEMU_IMG}/fs2/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Low-Top Canvas Sneakers', price: 59, originalPrice: 89, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${TEMU_IMG}/fs3/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Square Toe Sandals', price: 45, originalPrice: 69, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${TEMU_IMG}/fs4/400x400.jpeg` }),
  temuProduct({ name: 'Temu Women Comfort Walking Shoes', price: 69, originalPrice: 109, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${TEMU_IMG}/fs5/400x400.jpeg` }),
]

const TEMU_SHOES_MALE: Product[] = [
  temuProduct({ name: 'Temu Men Lightweight Running Shoes', price: 75, originalPrice: 119, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], img: `${TEMU_IMG}/ms1/400x400.jpeg` }),
  temuProduct({ name: 'Temu Men Breathable Mesh Sneakers', price: 65, originalPrice: 99, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], img: `${TEMU_IMG}/ms2/400x400.jpeg` }),
  temuProduct({ name: 'Temu Men Casual Slip-On Loafers', price: 55, originalPrice: 89, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], img: `${TEMU_IMG}/ms3/400x400.jpeg` }),
  temuProduct({ name: 'Temu Men Outdoor Hiking Trail Shoes', price: 99, originalPrice: 149, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], img: `${TEMU_IMG}/ms4/400x400.jpeg` }),
]

const TEMU_ACCESSORIES: Product[] = [
  temuProduct({ name: 'Temu Mini Crossbody Shoulder Bag', price: 39, originalPrice: 69, category: 'accessories', img: `${TEMU_IMG}/a1/400x400.jpeg` }),
  temuProduct({ name: 'Temu Polarized UV400 Sunglasses', price: 29, originalPrice: 49, category: 'accessories', img: `${TEMU_IMG}/a2/400x400.jpeg` }),
  temuProduct({ name: 'Temu Stainless Steel Watch Band', price: 35, originalPrice: 59, category: 'accessories', img: `${TEMU_IMG}/a3/400x400.jpeg` }),
  temuProduct({ name: 'Temu Cotton Canvas Belt Unisex', price: 25, originalPrice: 45, category: 'accessories', img: `${TEMU_IMG}/a4/400x400.jpeg` }),
  temuProduct({ name: 'Temu Quilted Coin Purse Card Holder', price: 19, originalPrice: 35, category: 'accessories', img: `${TEMU_IMG}/a5/400x400.jpeg` }),
  temuProduct({ name: 'Temu Foldable Sun Hat Wide Brim', price: 29, originalPrice: 49, category: 'accessories', img: `${TEMU_IMG}/a6/400x400.jpeg` }),
]

function pickPool(category: FeedCategory, gender: Gender): Product[] {
  if (category === 'clothing') return gender === 'male' ? TEMU_CLOTHING_MALE : TEMU_CLOTHING_FEMALE
  if (category === 'shoes') return gender === 'male' ? TEMU_SHOES_MALE : TEMU_SHOES_FEMALE
  if (category === 'accessories') return TEMU_ACCESSORIES
  const clothing = gender === 'male' ? TEMU_CLOTHING_MALE : TEMU_CLOTHING_FEMALE
  const shoes = gender === 'male' ? TEMU_SHOES_MALE : TEMU_SHOES_FEMALE
  return [...clothing, ...shoes, ...TEMU_ACCESSORIES]
}

function paginate<T>(items: T[], pageNo: number, pageSize: number): T[] {
  const start = (pageNo - 1) * pageSize
  return items.slice(start, start + pageSize)
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

export async function searchProductsByCategory(
  category: FeedCategory,
  gender: Gender,
  pageNo: number,
  _pageSize: number,
  _extraKeywords?: string,
  _ageGroup: AgeGroupFilter = 'adult',
): Promise<Product[]> {
  const pool = pickPool(category, gender)
  const shuffled = shuffle(pool)
  return paginate(shuffled, pageNo, 20).map((p) => ({ ...p, aliexpressSku: uid() }))
}

export async function searchProducts(keywords: string, pageNo = 1, pageSize = 20): Promise<Product[]> {
  const all = [...TEMU_CLOTHING_FEMALE, ...TEMU_CLOTHING_MALE, ...TEMU_SHOES_FEMALE, ...TEMU_SHOES_MALE, ...TEMU_ACCESSORIES]
  const filtered = all.filter((p) => p.name.toLowerCase().includes(keywords.toLowerCase()) || p.category.includes(keywords.toLowerCase()))
  return paginate(filtered.length > 0 ? filtered : shuffle(all), pageNo, pageSize).map((p) => ({ ...p, aliexpressSku: uid() }))
}

export async function searchDeviceAccessories(
  _deviceName: string,
  pageNo: number,
  _pageSize: number,
  _gender?: Gender,
): Promise<Product[]> {
  const pool = shuffle(TEMU_ACCESSORIES)
  return paginate(pool, pageNo, 6).map((p) => ({ ...p, aliexpressSku: uid() }))
}
