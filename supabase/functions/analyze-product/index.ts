import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

interface SizeChartEntry {
  label: string
  chest_cm?: [number, number]
  waist_cm?: [number, number]
  hips_cm?: [number, number]
  length_cm?: number
  foot_length_cm?: [number, number]
}

interface ProductAnalysis {
  productName: string | null
  productImage: string | null
  platform: string
  category: string
  sizeChart: SizeChartEntry[]
  availableSizes: string[]
}

function detectPlatform(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes("shein")) return "SHEIN"
  if (lower.includes("aliexpress")) return "AliExpress"
  if (lower.includes("temu")) return "Temu"
  if (lower.includes("zara")) return "ZARA"
  if (lower.includes("hm.com") || lower.includes("h&m")) return "H&M"
  if (lower.includes("asos")) return "ASOS"
  if (lower.includes("amazon")) return "Amazon"
  if (lower.includes("nike")) return "Nike"
  return "Generic"
}

function extractNumber(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  return parseFloat(match[1])
}

function parseRange(text: string): [number, number] | null {
  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)/)
  if (rangeMatch) return [parseFloat(rangeMatch[1]), parseFloat(rangeMatch[2])]
  const single = extractNumber(text)
  if (single != null) return [single - 2, single + 2]
  return null
}

function detectCategory(name: string): string {
  const lower = name.toLowerCase()
  if (/\b(shoe|sneaker|boot|heel|sandal|נעל|סניקרס|מגף)\b/i.test(lower)) return "shoes"
  if (/\b(pants|jeans|trouser|short|legging|jogger|מכנס)\b/i.test(lower)) return "pants"
  if (/\b(dress|gown|שמלה)\b/i.test(lower)) return "dresses"
  if (/\b(suit|blazer|חליפה)\b/i.test(lower)) return "suits"
  return "clothing"
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

function parseSizeChartFromHTML(html: string): { entries: SizeChartEntry[]; availableSizes: string[] } {
  const entries: SizeChartEntry[] = []
  const availableSizes: string[] = []
  const seenSizes = new Set<string>()

  // Extract all <table> blocks using regex
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

    // Parse header row
    const headerCells = extractCellTexts(rows[0])
    const sizeColIdx = headerCells.findIndex((h) =>
      h.includes("size") || h.includes("מידה") || h.includes("尺寸")
    )
    const chestColIdx = headerCells.findIndex((h) => h.includes("chest") || h.includes("bust") || h.includes("חזה") || h.includes("胸"))
    const waistColIdx = headerCells.findIndex((h) => h.includes("waist") || h.includes("מותן") || h.includes("腰"))
    const hipsColIdx = headerCells.findIndex((h) => h.includes("hip") || h.includes("אגן") || h.includes("臀"))
    const lengthColIdx = headerCells.findIndex((h) => h.includes("length") || h.includes("אורך") || h.includes("长"))
    const footColIdx = headerCells.findIndex((h) => h.includes("foot") || h.includes("רגל") || h.includes("脚"))

    const effectiveSizeCol = sizeColIdx >= 0 ? sizeColIdx : 0

    for (let i = 1; i < rows.length; i++) {
      const cells = extractCellTexts(rows[i])
      if (cells.length < 2) continue
      const label = cells[effectiveSizeCol]?.trim() ?? ""
      if (!label || label.length > 20) continue
      if (!/^((xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|\d{2,3}|one size))$/i.test(label)) continue

      if (!seenSizes.has(label.toUpperCase())) {
        seenSizes.add(label.toUpperCase())
        availableSizes.push(label)
      }

      const entry: SizeChartEntry = { label }
      const cols = [chestColIdx, waistColIdx, hipsColIdx, lengthColIdx, footColIdx]
      const setters = [
        (range: [number, number]) => { entry.chest_cm = range },
        (range: [number, number]) => { entry.waist_cm = range },
        (range: [number, number]) => { entry.hips_cm = range },
        (val: number) => { entry.length_cm = val },
        (range: [number, number]) => { entry.foot_length_cm = range },
      ]
      const isLength = [false, false, false, true, false]

      for (let c = 0; c < cols.length; c++) {
        if (cols[c] < 0 || cols[c] >= cells.length) continue
        const val = cells[cols[c]].trim()
        if (isLength[c]) {
          const num = extractNumber(val)
          if (num != null) setters[c](num as any)
        } else {
          const range = parseRange(val)
          if (range) setters[c](range as any)
        }
      }

      if (Object.keys(entry).length > 1) entries.push(entry)
    }
  }

  // Also look for size buttons (common on SHEIN, Zara)
  const sizeBtnRegex = /(?:data-size|aria-label)=["']([^"']+)["']|class=["'][^"']*size[^"']*["'][^>]*>([^<]{1,10})</gi
  let btnMatch: RegExpExecArray | null
  while ((btnMatch = sizeBtnRegex.exec(html)) !== null) {
    const text = (btnMatch[1] ?? btnMatch[2] ?? "").trim()
    if (text && text.length < 10 && /^((xxs|xs|s|m|l|xl|xxl|2xl|3xl|\d{2,3}|one size))$/i.test(text)) {
      if (!seenSizes.has(text.toUpperCase())) {
        seenSizes.add(text.toUpperCase())
        availableSizes.push(text)
      }
    }
  }

  return { entries, availableSizes }
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

    const platform = detectPlatform(url)

    let html = ""
    let productName: string | null = null
    let productImage: string | null = null

    try {
      html = await fetchProductPage(url)
      productName = extractMetaContent(html, "og:title") ?? extractTitle(html)
      if (productName) {
        productName = productName.replace(/\s*[|\-–]\s*(SHEIN|AliExpress|Temu|Zara|H&M|ASOS|Amazon).*$/i, "").trim()
      }
      productImage = extractMetaContent(html, "og:image")
      if (!productImage) {
        const imgMatch = html.match(/<img[^>]*src=["']([^"']*)["'][^>]*class=["'][^"']*product[^"']*["']/i)
        if (imgMatch) productImage = imgMatch[1]
      }
    } catch (fetchErr) {
      console.error("Product page fetch failed:", fetchErr)
    }

    const category = detectCategory(productName ?? "")
    const { entries: sizeChart, availableSizes } = parseSizeChartFromHTML(html)

    const result: ProductAnalysis = {
      productName: productName ?? null,
      productImage,
      platform,
      category,
      sizeChart,
      availableSizes,
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
