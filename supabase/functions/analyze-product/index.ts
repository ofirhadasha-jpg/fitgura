import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

interface SizeChartEntry {
  label: string
  height_cm?: [number, number]
  chest_cm?: [number, number]
  waist_cm?: [number, number]
  hips_cm?: [number, number]
  shoulder_cm?: [number, number]
  length_cm?: number
  foot_length_cm?: [number, number]
  weight_kg?: [number, number]
}

interface ProductAnalysis {
  productName: string | null
  productImage: string | null
  price: string | null
  platform: string
  category: string
  sizeChart: SizeChartEntry[]
  availableSizes: string[]
  fitBias: { label: string; shift: number } | null
  productDemographic: 'children' | 'women' | 'men' | 'unisex-adult' | 'unknown'
}

const SHORT_URL_DOMAINS = [
  "a.co", "amzn.to", "amzn.com", "ali.ski", "aliexpress.com/shop_api",
  "bit.ly", "t.co", "tinyurl.com", "shorturl.at", "cutt.ly", "rebrand.ly",
]

const STANDARD_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function isShortUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    return SHORT_URL_DOMAINS.some((d) => host === d || host === `www.${d}`)
  } catch {
    return false
  }
}

async function resolveShortUrl(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    // Use manual redirect: follow but capture the final URL
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": STANDARD_UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    })

    // res.url contains the final URL after all redirects
    const finalUrl = res.url || res.headers.get("location") || url
    if (finalUrl && finalUrl !== url) {
      console.log(`[analyze-product] Resolved short URL: ${url} -> ${finalUrl}`)
    }
    return finalUrl || url
  } catch {
    return url
  } finally {
    clearTimeout(timeout)
  }
}

function extractAmazonAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/exec\/obidos\/tg\/detail\/-\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/o\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function detectPlatform(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes("shein")) return "SHEIN"
  if (lower.includes("aliexpress")) return "AliExpress"
  if (lower.includes("temu")) return "Temu"
  if (lower.includes("zara")) return "ZARA"
  if (lower.includes("hm.com") || lower.includes("h&m")) return "H&M"
  if (lower.includes("amazon") || lower.includes("a.co") || lower.includes("amzn")) return "Amazon"
  if (lower.includes("nike")) return "Nike"
  return "Generic"
}

function extractNumber(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  return parseFloat(match[1])
}

