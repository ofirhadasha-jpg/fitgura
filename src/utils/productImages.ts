// Maps search keywords to high-quality product images from Unsplash's CDN.
// These are stable, direct HTTPS URLs that render reliably in product cards.

const KEYWORD_IMAGE_MAP: Record<string, string[]> = {
  shirt: [
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&q=80',
    'https://images.unsplash.com/photo-1583743814966-8930f2a594d8?w=600&q=80',
    'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&q=80',
    'https://images.unsplash.com/photo-1620799140408-edc6dcb6d6bf?w=600&q=80',
    'https://images.unsplash.com/photo-1620012253295-c15cc3e8fb60?w=600&q=80',
  ],
  tshirt: [
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
    'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=600&q=80',
    'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=80',
    'https://images.unsplash.com/photo-1576871337632-b9a794572f47?w=600&q=80',
  ],
  dress: [
    'https://images.unsplash.com/photo-1595777456624-768f8d5e7a21?w=600&q=80',
    'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&q=80',
    'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=600&q=80',
  ],
  sweater: [
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&q=80',
    'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&q=80',
    'https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?w=600&q=80',
  ],
  hoodie: [
    'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&q=80',
    'https://images.unsplash.com/photo-1620799140408-edc6dcb6d6bf?w=600&q=80',
  ],
  jacket: [
    'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80',
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&q=80',
    'https://images.unsplash.com/photo-1591047139756-eef27053d233?w=600&q=80',
  ],
  coat: [
    'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=600&q=80',
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&q=80',
  ],
  pants: [
    'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&q=80',
    'https://images.unsplash.com/photo-1604176354204-9268377821c8?w=600&q=80',
    'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&q=80',
  ],
  jeans: [
    'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&q=80',
    'https://images.unsplash.com/photo-1604176354204-9268377821c8?w=600&q=80',
  ],
  shorts: [
    'https://images.unsplash.com/photo-1591047139756-eef27053d233?w=600&q=80',
    'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&q=80',
  ],
  skirt: [
    'https://images.unsplash.com/photo-1583496661160-fb5886a13d76?w=600&q=80',
    'https://images.unsplash.com/photo-1577900232427-18219f919669?w=600&q=80',
  ],
  shoes: [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80',
    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=80',
    'https://images.unsplash.com/photo-1600185365483-52d84491aefe?w=600&q=80',
  ],
  sneaker: [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80',
    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=80',
    'https://images.unsplash.com/photo-1606107557195-0e88a575d880?w=600&q=80',
    'https://images.unsplash.com/photo-1600269454813-9bd7cb3f3f66?w=600&q=80',
  ],
  boots: [
    'https://images.unsplash.com/photo-1605812860427-4024f4846d2d?w=600&q=80',
    'https://images.unsplash.com/photo-1551107696-a4b0c5c0d944?w=600&q=80',
  ],
  sandals: [
    'https://images.unsplash.com/photo-1603487742131-4160ec999306?w=600&q=80',
    'https://images.unsplash.com/photo-1564466809058-bf4114d55352?w=600&q=80',
  ],
  bag: [
    'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&q=80',
    'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80',
    'https://images.unsplash.com/photo-1591561954557-26941169b49e?w=600&q=80',
  ],
  sunglasses: [
    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&q=80',
    'https://images.unsplash.com/photo-1511499767150-a48a237f0087?w=600&q=80',
  ],
  necklace: [
    'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=600&q=80',
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  ],
  accessories: [
    'https://images.unsplash.com/photo-1611652022412-a942980b2748?w=600&q=80',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80',
  ],
  watch: [
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80',
    'https://images.unsplash.com/photo-1546868871-7041f2a55e0f?w=600&q=80',
  ],
  phone: [
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&q=80',
    'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=600&q=80',
  ],
  case: [
    'https://images.unsplash.com/photo-1601593346740-9d3e9e7f5d2b?w=600&q=80',
    'https://images.unsplash.com/photo-1601972602288-3be03c6e1c11?w=600&q=80',
  ],
  default: [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=80',
    'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&q=80',
    'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&q=80',
  ],
}

const KEYWORD_CATEGORIES: { keywords: string[]; category: string }[] = [
  { keywords: ['shirt', 'tshirt', 't-shirt', 'blouse', 'top'], category: 'shirt' },
  { keywords: ['dress', 'midi', 'floral'], category: 'dress' },
  { keywords: ['sweater', 'knit', 'pullover'], category: 'sweater' },
  { keywords: ['hoodie'], category: 'hoodie' },
  { keywords: ['jacket'], category: 'jacket' },
  { keywords: ['coat', 'parka'], category: 'coat' },
  { keywords: ['pants', 'trousers', 'cargo', 'jogger', 'legging'], category: 'pants' },
  { keywords: ['jeans', 'denim'], category: 'jeans' },
  { keywords: ['shorts'], category: 'shorts' },
  { keywords: ['skirt'], category: 'skirt' },
  { keywords: ['shoe', 'footwear'], category: 'shoes' },
  { keywords: ['sneaker'], category: 'sneaker' },
  { keywords: ['boot'], category: 'boots' },
  { keywords: ['sandal'], category: 'sandals' },
  { keywords: ['bag', 'crossbody', 'handbag'], category: 'bag' },
  { keywords: ['sunglass'], category: 'sunglasses' },
  { keywords: ['necklace', 'jewelr', 'ring'], category: 'necklace' },
  { keywords: ['accessor'], category: 'accessories' },
  { keywords: ['watch'], category: 'watch' },
  { keywords: ['phone', 'mobile', 'smartphone'], category: 'phone' },
  { keywords: ['case', 'cover', 'protector'], category: 'case' },
]

function resolveCategory(keywords: string): string {
  const lower = keywords.toLowerCase()
  for (const { keywords: kws, category } of KEYWORD_CATEGORIES) {
    if (kws.some((kw) => lower.includes(kw))) return category
  }
  return 'default'
}

export function getImageForKeyword(keywords: string, index: number): string {
  const category = resolveCategory(keywords)
  const images = KEYWORD_IMAGE_MAP[category] ?? KEYWORD_IMAGE_MAP.default
  return images[index % images.length]
}

export function getImagesForKeyword(keywords: string, count: number): string[] {
  const category = resolveCategory(keywords)
  const images = KEYWORD_IMAGE_MAP[category] ?? KEYWORD_IMAGE_MAP.default
  const result: string[] = []
  for (let i = 0; i < count; i++) {
    result.push(images[i % images.length])
  }
  return result
}
