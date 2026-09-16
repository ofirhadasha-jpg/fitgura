import type { Product, AgeGroup } from '../types'
import type { Gender, FeedCategory, AgeGroupFilter } from './aliexpressClient'

const SHEIN_IMG = 'https://img.shein.com/is/image/shein'

function uid(): string {
  return `shein-${Math.random().toString(36).slice(2, 10)}`
}

function sheinProduct(partial: Partial<Product> & { name: string; price: number; category: string }): Product {
  return {
    brand: partial.brand ?? 'SHEIN',
    img: partial.img ?? `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70`,
    currency: partial.currency ?? 'ILS',
    ordersCount: partial.ordersCount ?? Math.floor(Math.random() * 5000) + 500,
    evaluateRate: partial.evaluateRate ?? Math.round((Math.random() * 1 + 4) * 100) / 100,
    volume: partial.volume ?? Math.floor(Math.random() * 8000) + 1000,
    platform: 'shein',
    ...partial,
  } as Product
}

const SHEIN_CLOTHING_FEMALE: Product[] = [
  sheinProduct({ name: 'SHEIN Women Casual Wrap Dress', price: 89, originalPrice: 149, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/1.jpg` }),
  sheinProduct({ name: 'SHEIN Women High Waist Wide Leg Jeans', price: 119, originalPrice: 179, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/2.jpg` }),
  sheinProduct({ name: 'SHEIN Women Oversized Knit Sweater', price: 79, originalPrice: 129, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/3.jpg` }),
  sheinProduct({ name: 'SHEIN Women Ribbed Crop Top & Skirt Set', price: 99, originalPrice: 159, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/4.jpg` }),
  sheinProduct({ name: 'SHEIN Women Tailored Blazer Jacket', price: 139, originalPrice: 199, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/5.jpg` }),
  sheinProduct({ name: 'SHEIN Women Floral Midi Dress', price: 109, originalPrice: 169, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/6.jpg` }),
  sheinProduct({ name: 'SHEIN Women Cargo Pants Loose Fit', price: 95, originalPrice: 145, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/7.jpg` }),
  sheinProduct({ name: 'SHEIN Women Hooded Sweatshirt Pullover', price: 69, originalPrice: 119, category: 'clothing', availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/8.jpg` }),
]

const SHEIN_CLOTHING_MALE: Product[] = [
  sheinProduct({ name: 'SHEIN Men Slim Fit Casual Shirt', price: 79, originalPrice: 129, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/m1.jpg` }),
  sheinProduct({ name: 'SHEIN Men Straight Leg Denim Jeans', price: 109, originalPrice: 159, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/m2.jpg` }),
  sheinProduct({ name: 'SHEIN Men Zip-Up Hoodie Sweatshirt', price: 89, originalPrice: 139, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/m3.jpg` }),
  sheinProduct({ name: 'SHEIN Men Lightweight Bomber Jacket', price: 129, originalPrice: 189, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/m4.jpg` }),
  sheinProduct({ name: 'SHEIN Men Crew Neck T-Shirt 3-Pack', price: 59, originalPrice: 99, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/m5.jpg` }),
  sheinProduct({ name: 'SHEIN Men Slim Fit Chino Pants', price: 95, originalPrice: 145, category: 'clothing', availableSizes: ['S', 'M', 'L', 'XL', 'XXL'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/m6.jpg` }),
]

