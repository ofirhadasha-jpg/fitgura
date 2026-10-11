import type { Gender } from './aliexpressClient'
import type { AgeGroup } from '../types'

export type Demographic = 'baby' | 'kids' | 'girls' | 'boys' | 'women' | 'men'

export function ageGroupToDemographic(ageGroup: AgeGroup, gender: Gender): Demographic {
  if (ageGroup === 'baby' || ageGroup === 'toddler') return 'baby'
  if (ageGroup === 'child') return gender === 'male' ? 'boys' : gender === 'female' ? 'girls' : 'kids'
  if (ageGroup === 'teen') return gender === 'male' ? 'boys' : gender === 'female' ? 'girls' : 'kids'
  return gender === 'male' ? 'men' : gender === 'female' ? 'women' : 'women'
}

const DEMOGRAPHIC_ANCHOR: Record<Demographic, string> = {
  baby: 'baby clothing',
  kids: 'kids clothes',
  girls: 'girls clothes',
  boys: 'boys clothes',
  women: 'women fashion',
  men: 'men clothing',
}

const DEMOGRAPHIC_CATEGORY_ANCHOR: Record<Demographic, Record<string, string>> = {
  baby: { clothing: 'baby clothes', shoes: 'baby shoes', accessories: 'baby accessories', all: 'baby clothing' },
  kids: { clothing: 'kids clothes', shoes: 'kids shoes', accessories: 'kids accessories', all: 'kids clothing' },
  girls: { clothing: 'girls clothes', shoes: 'girls shoes', accessories: 'girls accessories', all: 'girls clothing' },
  boys: { clothing: 'boys clothes', shoes: 'boys shoes', accessories: 'boys accessories', all: 'boys clothing' },
  women: { clothing: 'women clothing', shoes: 'women shoes', accessories: 'women accessories', all: 'women fashion' },
  men: { clothing: 'men clothing', shoes: 'men shoes', accessories: 'men accessories', all: 'men fashion' },
}

const FALLBACK_CHAIN: Record<Demographic, string[]> = {
  baby: ['baby clothes', 'baby clothing', 'kids fashion'],
  kids: ['kids clothes', 'kids clothing', 'kids fashion'],
  girls: ['girls clothes', 'girls dress', 'kids fashion'],
  boys: ['boys clothes', 'boys clothing', 'kids fashion'],
  women: ['women fashion', 'women clothing', 'fashion'],
  men: ['men clothing', 'men fashion', 'clothing'],
}

export function getDemographicAnchorQuery(demo: Demographic, category: string): string {
  const cat = DEMOGRAPHIC_CATEGORY_ANCHOR[demo]
  return cat[category] ?? cat.all ?? DEMOGRAPHIC_ANCHOR[demo]
}

export function getDemographicFallbackQueries(demo: Demographic): string[] {
  return FALLBACK_CHAIN[demo]
}

const DEMOGRAPHIC_POSITIVE: Record<Demographic, string[]> = {
  baby: ['baby', 'infant', 'newborn', 'toddler', '0-24', 'kids'],
  kids: ['kids', 'children', 'child', 'girls', 'boys', 'youth'],
  girls: ['girls', 'kids', 'children', 'girl', 'youth'],
  boys: ['boys', 'kids', 'children', 'boy', 'youth'],
  women: ['women', 'womens', 'female', 'ladies', 'woman'],
  men: ['men', 'mens', 'male', 'man'],
}

const DEMOGRAPHIC_REJECT: Record<Demographic, RegExp> = {
  baby: /\b(plus size|maternity|sexy|lingerie|men'?s suit|men'?s shirt)\b/i,
  kids: /\b(plus size|maternity|sexy|lingerie|men'?s suit|women'?s dress)\b/i,
  girls: /\b(plus size|maternity|sexy|lingerie|women|womens|woman|ladies|men|mens|man|adult|boys|boy'?s)\b/i,
  boys: /\b(plus size|maternity|sexy|lingerie|women|womens|woman|ladies|men|mens|man|adult|girls|girl'?s)\b/i,
  women: /\b(plus size|maternity|baby|infant|toddler|kids|children|girl'?s|boy'?s)\b/i,
  men: /\b(plus size|maternity|baby|infant|toddler|kids|children|girl'?s|boy'?s)\b/i,
}

export function scoreProductForDemographic(productName: string, demo: Demographic): number {
  const name = productName.toLowerCase()
  const positive = DEMOGRAPHIC_POSITIVE[demo]
  let score = 0
  for (const kw of positive) {
    if (name.includes(kw)) score += 10
  }
  const reject = DEMOGRAPHIC_REJECT[demo]
  if (reject.test(productName)) score -= 20
  return score
}

export { DEMOGRAPHIC_POSITIVE, DEMOGRAPHIC_REJECT }
