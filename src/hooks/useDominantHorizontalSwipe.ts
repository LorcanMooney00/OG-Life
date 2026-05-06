import { useCallback, useEffect, useRef } from 'react'

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

type LockingOptions = {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  minDistance?: number
  versusVerticalRatio?: number
  /** Movement (px) before axis is evaluated */
  axisLockSlop?: number
  enabled?: boolean
}

/**
 * Attaches non-passive touchmove so once a gesture is clearly horizontal,
 * the parent scroll view stops stealing it — needed inside overflow-y scroll regions.
 */
export function useLockingHorizontalSwipeRef({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 40,
  versusVerticalRatio = 1.12,
  axisLockSlop = 8,
  enabled = true,
}: LockingOptions) {
  const ref = useRef<HTMLDivElement>(null)
  const optsRef = useRef({
    onSwipeLeft,
    onSwipeRight,
    minDistance,
    versusVerticalRatio,
    axisLockSlop,
    enabled,
  })
  optsRef.current = {
    onSwipeLeft,
    onSwipeRight,
    minDistance,
    versusVerticalRatio,
    axisLockSlop,
    enabled,
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let start: { x: number; y: number } | null = null
    let lockedHorizontal = false

    const reset = () => {
      start = null
      lockedHorizontal = false
    }

    const onStart = (e: TouchEvent) => {
      const { enabled: on } = optsRef.current
      if (!on || e.touches.length !== 1) return
      lockedHorizontal = false
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    const onMove = (e: TouchEvent) => {
      const { enabled: on, versusVerticalRatio: ratio, axisLockSlop: slop } = optsRef.current
      if (!on || !start || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (lockedHorizontal) {
        e.preventDefault()
        return
      }
      if (Math.abs(dx) < slop && Math.abs(dy) < slop) return
      if (Math.abs(dx) >= Math.abs(dy) * ratio && Math.abs(dx) >= slop) {
        lockedHorizontal = true
        e.preventDefault()
      }
    }

    const onEnd = (e: TouchEvent) => {
      const {
        enabled: on,
        minDistance: minD,
        versusVerticalRatio: ratio,
        onSwipeLeft: left,
        onSwipeRight: right,
      } = optsRef.current
      if (!on || !start || e.changedTouches.length !== 1) {
        reset()
        return
      }
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const wasLocked = lockedHorizontal
      reset()
      if (Math.abs(dx) < minD) return
      if (!wasLocked && Math.abs(dx) < Math.abs(dy) * ratio) return
      if (dx < 0) left?.()
      else right?.()
    }

    const onCancel = () => reset()

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [])

  return ref
}
