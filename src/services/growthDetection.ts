import type { ScannedSizes, ScanEntry, BodyMetrics, FamilyMember } from '../types'
import { computeDelta } from '../types'

export interface GrowthDetection {
  member: FamilyMember
  previousSizes: ScannedSizes
  newSizes: ScannedSizes
  sizeChanges: { top?: string; bottom?: string; shoe?: string }
  heightChangeCm: number | null
  weightChangeKg: number | null
  message: string
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const LAST_SCAN_KEY = 'fitgura_last_periodic_scan'

export function shouldRunPeriodicScan(): boolean {
  const last = localStorage.getItem(LAST_SCAN_KEY)
  if (!last) return true
  const lastTime = parseInt(last, 10)
  if (isNaN(lastTime)) return true
  return Date.now() - lastTime >= THIRTY_DAYS_MS
}

export function markPeriodicScanRun(): void {
  localStorage.setItem(LAST_SCAN_KEY, String(Date.now()))
}

export function getLastPeriodicScanDate(): Date | null {
  const last = localStorage.getItem(LAST_SCAN_KEY)
  if (!last) return null
  const t = parseInt(last, 10)
  return isNaN(t) ? null : new Date(t)
}

function absDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null
  return Math.round((a - b) * 10) / 10
}

export function detectGrowth(
  member: FamilyMember,
  newSizes: ScannedSizes,
): GrowthDetection | null {
  const prev = member.scannedSizes
  if (!prev) return null

  const changes: { top?: string; bottom?: string; shoe?: string } = {}
  if (prev.sizing.top !== newSizes.sizing.top) {
    changes.top = `${prev.sizing.top} → ${newSizes.sizing.top}`
  }
  if (prev.sizing.bottom !== newSizes.sizing.bottom) {
    changes.bottom = `${prev.sizing.bottom} → ${newSizes.sizing.bottom}`
  }
  if (prev.shoeSize !== newSizes.shoeSize && newSizes.shoeSize) {
    changes.shoe = `${prev.shoeSize ?? '—'} → ${newSizes.shoeSize}`
  }

  const prevMetrics = prev.sizing.bodyMetrics
  const newMetrics = newSizes.sizing.bodyMetrics
  const heightChange = prevMetrics && newMetrics
    ? absDelta(newMetrics.estimated_height_cm, prevMetrics.estimated_height_cm)
    : null
  const weightChange = prevMetrics && newMetrics
    ? absDelta(newMetrics.estimated_weight_kg, prevMetrics.estimated_weight_kg)
    : null

  const hasSizeChange = Object.keys(changes).length > 0
  const hasGrowth = (heightChange != null && Math.abs(heightChange) >= 1) ||
    (weightChange != null && Math.abs(weightChange) >= 1.5)

  if (!hasSizeChange && !hasGrowth) return null

  const parts: string[] = []
  if (changes.top) parts.push(`חולצה: ${changes.top}`)
  if (changes.bottom) parts.push(`מכנסיים: ${changes.bottom}`)
  if (changes.shoe) parts.push(`נעליים: ${changes.shoe}`)

  const name = member.name
  let message: string
  if (hasGrowth && hasSizeChange) {
    message = `שמנו לב ש${name} ${heightChange != null && heightChange > 0 ? 'גדלה' : 'השתנתה'} בחודש האחרון! 🎈 ${parts.join(' · ')}. [אישור עדכון ✨]`
  } else if (hasSizeChange) {
    message = `המידות של ${name} התעדכנו: ${parts.join(' · ')}. [אישור עדכון ✨]`
  } else {
    message = `זוהה שינוי במדדי הגוף של ${name} (גובה/משקל). המידות עודכנו אוטומטית. [אישור ✨]`
  }

  return {
    member,
    previousSizes: prev,
    newSizes,
    sizeChanges: changes,
    heightChangeCm: heightChange,
    weightChangeKg: weightChange,
    message,
  }
}

export function applyGrowthUpdate(
  members: FamilyMember[],
  detection: GrowthDetection,
): FamilyMember[] {
  return members.map((m) =>
    m.id === detection.member.id
      ? {
          ...m,
          scannedSizes: detection.newSizes,
          accuracy: detection.newSizes.confidence,
        }
      : m,
  )
}

export interface PeriodicScanResult {
  detections: GrowthDetection[]
  updatedMembers: FamilyMember[]
}

export function runPeriodicGrowthCheck(
  members: FamilyMember[],
  selfSizes: ScannedSizes | null,
): PeriodicScanResult {
  const detections: GrowthDetection[] = []

  for (const member of members) {
    if (!member.scannedSizes || !member.photoUrl) continue
    if (member.category !== 'child' && member.category !== 'baby') continue

    const simulated = simulateGrowthScan(member)
    if (!simulated) continue

    const detection = detectGrowth(member, simulated)
    if (detection) detections.push(detection)
  }

  let updated = members
  for (const d of detections) {
    updated = applyGrowthUpdate(updated, d)
  }

  markPeriodicScanRun()
  return { detections, updatedMembers: updated }
}

function simulateGrowthScan(member: FamilyMember): ScannedSizes | null {
  const base = member.scannedSizes
  if (!base) return null

  const metrics = base.sizing.bodyMetrics
  if (!metrics) return null

  const isChild = member.category === 'child' || member.category === 'baby'
  const growthFactor = isChild ? 1.02 : 1.0

  const newHeight = metrics.estimated_height_cm != null
    ? Math.round(metrics.estimated_height_cm * growthFactor * 10) / 10
    : null
  const newWeight = metrics.estimated_weight_kg != null
    ? Math.round(metrics.estimated_weight_kg * (1 + (growthFactor - 1) * 0.7) * 10) / 10
    : null

  const newMetrics: BodyMetrics = {
    estimated_height_cm: newHeight,
    estimated_weight_kg: newWeight,
    chest_circumference_cm: metrics.chest_circumference_cm != null
      ? Math.round(metrics.chest_circumference_cm * growthFactor * 10) / 10
      : null,
    waist_circumference_cm: metrics.waist_circumference_cm != null
      ? Math.round(metrics.waist_circumference_cm * growthFactor * 10) / 10
      : null,
    hips_circumference_cm: metrics.hips_circumference_cm != null
      ? Math.round(metrics.hips_circumference_cm * growthFactor * 10) / 10
      : null,
    shoulder_width_cm: metrics.shoulder_width_cm != null
      ? Math.round(metrics.shoulder_width_cm * growthFactor * 10) / 10
      : null,
  }

  const topIdx = ['XS', 'S', 'M', 'L', 'XL', 'XXL'].indexOf(base.sizing.top)
  const newTop = topIdx >= 0 && topIdx < 5 ? ['XS', 'S', 'M', 'L', 'XL', 'XXL'][topIdx + 1] : base.sizing.top

  const bottomNum = parseInt(base.sizing.bottom, 10)
  const newBottom = !isNaN(bottomNum) && bottomNum < 60 ? String(bottomNum + 2) : base.sizing.bottom

  const shoeNum = base.shoeSize ? parseInt(base.shoeSize, 10) : null
  const newShoe = shoeNum != null && shoeNum < 45 ? String(shoeNum + 1) : base.shoeSize

  return {
    ...base,
    sizing: {
      ...base.sizing,
      top: newTop,
      bottom: newBottom,
      bodyMetrics: newMetrics,
      measurementDelta: computeDelta(base.sizing, {
        ...base.sizing,
        top: newTop,
        bottom: newBottom,
      }),
    },
    top: newTop,
    bottom: newBottom,
    shoeSize: newShoe,
  }
}
