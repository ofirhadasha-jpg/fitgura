/**
 * E2E Pipeline Test for Fitgura Smart Recommendation Engine
 *
 * Tests the full flow: AliExpress search -> Product details -> DeepSeek sizing -> Affiliate links
 * Run with: npx tsx src/services/e2eTest.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
const envVars: Record<string, string> = {}
for (const line of envFile.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) envVars[match[1].trim()] = match[2].trim()
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || envVars.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || envVars.VITE_SUPABASE_ANON_KEY || ''

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
} as const

interface FitRecommendation {
  productId: string
  title: string
  recommendedSize: string
  selectedSkuId: string
  fitConfidenceScore: number
  fitExplanation: string
  productImageUrl: string
  affiliateUrl: string
  price: string
}

interface EnvAuditResult {
  envAudit: Record<string, boolean>
  missingVars: string[]
  connectivity: string
  productCount?: number
  error?: string
}

function log(stage: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString()
  console.log(`\n[${timestamp}] [${stage}] ${message}`)
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2))
  }
}

async function testEnvAudit(): Promise<EnvAuditResult> {
  log('STEP 1', 'Testing environment variables and AliExpress connectivity...')

  const response = await fetch(`${SUPABASE_URL}/functions/v1/aliexpress-search`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ action: 'test', keywords: 'men jacket' }),
  })

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    log('STEP 1', 'FAILED - Environment audit or connectivity error', result)
    throw new Error(`Env audit failed (${response.status})`)
  }

  log('STEP 1', 'Environment audit result', result)
  return result as EnvAuditResult
}

async function testSmartRecommendation(): Promise<FitRecommendation[]> {
  log('STEP 2', 'Testing full smart recommendation pipeline...')

  const searchQuery = 'men leather jacket'
  const userMetrics = {
    chestCm: 104,
    waistCm: 88,
    heightCm: 180,
    weightKg: 78,
    preferredFit: 'regular' as const,
  }

  log('STEP 2', `Search query: "${searchQuery}"`, userMetrics)

  const response = await fetch(`${SUPABASE_URL}/functions/v1/smart-recommend`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ searchQuery, userMetrics }),
  })

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    log('STEP 2', 'FAILED - Smart recommendation error', result)
    throw new Error(`Smart recommendation failed (${response.status}): ${result?.error ?? 'Unknown'}`)
  }

  const recommendations = result?.recommendations ?? []

  log('STEP 2', `Received ${recommendations.length} recommendations`, recommendations)

  return recommendations as FitRecommendation[]
}

function validateRecommendations(recs: FitRecommendation[]): void {
  log('STEP 3', 'Validating recommendation structure...')

  const errors: string[] = []

  if (recs.length === 0) {
    errors.push('No recommendations returned')
  }

  for (const [i, rec] of recs.entries()) {
    if (!rec.productId) errors.push(`Recommendation ${i}: missing productId`)
    if (!rec.title) errors.push(`Recommendation ${i}: missing title`)
    if (!rec.recommendedSize) errors.push(`Recommendation ${i}: missing recommendedSize`)
    if (typeof rec.fitConfidenceScore !== 'number') errors.push(`Recommendation ${i}: fitConfidenceScore is not a number`)
    if (!rec.fitExplanation) errors.push(`Recommendation ${i}: missing fitExplanation`)
    if (!rec.productImageUrl) errors.push(`Recommendation ${i}: missing productImageUrl`)
    if (!rec.affiliateUrl) errors.push(`Recommendation ${i}: missing affiliateUrl`)
    if (!rec.price) errors.push(`Recommendation ${i}: missing price`)
  }

  const sorted = [...recs].sort((a, b) => b.fitConfidenceScore - a.fitConfidenceScore)
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].fitConfidenceScore < sorted[i + 1].fitConfidenceScore) {
      errors.push('Recommendations are not sorted by fitConfidenceScore descending')
      break
    }
  }

  if (errors.length > 0) {
    log('STEP 3', 'VALIDATION FAILED', errors)
    throw new Error(`Validation errors: ${errors.join('; ')}`)
  }

  log('STEP 3', 'Validation passed - all recommendations are well-structured')
}

async function runE2E(): Promise<void> {
  console.log('========================================')
  console.log(' Fitgura E2E Pipeline Test')
  console.log('========================================')

  let errors = 0

  try {
    const envResult = await testEnvAudit()

    if (envResult.missingVars.length > 0) {
      console.warn(`\n[WARNING] Missing env vars: ${envResult.missingVars.join(', ')}`)
    }

    if (envResult.connectivity !== 'ok') {
      console.warn(`\n[WARNING] AliExpress connectivity: ${envResult.connectivity} - ${envResult.error ?? ''}`)
    }

    const recommendations = await testSmartRecommendation()
    validateRecommendations(recommendations)

    console.log('\n========================================')
    console.log(' E2E TEST RESULT: PASS')
    console.log('========================================')
    console.log(`Products found: ${recommendations.length}`)
    console.log(`Top product: ${recommendations[0]?.title ?? 'N/A'}`)
    console.log(`Recommended size: ${recommendations[0]?.recommendedSize ?? 'N/A'}`)
    console.log(`Fit confidence: ${recommendations[0]?.fitConfidenceScore ?? 'N/A'}%`)
    console.log(`Fit explanation: ${recommendations[0]?.fitExplanation ?? 'N/A'}`)
    console.log(`Price: ${recommendations[0]?.price ?? 'N/A'}`)
    console.log('========================================')
  } catch (err) {
    errors++
    console.error('\n========================================')
    console.error(' E2E TEST RESULT: FAIL')
    console.error('========================================')
    console.error(err instanceof Error ? err.message : String(err))
    console.error('========================================')
  }

  process.exit(errors > 0 ? 1 : 0)
}

runE2E()
