import { useCallback, useRef } from 'react'

type Options = {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  /** Minimum horizontal travel (px) */
  minDistance?: number
  /** Horizontal delta must exceed vertical * ratio */
  versusVerticalRatio?: number
}

/**
 * Fires when a touch ends with a mostly-horizontal gesture (works alongside vertical scroll).
 */
export function useDominantHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 56,
  versusVerticalRatio = 1.35,
}: Options) {
  const origin = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    origin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!origin.current || e.changedTouches.length !== 1) {
        origin.current = null
        return
      }
      const t = e.changedTouches[0]
      const dx = t.clientX - origin.current.x
      const dy = t.clientY - origin.current.y
      origin.current = null
      if (Math.abs(dx) < minDistance) return
      if (Math.abs(dx) < Math.abs(dy) * versusVerticalRatio) return
      if (dx < 0) onSwipeLeft?.()
      else onSwipeRight?.()
    },
    [minDistance, onSwipeLeft, onSwipeRight, versusVerticalRatio],
  )

  const onTouchCancel = useCallback(() => {
    origin.current = null
  }, [])

  return { onTouchStart, onTouchEnd, onTouchCancel }
}
