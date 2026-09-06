export type SizeRegion = 'EU' | 'IL' | 'US' | 'UK'

export interface PantsSizeEntry {
  EU: string
  IL: string
  US: string
  UK: string
}

export const PANTS_SIZE_TABLE: PantsSizeEntry[] = [
  { EU: '36', IL: '36', US: '26', UK: '8' },
  { EU: '38', IL: '38', US: '28', UK: '10' },
  { EU: '40', IL: '40', US: '30', UK: '12' },
  { EU: '42', IL: '42', US: '32', UK: '14' },
  { EU: '44', IL: '44', US: '34', UK: '16' },
  { EU: '46', IL: '46', US: '36', UK: '18' },
  { EU: '48', IL: '48', US: '38', UK: '20' },
]

const EU_TO_ENTRY: Record<string, PantsSizeEntry> = Object.fromEntries(
  PANTS_SIZE_TABLE.map((e) => [e.EU, e]),
)

const US_TO_ENTRY: Record<string, PantsSizeEntry> = Object.fromEntries(
  PANTS_SIZE_TABLE.map((e) => [e.US, e]),
)

export function usToEuPants(usSize: string): string {
  const entry = US_TO_ENTRY[usSize]
  if (entry) return entry.EU
  const num = parseInt(usSize, 10)
  if (!isNaN(num)) return String(num + 10)
  return usSize
}

export function euToUsPants(euSize: string): string {
  const entry = EU_TO_ENTRY[euSize]
  if (entry) return entry.US
  const num = parseInt(euSize, 10)
  if (!isNaN(num)) return String(num - 10)
  return euSize
}

export function getPantsSizeEntry(euSize: string): PantsSizeEntry | null {
  return EU_TO_ENTRY[euSize] ?? null
}

export function formatPantsSizeLabel(euSize: string, preferredRegion: SizeRegion = 'EU'): string {
  const entry = getPantsSizeEntry(euSize)
  if (!entry) return `EU ${euSize}`
  const parts: string[] = [`EU ${entry.EU}`]
  if (preferredRegion !== 'EU') {
    parts.push(`IL ${entry.IL}`)
    parts.push(`US ${entry.US}`)
  }
  return parts.join(' / ')
}

export function formatFullPantsSizeLabel(euSize: string): string {
  const entry = getPantsSizeEntry(euSize)
  if (!entry) return `EU ${euSize}`
  return `EU ${entry.EU} (IL ${entry.IL} / US ${entry.US})`
}

export const SIZE_REGION_LABELS: Record<SizeRegion, string> = {
  EU: 'EU / ישראל',
  IL: 'ישראל',
  US: 'US',
  UK: 'UK',
}

export const SIZE_REGION_OPTIONS: SizeRegion[] = ['EU', 'US', 'UK']
