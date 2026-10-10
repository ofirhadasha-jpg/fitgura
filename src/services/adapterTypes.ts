import type { Product, ProductPlatform } from '../types'

// ── Shared domain types (re-exported from aliexpressClient for backward compat) ──
export type Gender = 'male' | 'female' | 'unisex'
export type FeedCategory = 'all' | 'clothing' | 'shoes' | 'accessories'
export type AgeGroupFilter = 'baby' | 'toddler' | 'child' | 'teen' | 'adult'

// ── Adapter credential configuration ──────────────────────────────────────────

export interface AliExpressCredentials {
  appKey: string
  appSecret: string
  trackingId: string
}

export interface CJCredentials {
  accessToken: string
  websiteId: string
  advertiserId: string
}

export interface TemuCredentials {
  affiliateKey: string
  trackingId: string
}

// ── Unified adapter interface ─────────────────────────────────────────────────
// Every affiliate source implements this interface so the aggregator can
// query them uniformly. Adapters that don't have credentials yet should
// return mock data (isMock: true) rather than throwing.

export interface AdapterSearchParams {
  category: FeedCategory
  gender: Gender
  pageNo: number
  pageSize: number
  extraKeywords?: string
  ageGroup: AgeGroupFilter
}

export interface AdapterQueryParams {
  keywords: string
  pageNo: number
  pageSize: number
}

export interface AdapterDeviceParams {
  deviceName: string
  pageNo: number
  pageSize: number
  gender?: Gender
}

export interface ExactVisualMatch {
  platform: ProductPlatform
  name: string
  price: number
  currency: string
  imageUrl: string
  productUrl: string
  productId: string
  sizes: string[]
  score: number
  verifiedActive: boolean
}

export interface AffiliateAdapter {
  readonly platform: ProductPlatform
  readonly isConfigured: boolean

  searchByCategory(params: AdapterSearchParams): Promise<Product[]>
  searchByQuery(params: AdapterQueryParams): Promise<Product[]>
  searchDeviceAccessories(params: AdapterDeviceParams): Promise<Product[]>
}

// ── Normalization helper ──────────────────────────────────────────────────────
// All adapters map their raw API responses into the shared Product schema
// using this helper to guarantee consistent field names.

export function normalizeProduct(
  raw: Record<string, unknown>,
  platform: ProductPlatform,
): Product {
  const price = Number(raw.price ?? raw.sale_price ?? raw.salePrice ?? 0)
  const originalPrice = raw.original_price != null || raw.originalPrice != null
    ? Number(raw.original_price ?? raw.originalPrice)
    : null

  return {
    name: String(raw.name ?? raw.title ?? raw.product_name ?? ''),
    brand: String(raw.brand ?? raw.store_name ?? ''),
    price: isNaN(price) ? 0 : price,
    originalPrice: originalPrice != null && !isNaN(originalPrice) ? originalPrice : null,
    currency: String(raw.currency ?? 'USD'),
    img: String(raw.img ?? raw.image ?? raw.image_url ?? raw.imageUrl ?? ''),
    imageUrl: String(raw.imageUrl ?? raw.image_url ?? raw.img ?? raw.image ?? ''),
    category: String(raw.category ?? ''),
    aliexpressUrl: String(raw.url ?? raw.product_url ?? raw.link ?? raw.aliexpressUrl ?? ''),
    aliexpressSku: String(raw.sku ?? raw.product_id ?? raw.productId ?? raw.aliexpressSku ?? ''),
    promotionLink: (raw.promotion_link ?? raw.promotionLink ?? null) as string | null,
    availableSizes: (raw.availableSizes ?? raw.sizes ?? raw.size_options ?? []) as string[],
    ordersCount: Number(raw.orders ?? raw.ordersCount ?? raw.sales ?? 0) || undefined,
    volume: Number(raw.volume ?? 0) || undefined,
    evaluateRate: Number(raw.rating ?? raw.evaluateRate ?? 0) || undefined,
    platform,
  } as Product
}
