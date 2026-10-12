/**
 * Lightweight canvas-based face detection.
 * Uses skin-tone clustering + facial feature heuristics to determine
 * whether a face is likely present in an image.
 * Not a replacement for face-api/nanodet but catches the common case
 * of scenery/document uploads with no person in frame.
 */

interface FaceDetectionResult {
  faceDetected: boolean
  confidence: number
  skinRatio: number
}

function isSkinTone(r: number, g: number, b: number): boolean {
  // RGB skin-tone heuristic covering diverse skin tones
  const rgbMax = Math.max(r, g, b)
  const rgbMin = Math.min(r, g, b)
  const diff = rgbMax - rgbMin

  // Skin tones: R > G > B generally, moderate saturation, not too dark/bright
  const isRgbOrder = r >= g && g >= b
  const isNotTooDark = r > 50 && g > 30
  const isNotTooBright = r < 250 || g < 250
  const saturation = rgbMax > 0 ? diff / rgbMax : 0
  const isModerateSat = saturation > 0.05 && saturation < 0.65

  return isRgbOrder && isNotTooDark && isNotTooBright && isModerateSat && diff > 12
}

function isDarkRegion(r: number, g: number, b: number): boolean {
  return (r + g + b) / 3 < 80
}

export async function detectFace(file: File): Promise<FaceDetectionResult> {
  try {
    const bitmap = await createImageBitmap(file)
    const w = Math.min(bitmap.width, 200)
    const scale = w / bitmap.width
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return { faceDetected: true, confidence: 0.5, skinRatio: 0 }
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const imageData = ctx.getImageData(0, 0, w, h)
    const data = imageData.data

    // Focus on upper 60% of image where faces typically appear
    const upperThreshold = Math.floor(h * 0.6)
    let skinPixels = 0
    let totalUpperPixels = 0
    let darkClusters = 0

    // Sample every 2nd pixel for performance
    for (let y = 0; y < upperThreshold; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        totalUpperPixels++
        if (isSkinTone(r, g, b)) {
          skinPixels++
        }
      }
    }

    // Check for eye-like dark regions in the face area
    // Scan horizontal bands for paired dark spots (eyes)
    const faceAreaStart = Math.floor(h * 0.1)
    const faceAreaEnd = Math.floor(h * 0.35)
    for (let y = faceAreaStart; y < faceAreaEnd; y += 4) {
      let darkInRow = 0
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4
        if (isDarkRegion(data[idx], data[idx + 1], data[idx + 2])) {
          darkInRow++
        }
      }
      if (darkInRow > 2 && darkInRow < w / 4) {
        darkClusters++
      }
    }

    const skinRatio = totalUpperPixels > 0 ? skinPixels / totalUpperPixels : 0

    // Heuristic: face present if we have skin-tone clustering + some dark features
    // Skin ratio should be between 3% and 60% of upper image area
    const hasSkin = skinRatio > 0.03 && skinRatio < 0.6
    const hasFeatures = darkClusters > 0
    const hasStrongSkin = skinRatio > 0.08

    const confidence = Math.min(1, skinRatio * 3 + (hasFeatures ? 0.3 : 0))
    const faceDetected = hasSkin && (hasFeatures || hasStrongSkin)

    return { faceDetected, confidence, skinRatio }
  } catch {
    // If we can't process the image, don't block the user
    return { faceDetected: true, confidence: 0.5, skinRatio: 0 }
  }
}

/**
 * Compute a perceptual hash of an image for deduplication.
 * Downscales to 16x16 grayscale and computes average hash.
 */
export async function computeImageHash(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = 16
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return `fallback_${file.size}_${file.name}`
    }
    ctx.drawImage(bitmap, 0, 0, size, size)
    bitmap.close()

    const data = ctx.getImageData(0, 0, size, size).data
    const grayscale: number[] = []
    for (let i = 0; i < data.length; i += 4) {
      grayscale.push((data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0)
    }
    const avg = grayscale.reduce((s, v) => s + v, 0) / grayscale.length
    return grayscale.map((v) => (v >= avg ? '1' : '0')).join('')
  } catch {
    return `fallback_${file.size}_${file.name}`
  }
}

/**
 * Compute hash from a data URL or blob URL (for baseline photo dedup).
 */
export async function computeHashFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const file = new File([blob], 'baseline.jpg', { type: blob.type || 'image/jpeg' })
    return computeImageHash(file)
  } catch {
    return `url_${url.length}`
  }
}

/**
 * Compare two perceptual hashes by Hamming distance.
 * Returns similarity ratio 0-1 (1 = identical).
 */
export function compareHashes(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length || hashA.startsWith('fallback_') || hashB.startsWith('fallback_')) {
    return 0
  }
  let matching = 0
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] === hashB[i]) matching++
  }
  return matching / hashA.length
}
