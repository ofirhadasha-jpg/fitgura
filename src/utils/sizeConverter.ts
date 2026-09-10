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

// ─── Shoe size conversion (EU / US / UK / IL) ───────────────────────────
export interface ShoeSizeEntry {
  EU: string
  US: string
  UK: string
  IL: string
}

export const SHOE_SIZE_TABLE: ShoeSizeEntry[] = [
  { EU: '35', US: '5',    UK: '2.5', IL: '35' },
  { EU: '36', US: '5.5',  UK: '3',   IL: '36' },
  { EU: '37', US: '6',    UK: '4',   IL: '37' },
  { EU: '38', US: '6.5',  UK: '4.5', IL: '38' },
  { EU: '39', US: '7',    UK: '5',   IL: '39' },
  { EU: '40', US: '7.5',  UK: '6',   IL: '40' },
  { EU: '41', US: '8',    UK: '7',   IL: '41' },
  { EU: '42', US: '8.5',  UK: '7.5', IL: '42' },
  { EU: '43', US: '9',    UK: '8',   IL: '43' },
  { EU: '44', US: '9.5',  UK: '8.5', IL: '44' },
  { EU: '45', US: '10',   UK: '9',   IL: '45' },
  { EU: '46', US: '11',   UK: '10',  IL: '46' },
  { EU: '47', US: '12',   UK: '11',  IL: '47' },
  { EU: '48', US: '13',   UK: '12',  IL: '48' },
]

const SHOE_EU_TO_ENTRY: Record<string, ShoeSizeEntry> = Object.fromEntries(
  SHOE_SIZE_TABLE.map((e) => [e.EU, e]),
)

export function getShoeSizeEntry(euSize: string): ShoeSizeEntry | null {
  return SHOE_EU_TO_ENTRY[euSize] ?? null
}

export function formatShoeSizeLabel(euSize: string, preferredRegion: SizeRegion = 'EU'): string {
  const entry = getShoeSizeEntry(euSize)
  if (!entry) return `EU ${euSize}`
  const parts: string[] = [`EU ${entry.EU}`]
  if (preferredRegion !== 'EU') {
    parts.push(`US ${entry.US}`)
    parts.push(`UK ${entry.UK}`)
    parts.push(`IL ${entry.IL}`)
  }
  return parts.join(' / ')
}

export function formatFullShoeSizeLabel(euSize: string): string {
  const entry = getShoeSizeEntry(euSize)
  if (!entry) return `EU ${euSize}`
  return `EU ${entry.EU} (US ${entry.US} / UK ${entry.UK} / IL ${entry.IL})`
}

// ─── Top size conversion (letter → US numeric / IL) ────────────────────
export interface TopSizeEntry {
  letter: string  // XS, S, M, L, XL, XXL
  US: string      // US numeric (chest)
  IL: string      // IL (same as letter in Israel)
  UK: string      // UK equivalent
}

export const TOP_SIZE_TABLE: TopSizeEntry[] = [
  { letter: 'XS',  US: '32', IL: 'XS', UK: '32' },
  { letter: 'S',   US: '34', IL: 'S',  UK: '34' },
  { letter: 'M',   US: '36', IL: 'M',  UK: '36' },
  { letter: 'L',   US: '38', IL: 'L',  UK: '38' },
  { letter: 'XL',  US: '40', IL: 'XL', UK: '40' },
  { letter: 'XXL', US: '42', IL: 'XXL', UK: '42' },
]

const TOP_LETTER_TO_ENTRY: Record<string, TopSizeEntry> = Object.fromEntries(
  TOP_SIZE_TABLE.map((e) => [e.letter, e]),
)

// Normalize Asian size labels (2XL → XXL, 3XL → XXL+1, etc.) for lookup
function normalizeTopLetter(label: string): string {
  const map: Record<string, string> = {
    '2XL': 'XXL', '3XL': 'XXL', '4XL': 'XXL', '5XL': 'XXL',
  }
  return map[label.toUpperCase()] ?? label.toUpperCase()
}

export function getTopSizeEntry(letterSize: string): TopSizeEntry | null {
  return TOP_LETTER_TO_ENTRY[normalizeTopLetter(letterSize)] ?? null
}

export function formatTopSizeLabel(letterSize: string, preferredRegion: SizeRegion = 'EU'): string {
  const entry = getTopSizeEntry(letterSize)
  if (!entry) return letterSize
  const parts: string[] = [entry.letter]
  if (preferredRegion !== 'EU') {
    parts.push(`US ${entry.US}`)
    parts.push(`IL ${entry.IL}`)
  }
  return parts.join(' / ')
}

export function formatFullTopSizeLabel(letterSize: string): string {
  const entry = getTopSizeEntry(letterSize)
  if (!entry) return letterSize
  return `${entry.letter} (US ${entry.US} / IL ${entry.IL})`
}

// ─── Unified size label formatter ──────────────────────────────────────
export type SizeType = 'top' | 'bottom' | 'shoe'

export function formatFullSizeLabel(sizeType: SizeType, sizeValue: string): string {
  if (sizeType === 'shoe') return formatFullShoeSizeLabel(sizeValue)
  if (sizeType === 'bottom') return formatFullPantsSizeLabel(sizeValue)
  return formatFullTopSizeLabel(sizeValue)
}

export function formatShortSizeLabel(sizeType: SizeType, sizeValue: string, preferredRegion: SizeRegion = 'EU'): string {
  if (sizeType === 'shoe') return formatShoeSizeLabel(sizeValue, preferredRegion)
  if (sizeType === 'bottom') return formatPantsSizeLabel(sizeValue, preferredRegion)
  return formatTopSizeLabel(sizeValue, preferredRegion)
}

export const SIZE_REGION_LABELS: Record<SizeRegion, string> = {
  EU: 'EU / ישראל',
  IL: 'ישראל',
  US: 'US',
  UK: 'UK',
}

export const SIZE_REGION_OPTIONS: SizeRegion[] = ['EU', 'US', 'UK']
