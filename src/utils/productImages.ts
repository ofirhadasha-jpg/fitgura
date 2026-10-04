// Shared product image utilities — ensures the modal and feed cards never
// show a cardboard box placeholder. When a product's own image URL is missing
// or fails to load, a category-matched high-resolution fashion photo is used.

const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  shirts:     'https://images.pexels.com/photos/14564843/pexels-photo-14564843.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  tops:       'https://images.pexels.com/photos/14564843/pexels-photo-14564843.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  clothing:   'https://images.pexels.com/photos/14564843/pexels-photo-14564843.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  all:        'https://images.pexels.com/photos/14564843/pexels-photo-14564843.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  pants:      'https://images.pexels.com/photos/6439226/pexels-photo-6439226.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  jeans:      'https://images.pexels.com/photos/6439226/pexels-photo-6439226.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  bottoms:    'https://images.pexels.com/photos/6439226/pexels-photo-6439226.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  shoes:      'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  sneakers:   'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  footwear:   'https://images.pexels.com/photos/27516985/pexels-photo-27516985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  dresses:    'https://images.pexels.com/photos/39873869/pexels-photo-39873869.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  dress:      'https://images.pexels.com/photos/39873869/pexels-photo-39873869.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  jackets:    'https://images.pexels.com/photos/4398944/pexels-photo-4398944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  outerwear:  'https://images.pexels.com/photos/4398944/pexels-photo-4398944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  coats:      'https://images.pexels.com/photos/4398944/pexels-photo-4398944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  accessories:'https://images.pexels.com/photos/19869755/pexels-photo-19869755.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
}

export function normalizeProductImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  const value = imageUrl.trim()
  if (!value) return null
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('http://')) return value.replace('http://', 'https://')
  if (value.startsWith('https://')) return value
  return null
}

export function getFallbackImage(category: string, productName: string): string {
  const cat = category.toLowerCase().trim()
  if (CATEGORY_FALLBACK_IMAGES[cat]) return CATEGORY_FALLBACK_IMAGES[cat]
  const name = productName.toLowerCase()
  if (/\b(shirt|tshirt|tee|top|blouse)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.tops
  if (/\b(pant|jean|trouser|short)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.pants
  if (/\b(shoe|sneaker|boot|sandal|heel)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.shoes
  if (/\b(dress|gown|skirt)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.dresses
  if (/\b(jacket|coat|blazer|parka|windbreaker)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.jackets
  if (/\b(bag|purse|wallet|belt|hat|cap|scarf|glasses|watch|jewelr)\b/.test(name)) return CATEGORY_FALLBACK_IMAGES.accessories
  return CATEGORY_FALLBACK_IMAGES.tops
}

// Returns the best available image URL: the product's own image if valid,
// otherwise a category-matched fallback. Never returns null.
export function resolveProductImage(img: string | null | undefined, category: string, productName: string): string {
  return normalizeProductImageUrl(img) ?? getFallbackImage(category, productName)
}
