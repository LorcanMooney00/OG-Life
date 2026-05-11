import { useCallback, useEffect, useRef, useState } from 'react'

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

type SwipeGestureOptions = {
  onNext?: () => void
  onPrev?: () => void
  enabled?: boolean
  /** Horizontal distance before the pop engages when not in long-press mode (px) */
  engagementDistance?: number
  /** Drag distance during scrub before release commits a tab change (px) */
  commitDistance?: number
  /** Horizontal dominance required vs vertical motion (1.0 = equal) */
  axisRatio?: number
  /**
   * If > 0, the user must hold still for this many ms before scrub engages.
   * Use on screens that already have inner horizontal gestures (calendar month nav,
   * shopping list/add swipe) so quick swipes still belong to those views and only a
   * deliberate hold takes over for tab switching.
   */
  longPressMs?: number
  /** Pre-engage movement allowed before we cancel the long-press timer (px) */
  longPressSlop?: number
}

/**
 * Tab swipe with optional “press a moment, then drag” engagement.
 *  - longPressMs === 0: horizontal drag past `engagementDistance` engages immediately
 *    (good on the Home screen where there’s no competing gesture).
 *  - longPressMs > 0: a still hold for that long engages; any motion before then
 *    cancels the hold so inner gestures (e.g. CalendarView month-swipe) work as usual.
 *
 * Touchmove/end are captured at the capture phase so once we engage we can
 * stopPropagation and prevent inner swipe hooks from also firing on the same release.
 */
export function useTabSwipeGesture({
  onNext,
  onPrev,
  enabled = true,
  engagementDistance = 18,
  commitDistance = 56,
  axisRatio = 1.35,
  longPressMs = 0,
  longPressSlop = 10,
}: SwipeGestureOptions) {
  const rootRef = useRef<HTMLElement | null>(null)
  const innerRef = useRef<HTMLElement | null>(null)
  const [scrubbing, setScrubbing] = useState(false)

  const optsRef = useRef({
    onNext,
    onPrev,
    enabled,
    engagementDistance,
    commitDistance,
    axisRatio,
    longPressMs,
    longPressSlop,
  })
  optsRef.current = {
    onNext,
    onPrev,
    enabled,
    engagementDistance,
    commitDistance,
    axisRatio,
    longPressMs,
    longPressSlop,
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let start: { x: number; y: number } | null = null
    let engaged = false
    let currentDx = 0
    let holdTimer: number | null = null

    const applyScrubTransform = (dx: number) => {
      const inner = innerRef.current
      if (!inner) return
      const drift = Math.max(Math.min(dx, 220), -220)
      const rot = drift / 80
      inner.style.transform = `translate3d(${drift}px, 0, 0) rotate(${rot}deg) scale(0.94)`
    }

    const clearScrubTransform = () => {
      const inner = innerRef.current
      if (!inner) return
      inner.style.transition = 'transform 220ms cubic-bezier(0.2,0.7,0.2,1)'
      inner.style.transform = ''
      const cleanup = () => {
        inner.style.transition = ''
        inner.removeEventListener('transitionend', cleanup)
      }
      inner.addEventListener('transitionend', cleanup)
    }

    const cancelHoldTimer = () => {
      if (holdTimer != null) {
        clearTimeout(holdTimer)
        holdTimer = null
      }
    }

    const engage = (dx: number) => {
      engaged = true
      setScrubbing(true)
      try {
        navigator.vibrate?.(8)
      } catch {
        /* not all devices support haptics */
      }
      applyScrubTransform(dx)
    }

    const onTouchStart = (e: TouchEvent) => {
      const { enabled: on, longPressMs: dur } = optsRef.current
      if (!on || e.touches.length !== 1) return
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      engaged = false
      currentDx = 0
      cancelHoldTimer()
      if (dur > 0) {
        holdTimer = window.setTimeout(() => {
          engage(0)
          holdTimer = null
        }, dur)
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const {
        engagementDistance: slop,
        axisRatio: ratio,
        longPressMs: dur,
        longPressSlop: holdSlop,
      } = optsRef.current

      if (engaged) {
        e.preventDefault()
        e.stopPropagation()
        currentDx = dx
        applyScrubTransform(dx)
        return
      }

      // Hold-mode: any motion past a small slop cancels the long-press so inner
      // swipe gestures (month nav, list/add) keep working normally.
      if (dur > 0) {
        if (Math.abs(dx) > holdSlop || Math.abs(dy) > holdSlop) {
          cancelHoldTimer()
          start = null
        }
        return
      }

      // Immediate-mode: engage once the gesture is clearly horizontal.
      if (Math.abs(dx) >= slop && Math.abs(dx) >= Math.abs(dy) * ratio) {
        engage(dx)
        e.preventDefault()
        e.stopPropagation()
        currentDx = dx
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      cancelHoldTimer()
      if (engaged) {
        e.stopPropagation()
        const { onNext: next, onPrev: prev, commitDistance: commit } = optsRef.current
        let direction: 'next' | 'prev' | null = null
        if (currentDx <= -commit) direction = 'next'
        else if (currentDx >= commit) direction = 'prev'

        engaged = false
        setScrubbing(false)
        clearScrubTransform()
        if (direction === 'next') next?.()
        else if (direction === 'prev') prev?.()
      }
      start = null
      currentDx = 0
    }

    const onTouchCancel = () => {
      cancelHoldTimer()
      if (engaged) {
        engaged = false
        setScrubbing(false)
        clearScrubTransform()
      }
      start = null
      currentDx = 0
    }

    root.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
    root.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })
    root.addEventListener('touchcancel', onTouchCancel, { passive: true, capture: true })

    return () => {
      root.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions)
      root.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions)
      root.removeEventListener('touchend', onTouchEnd, { capture: true } as EventListenerOptions)
      root.removeEventListener('touchcancel', onTouchCancel, { capture: true } as EventListenerOptions)
      cancelHoldTimer()
    }
  }, [])

  return { rootRef, innerRef, scrubbing }
}
