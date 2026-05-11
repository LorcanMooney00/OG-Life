import { useCallback, useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/haptics'

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

type SwipeGestureOptions = {
  onNext?: () => void
  onPrev?: () => void
  /**
   * Fires when the user holds still for `longPressMs`. If provided, the hold
   * does NOT engage scrub — call sites can show their own switcher UI instead.
   * Leave undefined to fall back to legacy hold-then-scrub behaviour.
   */
  onLongPress?: () => void
  enabled?: boolean
  /** Horizontal distance before scrub engages on an immediate drag (px). */
  engagementDistance?: number
  /** Drag distance during scrub before release commits a tab change (px). */
  commitDistance?: number
  /** Horizontal dominance required vs vertical motion (1.0 = equal). */
  axisRatio?: number
  /**
   * If > 0, arm a hold timer of this duration; on expiry, fire `onLongPress`
   * (or engage scrub if no `onLongPress` is supplied — legacy behaviour).
   * Any motion before the timer fires cancels it, so inner gestures still work.
   */
  longPressMs?: number
  /** Pre-engage movement allowed before we cancel the long-press timer (px). */
  longPressSlop?: number
  /**
   * If true, a clearly horizontal drag past `engagementDistance` engages scrub
   * immediately (separate from the long-press path). Use on screens with no
   * inner horizontal gesture (e.g. Home) so quick swipes still switch tabs.
   */
  immediateDrag?: boolean
}

/**
 * Tab swipe with two independent engagement paths:
 *  - LONG-PRESS path: when `longPressMs > 0`, a still hold fires `onLongPress`
 *    (modern UX — usually opens a tab switcher) or, if no callback is given,
 *    engages the scrub-to-switch animation (legacy fallback).
 *  - DRAG path: when `immediateDrag === true`, a horizontal drag past the
 *    engagement threshold puts the screen into scrub-to-switch mode regardless
 *    of any hold timer.
 *
 * Set just one path (Cal/Shop: long-press only) or both (Home: long-press to
 * open switcher AND horizontal drag for quick adjacent-tab swipe).
 *
 * Touchmove/end run at the capture phase so once we engage scrub we can
 * stopPropagation and prevent inner swipe hooks from firing on the same release.
 */
export function useTabSwipeGesture({
  onNext,
  onPrev,
  onLongPress,
  enabled = true,
  engagementDistance = 18,
  commitDistance = 56,
  axisRatio = 1.35,
  longPressMs = 0,
  longPressSlop = 10,
  immediateDrag = false,
}: SwipeGestureOptions) {
  const rootRef = useRef<HTMLElement | null>(null)
  const innerRef = useRef<HTMLElement | null>(null)
  const [scrubbing, setScrubbing] = useState(false)

  const optsRef = useRef({
    onNext,
    onPrev,
    onLongPress,
    enabled,
    engagementDistance,
    commitDistance,
    axisRatio,
    longPressMs,
    longPressSlop,
    immediateDrag,
  })
  optsRef.current = {
    onNext,
    onPrev,
    onLongPress,
    enabled,
    engagementDistance,
    commitDistance,
    axisRatio,
    longPressMs,
    longPressSlop,
    immediateDrag,
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
      haptic('light')
      applyScrubTransform(dx)
    }

    const onTouchStart = (e: TouchEvent) => {
      const { enabled: on, longPressMs: dur, onLongPress: lp } = optsRef.current
      if (!on || e.touches.length !== 1) return
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      engaged = false
      currentDx = 0
      cancelHoldTimer()
      if (dur > 0) {
        holdTimer = window.setTimeout(() => {
          holdTimer = null
          if (lp) {
            // Modern path: hand off to the caller (e.g. open a tab switcher).
            // We deliberately don’t engage scrub so the gesture finishes here.
            haptic('medium')
            lp()
            start = null
          } else {
            // Legacy path: hold engages the scrub-to-drag animation.
            engage(0)
          }
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
        immediateDrag: drag,
      } = optsRef.current

      if (engaged) {
        e.preventDefault()
        e.stopPropagation()
        currentDx = dx
        applyScrubTransform(dx)
        return
      }

      // Any motion past the hold slop cancels the long-press timer so inner
      // swipe gestures (month nav, list/add) keep working normally.
      if (dur > 0 && (Math.abs(dx) > holdSlop || Math.abs(dy) > holdSlop)) {
        cancelHoldTimer()
        if (!drag) {
          // Long-press-only screen: hand control back to inner gestures.
          start = null
          return
        }
      }

      // Drag path: engage once the gesture is clearly horizontal.
      if (drag && Math.abs(dx) >= slop && Math.abs(dx) >= Math.abs(dy) * ratio) {
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
        if (direction === 'next' || direction === 'prev') haptic('medium')
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