const SHEIN_SHOES_FEMALE: Product[] = [
  sheinProduct({ name: 'SHEIN Women Chunky Platform Sneakers', price: 129, originalPrice: 189, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/s1.jpg` }),
  sheinProduct({ name: 'SHEIN Women Strappy High Heel Sandals', price: 99, originalPrice: 149, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/s2.jpg` }),
  sheinProduct({ name: 'SHEIN Women Ankle Boots with Block Heel', price: 149, originalPrice: 219, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/s3.jpg` }),
  sheinProduct({ name: 'SHEIN Women Slip-On Canvas Flats', price: 69, originalPrice: 109, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/s4.jpg` }),
  sheinProduct({ name: 'SHEIN Women Pointed Toe Loafers', price: 89, originalPrice: 139, category: 'shoes', availableSizes: ['36', '37', '38', '39', '40', '41'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/s5.jpg` }),
]

const SHEIN_SHOES_MALE: Product[] = [
  sheinProduct({ name: 'SHEIN Men Retro Running Sneakers', price: 119, originalPrice: 169, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/ms1.jpg` }),
  sheinProduct({ name: 'SHEIN Men Casual Lace-Up Shoes', price: 89, originalPrice: 139, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/ms2.jpg` }),
  sheinProduct({ name: 'SHEIN Men Leather Chelsea Boots', price: 159, originalPrice: 229, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/ms3.jpg` }),
  sheinProduct({ name: 'SHEIN Men Slip-On Canvas Shoes', price: 69, originalPrice: 109, category: 'shoes', availableSizes: ['40', '41', '42', '43', '44', '45'], img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/ms4.jpg` }),
]

const SHEIN_ACCESSORIES: Product[] = [
  sheinProduct({ name: 'SHEIN Crossbody Chain Shoulder Bag', price: 79, originalPrice: 119, category: 'accessories', img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/a1.jpg` }),
  sheinProduct({ name: 'SHEIN Wide Brim Straw Sun Hat', price: 49, originalPrice: 79, category: 'accessories', img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/a2.jpg` }),
  sheinProduct({ name: 'SHEIN Oversized Square Sunglasses', price: 39, originalPrice: 69, category: 'accessories', img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/a3.jpg` }),
  sheinProduct({ name: 'SHEIN Minimalist Gold-Tone Necklace Set', price: 45, originalPrice: 79, category: 'accessories', img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/a4.jpg` }),
  sheinProduct({ name: 'SHEIN Faux Leather Belt for Women', price: 35, originalPrice: 59, category: 'accessories', img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/a5.jpg` }),
  sheinProduct({ name: 'SHEIN Canvas Tote Bag with Pocket', price: 55, originalPrice: 89, category: 'accessories', img: `${SHEIN_IMG}?wid=400&hei=400&fmt=jpeg&qlt=70&src=/shein/products/2024/08/15/a6.jpg` }),
]

function pickPool(category: FeedCategory, gender: Gender): Product[] {
  if (category === 'clothing') return gender === 'male' ? SHEIN_CLOTHING_MALE : SHEIN_CLOTHING_FEMALE
  if (category === 'shoes') return gender === 'male' ? SHEIN_SHOES_MALE : SHEIN_SHOES_FEMALE
  if (category === 'accessories') return SHEIN_ACCESSORIES
  const clothing = gender === 'male' ? SHEIN_CLOTHING_MALE : SHEIN_CLOTHING_FEMALE
  const shoes = gender === 'male' ? SHEIN_SHOES_MALE : SHEIN_SHOES_FEMALE
  return [...clothing, ...shoes, ...SHEIN_ACCESSORIES]
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
  const all = [...SHEIN_CLOTHING_FEMALE, ...SHEIN_CLOTHING_MALE, ...SHEIN_SHOES_FEMALE, ...SHEIN_SHOES_MALE, ...SHEIN_ACCESSORIES]
  const filtered = all.filter((p) => p.name.toLowerCase().includes(keywords.toLowerCase()) || p.category.includes(keywords.toLowerCase()))
  return paginate(filtered.length > 0 ? filtered : shuffle(all), pageNo, pageSize).map((p) => ({ ...p, aliexpressSku: uid() }))
}

export async function searchDeviceAccessories(
  _deviceName: string,
  pageNo: number,
  _pageSize: number,
  _gender?: Gender,
): Promise<Product[]> {
  const pool = shuffle(SHEIN_ACCESSORIES)
  return paginate(pool, pageNo, 6).map((p) => ({ ...p, aliexpressSku: uid() }))
}