function parseMeasurementRange(text: string, defaultInches: boolean): [number, number] | null {
  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)/)
  const single = rangeMatch ? null : extractNumber(text)
  if (!rangeMatch && single == null) return null
  const values = rangeMatch ? [Number(rangeMatch[1]), Number(rangeMatch[2])] : [single as number, single as number]
  const inches = defaultInches || /(?:inch|inches|\bin\b|[\"″])/i.test(text)
  const converted = inches ? values.map((value) => value * 2.54) : values
  return rangeMatch ? [converted[0], converted[1]] : [converted[0] - 2, converted[0] + 2]
}

function parseHeightRange(text: string): [number, number] | null {
  const heightRange = text.match(/(\d{3})\s*[-–~]\s*(\d{3})\s*cm/i)
  if (heightRange) return [Number(heightRange[1]), Number(heightRange[2])]
  const numericHeight = text.match(/^(\d{2,3})(?=\s*(?:\(|$))/)
  if (numericHeight) {
    const height = Number(numericHeight[1])
    return [height - 5, height + 5]
  }
  const ageMatch = text.match(/\b(\d{1,2})(?:Y|T)\b/i)
  if (!ageMatch) return null
  const age = Number(ageMatch[1])
  return [age * 6 + 74, age * 6 + 80]
}

function isSizeLabel(label: string): boolean {
  return /^(?:(?:xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|\d{2,3}(?:\s*\([^)]{1,16}\))?|\d{1,2}y(?:\s*\(\s*\d{3}\s*[-–~]\s*\d{3}\s*cm\s*\))?|one size))$/i.test(label.trim())
}

function detectCategory(name: string): string {
  const lower = name.toLowerCase()
  if (/\b(shoe|sneaker|boot|heel|sandal|נעל|סניקרס|מגף)\b/i.test(lower)) return "shoes"
  if (/\b(pants|jeans|trouser|short|legging|jogger|מכנס)\b/i.test(lower)) return "pants"
  if (/\b(dress|gown|שמלה)\b/i.test(lower)) return "dresses"
  if (/\b(suit|blazer|חליפה)\b/i.test(lower)) return "suits"
  return "clothing"
}

// Scrape buyer-review fit bias signals from the product page HTML.
// Returns a label + size-shift recommendation (in size steps, +1 = order one size up).
function extractFitBias(html: string, availableSizes: string[]): { label: string; shift: number } | null {
  const lower = html.toLowerCase()
  // Common fit-bias phrases (English + Chinese + Hebrew) with associated shift.
  const signals: { re: RegExp; shift: number; label: string }[] = [
    { re: /runs?\s+(?:a\s+)?(?:size\s+)?small|sizes?\s+run\s+small|מתקבל\s+קטן|偏小|偏码/i, shift: 1, label: 'מתקבל קטן — מומלץ להזמין מידה מעל' },
    { re: /order\s+(?:a\s+)?(?:size|1\s+size)\s+up|size\s+up|buy\s+(?:a\s+)?size\s+(?:bigger|larger)|הזמינו\s+מידה\s+מעל/i, shift: 1, label: 'מומלץ להזמין מידה מעל' },
    { re: /runs?\s+(?:a\s+)?(?:size\s+)?large|sizes?\s+run\s+large|מתקבל\s+גדול|偏大/i, shift: -1, label: 'מתקבל גדול — אפשר להזמין מידה קטנה' },
    { re: /order\s+(?:a\s+)?(?:size|1\s+size)\s+down|size\s+down|buy\s+(?:a\s+)?size\s+(?:smaller)|הזמינו\s+מידה\s+קטנה/i, shift: -1, label: 'מומלץ להזמין מידה קטנה' },
    { re: /true\s+to\s+size|fits?\s+true|מתאים\s+למידה|按码拍/i, shift: 0, label: 'מתאים למידה — נאמן לטבלה' },
  ]
  // Count matches per shift bucket to pick the dominant signal.
  const counts = new Map<number, { count: number; label: string }>()
  for (const sig of signals) {
    const matches = lower.match(new RegExp(sig.re.source, 'gi'))
    if (matches && matches.length > 0) {
      const existing = counts.get(sig.shift)
      const count = (existing?.count ?? 0) + matches.length
      counts.set(sig.shift, { count, label: sig.label })
    }
  }
  if (counts.size === 0) return null
  let best: { shift: number; count: number; label: string } | null = null
  for (const [shift, info] of counts) {
    if (!best || info.count > best.count) best = { shift, count: info.count, label: info.label }
  }
  // Only return a non-zero shift when there are at least 2 mentions to avoid noise.
  if (best && best.shift !== 0 && best.count < 2) {
    // Still prefer true-to-size if present, otherwise null.
    const tts = counts.get(0)
    return tts ? { label: tts.label, shift: 0 } : null
  }
  return best ? { label: best.label, shift: best.shift } : null
}

// Infer product demographic from page HTML signals (keywords, structured data).
function detectProductDemographic(html: string, productName: string, availableSizes: string[], sizeChart: SizeChartEntry[]): 'children' | 'women' | 'men' | 'unisex-adult' | 'unknown' {
  const lower = html.toLowerCase()
  const name = (productName ?? '').toLowerCase()
  const labels = [...availableSizes, ...sizeChart.map((e) => e.label)]
  const childCount = labels.filter((l) => /\b\d{1,2}y\b/i.test(l) || /^\d{2,3}\s*\([^)]*[ty]/i.test(l.trim()) || (/^\d{2,3}$/.test(l.trim()) && Number(l) >= 70 && Number(l) <= 170)).length
  if (childCount > 0 && childCount >= labels.filter((l) => /^(?:xxs|xs|s|m|l|xl|xxl|2xl|3xl)$/i.test(l.trim())).length) return 'children'
  const womenSignals = /(women|woman|female|lady|girls?'|dress|skirt|blouse|femme|נשים|אישה|שמלה|חצאית)/i
  const menSignals = /(\bmen\b|\bman\b|\bmale\b|\bboys?\b|menswear|גברים|גבר)/i
  const nameScore = (re: RegExp) => (re.test(name) ? 2 : 0) + (re.test(lower.slice(0, 20000)) ? 1 : 0)
  const wScore = nameScore(womenSignals)
  const mScore = nameScore(menSignals)
  if (wScore > mScore && wScore >= 2) return 'women'
  if (mScore > wScore && mScore >= 2) return 'men'
  if (childCount > 0) return 'children'
  if (labels.some((l) => /^(?:xxs|xs|s|m|l|xl|xxl|2xl|3xl)$/i.test(l.trim()))) return 'unisex-adult'
  return 'unknown'
}

function extractMetaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i")
  const match = html.match(re)
  return match ? match[1] : null
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match ? match[1].trim() : null
}

function extractProductImage(html: string): string | null {
  // 1. og:image meta tag
  let img = extractMetaContent(html, "og:image")
  if (img) return img

  // 2. twitter:image meta tag
  img = extractMetaContent(html, "twitter:image")
  if (img) return img

  // 3. Amazon #landingImage data-a-dynamic-image
  const landingMatch = html.match(/<img[^>]*id=["']landingImage["'][^>]*data-a-dynamic-image=["'](\{[^}]*\})["']/i)
  if (landingMatch) {
    // The value is a JSON-like map; extract the first URL key
    const urlMatch = landingMatch[1].match(/"(https?:\/\/[^"]+)"/)
    if (urlMatch) return urlMatch[1]
  }

  // 4. Amazon #landingImage src
  const landingSrcMatch = html.match(/<img[^>]*id=["']landingImage["'][^>]*src=["']([^"']*)["']/i)
  if (landingSrcMatch) return landingSrcMatch[1]

  // 5. Amazon #imgBlkFront
  const imgBlkMatch = html.match(/<img[^>]*id=["']imgBlkFront["'][^>]*src=["']([^"']*)["']/i)
  if (imgBlkMatch) return imgBlkMatch[1]

  // 6. Generic product image class
  const imgMatch = html.match(/<img[^>]*src=["']([^"']*)["'][^>]*class=["'][^"']*product[^"']*["']/i)
  if (imgMatch) return imgMatch[1]

  // 7. data-old-hires (Amazon)
  const oldHiresMatch = html.match(/data-old-hires=["']([^"']*)["']/i)
  if (oldHiresMatch) return oldHiresMatch[1]

  return null
}

function parseSizeChartFromHTML(html: string): { entries: SizeChartEntry[]; availableSizes: string[] } {
  const entries: SizeChartEntry[] = []
  const availableSizes: string[] = []
  const seenSizes = new Set<string>()

  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let tableMatch: RegExpExecArray | null

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1]
    const rows: string[] = []
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      rows.push(rowMatch[1])
    }
    if (rows.length < 2) continue

    const headerCells = extractCellTexts(rows[0]).map((cell) => cell.toLowerCase())
    const sizeColIdx = headerCells.findIndex((h) =>
      h.includes("size") || h.includes("מידה") || h.includes("尺寸")
    )
    const chestColIdx = headerCells.findIndex((h) => h.includes("chest") || h.includes("bust") || h.includes("חזה") || h.includes("胸"))
    const waistColIdx = headerCells.findIndex((h) => h.includes("waist") || h.includes("מותן") || h.includes("腰"))
    const hipsColIdx = headerCells.findIndex((h) => h.includes("hip") || h.includes("אגן") || h.includes("臀"))
    const shoulderColIdx = headerCells.findIndex((h) => h.includes("shoulder") || h.includes("כתף") || h.includes("肩"))
    const lengthColIdx = headerCells.findIndex((h) => h.includes("length") || h.includes("אורך") || h.includes("长"))
    const footColIdx = headerCells.findIndex((h) => h.includes("foot") || h.includes("רגל") || h.includes("脚"))
    const tableUsesInches = /(?:inch|inches|\bin\b|[\"″])/i.test(tableHtml)

    const effectiveSizeCol = sizeColIdx >= 0 ? sizeColIdx : 0

    for (let i = 1; i < rows.length; i++) {
      const cells = extractCellTexts(rows[i])
      if (cells.length < 2) continue
      const label = cells[effectiveSizeCol]?.trim() ?? ""
      if (!label || label.length > 20) continue
      if (!isSizeLabel(label)) continue

      if (!seenSizes.has(label.toUpperCase())) {
        seenSizes.add(label.toUpperCase())
        availableSizes.push(label)
      }

      const entry: SizeChartEntry = { label }
      const heightRange = parseHeightRange(label)
      if (heightRange) entry.height_cm = heightRange
      const cols = [chestColIdx, waistColIdx, hipsColIdx, shoulderColIdx, lengthColIdx, footColIdx, heightColIdx, weightColIdx]
      const setters = [
        (range: [number, number]) => { entry.chest_cm = range },
        (range: [number, number]) => { entry.waist_cm = range },
        (range: [number, number]) => { entry.hips_cm = range },
        (range: [number, number]) => { entry.shoulder_cm = range },
        (val: number) => { entry.length_cm = val },
        (range: [number, number]) => { entry.foot_length_cm = range },
        (range: [number, number]) => { entry.height_cm = range },
        (range: [number, number]) => { entry.weight_kg = range },
      ]
      const isLength = [false, false, false, false, true, false, false, false]

      for (let c = 0; c < cols.length; c++) {
        if (cols[c] < 0 || cols[c] >= cells.length) continue
        const val = cells[cols[c]].trim()
        if (isLength[c]) {
          const num = extractNumber(val)
          if (num != null) {
            const inches = tableUsesInches || /(?:inch|inches|\bin\b|[\"″])/i.test(val)
            setters[c]((inches ? num * 2.54 : num) as any)
          }
        } else {
          const range = parseMeasurementRange(val, tableUsesInches)
          if (range) setters[c](range as any)
        }
      }

      if (Object.keys(entry).length > 1) entries.push(entry)
    }
  }

  const sizeBtnRegex = /(?:data-size|aria-label)=["']([^"']+)["']|class=["'][^"']*size[^"']*["'][^>]*>([^<]{1,10})</gi
  let btnMatch: RegExpExecArray | null
  while ((btnMatch = sizeBtnRegex.exec(html)) !== null) {
    const text = (btnMatch[1] ?? btnMatch[2] ?? "").trim()
    if (text && text.length < 30 && isSizeLabel(text)) {
      if (!seenSizes.has(text.toUpperCase())) {
        seenSizes.add(text.toUpperCase())
        availableSizes.push(text)
      }
    }
  }

  extractEmbeddedChartEntries(html, entries, availableSizes, seenSizes)

  const textSizeRegex = /\b(?:\d{1,2}Y\s*(?:\(\s*\d{3}\s*[-–~]\s*\d{3}\s*cm\s*\))?|\d{2,3}\s*\(\s*\d{1,2}(?:-\d{1,2})?[TY]\s*\))/gi
  let textSizeMatch: RegExpExecArray | null
  while ((textSizeMatch = textSizeRegex.exec(html)) !== null) {
    const text = textSizeMatch[0].replace(/\s+/g, " ").trim()
    if (!seenSizes.has(text.toUpperCase())) {
      seenSizes.add(text.toUpperCase())
      availableSizes.push(text)
      entries.push({ label: text, height_cm: parseHeightRange(text) ?? undefined })
    }
  }

  const childSizePattern = /^(?:\d{1,2}Y\b|\d{2,3}\s*\([^)]*[TY])/i
  const childSizes = availableSizes.filter((label) => childSizePattern.test(label.trim()))
  if (childSizes.length >= 2) {
    return {
      entries: entries.filter((entry) => childSizePattern.test(entry.label.trim())),
      availableSizes: childSizes,
    }
  }

  return { entries, availableSizes }
}

function extractEmbeddedChartEntries(
  html: string,
  entries: SizeChartEntry[],
  availableSizes: string[],
  seenSizes: Set<string>,
): void {
  const labelRegex = /["'](?:size|label|sku|option)["']\s*:\s*["']([^"']+)["']/gi
  let labelMatch: RegExpExecArray | null
  while ((labelMatch = labelRegex.exec(html)) !== null) {
    const label = labelMatch[1].trim()
    if (!isSizeLabel(label) || seenSizes.has(label.toUpperCase())) continue
    const window = html.slice(Math.max(0, labelMatch.index - 700), labelMatch.index + 1000)
    const unitInches = /(?:inch|inches|\\bin\\b|["″])/i.test(window)
    const readField = (names: string): [number, number] | null => {
      const field = window.match(new RegExp(`["'](?:${names})["']\\s*:\\s*["']?([^,"'}\\]]+)`, "i"))
      return field ? parseMeasurementRange(field[1], unitInches) : null
    }
    const entry: SizeChartEntry = { label }
    const chest = readField("chest|bust|חזה")
    const waist = readField("waist|מותן")
    const hips = readField("hip|hips|אגן")
    const shoulder = readField("shoulder|כתף")
    const length = readField("length|丈|אורך")
    const height = readField("height|גובה")
    const weight = readField("weight|משקל")
    if (chest) entry.chest_cm = chest
    if (waist) entry.waist_cm = waist
    if (hips) entry.hips_cm = hips
    if (shoulder) entry.shoulder_cm = shoulder
    if (length) entry.length_cm = Math.round((length[0] + length[1]) / 2)
    if (height) entry.height_cm = height
    if (weight) entry.weight_kg = weight
    seenSizes.add(label.toUpperCase())
    availableSizes.push(label)
    entries.push(entry)
  }
}

function extractCellTexts(rowHtml: string): string[] {
  const cells: string[] = []
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  let match: RegExpExecArray | null
  while ((match = cellRegex.exec(rowHtml)) !== null) {
    const text = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim()
    cells.push(text)
  }
  return cells
}

async function fetchProductPage(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": STANDARD_UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    })
    return await res.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Step 1: Resolve shortened URLs (a.co, amzn.to, ali.ski, etc.)
    let resolvedUrl = url
    if (isShortUrl(url)) {
      resolvedUrl = await resolveShortUrl(url)
    }

    // Step 2: Detect platform from the resolved URL (more accurate)
    let platform = detectPlatform(resolvedUrl)

    // Step 3: If Amazon, build canonical URL from ASIN for reliable scraping
    let scrapeUrl = resolvedUrl
    if (platform === "Amazon") {
      const asin = extractAmazonAsin(resolvedUrl)
      if (asin) {
        scrapeUrl = `https://www.amazon.com/dp/${asin}`
        console.log(`[analyze-product] Amazon ASIN: ${asin}, canonical URL: ${scrapeUrl}`)
      }
    }

    let html = ""
    let productName: string | null = null
    let productImage: string | null = null
    let price: string | null = null

    try {
      html = await fetchProductPage(scrapeUrl)
      productName = extractMetaContent(html, "og:title") ?? extractTitle(html)
      if (productName) {
        productName = productName.replace(/\s*[|\-–]\s*(SHEIN|AliExpress|Temu|Zara|H&M|ASOS|Amazon).*$/i, "").trim()
      }
      productImage = extractProductImage(html)

      const ogPrice = extractMetaContent(html, "product:price:amount")
      const ogCurrency = extractMetaContent(html, "product:price:currency")
      if (ogPrice) {
        const currencySymbol = ogCurrency === "ILS" || ogCurrency === "₪" ? "₪" : ogCurrency === "USD" || ogCurrency === "$" ? "$" : ogCurrency === "EUR" || ogCurrency === "€" ? "€" : ""
        price = `${currencySymbol} ${ogPrice}`
      }
      if (!price) {
        const priceMatch = html.match(/(?:₪|\$|€|price["']?\s*[:=]\s*["']?)(\d+(?:\.\d{1,2})?)/i)
        if (priceMatch) {
          const symbol = priceMatch[0].match(/₪|\$|€/)
          price = `${symbol ? symbol[0] : "₪"} ${priceMatch[1]}`
        }
      }
    } catch (fetchErr) {
      console.error("Product page fetch failed:", fetchErr)
    }

    const category = detectCategory(productName ?? "")
    const { entries: sizeChart, availableSizes } = parseSizeChartFromHTML(html)
    const fitBias = extractFitBias(html, availableSizes)
    const productDemographic = detectProductDemographic(html, productName ?? "", availableSizes, sizeChart)

    const result: ProductAnalysis = {
      productName: productName ?? null,
      productImage,
      price,
      platform,
      category,
      sizeChart,
      availableSizes,
      fitBias,
      productDemographic,
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("analyze-product error:", err)
    return new Response(JSON.stringify({ error: "Analysis failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
}

serve(handleRequest)
