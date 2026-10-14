import type { CSSProperties } from 'react'

export type AnchorPos = { x: number; y: number } | null

export function captureClickPos(event: unknown): AnchorPos {
  const currentTarget = (event as { currentTarget?: EventTarget | null } | null)?.currentTarget
  if (!(currentTarget instanceof HTMLElement)) return null
  const rect = currentTarget.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export function computePopupStyle(
  pos: AnchorPos,
  popupWidth: number,
  popupHeight: number,
): CSSProperties {
  if (!pos) return {}
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844
  const left = Math.max(16, Math.min(pos.x - popupWidth / 2, vw - popupWidth - 16))
  const top = Math.max(16, Math.min(pos.y - popupHeight / 2, vh - popupHeight - 16))
  return { left, top }
}
