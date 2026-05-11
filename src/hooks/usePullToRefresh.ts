import { useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/haptics'

type Options = {
  /** The scroll container to listen on. PtR only fires when scrolled to top. */
  scrollRef: React.RefObject<HTMLElement | null>
  /** Disable entirely (e.g. when the screen is not visible / no user). */
  enabled?: boolean
  /** Called when the user releases past the threshold. May return a Promise. */
  onRefresh: () => void | Promise<void>
  /** Pixels of pull needed to trigger refresh (after damping). */
  threshold?: number
  /** Cap on visible pull distance after damping. */
  maxPullPx?: number
}

/**
 * Touch-driven pull-to-refresh. Designed to coexist with the capture-phase tab
 * swipe gesture: this listens at the bubble phase, so if the tab swipe engages
 * and `stopPropagation`s, we never fire. Vertical pulls (which the tab swipe
 * ignores because of its horizontal axis ratio) reach this normally.
 *
 * The hook returns the live pull offset (already dampened), a `refreshing`
 * flag, and a `pulling` flag so the caller can turn off animation transitions
 * while the finger is down.
 */
export function usePullToRefresh({
  scrollRef,
  enabled = true,
  onRefresh,
  threshold = 64,
  maxPullPx = 120,
}: Options) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [pulling, setPulling] = useState(false)

  // Latest callback in a ref so we don’t tear down the effect on every render.
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  const refreshingRef = useRef(refreshing)
  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  const pullYRef = useRef(0)
  useEffect(() => {
    pullYRef.current = pullY
  }, [pullY])

  useEffect(() => {
    if (!enabled) return
    const el = scrollRef.current
    if (!el) return

    let startY: number | null = null
    let startX: number | null = null
    let active = false
    let triggeredAtThreshold = false

    const reset = () => {
      startY = null
      startX = null
      active = false
      triggeredAtThreshold = false
    }

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      if (e.touches.length !== 1) return
      // Only arm if we’re at the very top — otherwise the user is just scrolling.
      if (el.scrollTop > 0) return
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      active = false
      triggeredAtThreshold = false
    }

    const onMove = (e: TouchEvent) => {
      if (startY == null || startX == null || e.touches.length !== 1) return
      const dy = e.touches[0].clientY - startY
      const dx = e.touches[0].clientX - startX

      if (!active) {
        // Need a small downward intent before we hijack the gesture.
        if (Math.abs(dx) > Math.abs(dy)) {
          reset()
          return
        }
        if (dy < 8) return
        if (el.scrollTop > 0) {
          reset()
          return
        }
        active = true
        setPulling(true)
      }

      if (dy <= 0) {
        // User pulled back up past origin — collapse but stay armed.
        setPullY(0)
        return
      }

      // Damped (sqrt) pull so it feels rubber-bandy near the threshold.
      const dampened = Math.min(maxPullPx, Math.sqrt(dy * 14))
      setPullY(dampened)
      if (!triggeredAtThreshold && dampened >= threshold) {
        triggeredAtThreshold = true
        haptic('light')
      } else if (triggeredAtThreshold && dampened < threshold) {
        // Slid back below; allow a re-trigger if they pull again.
        triggeredAtThreshold = false
      }

      // Stop the native overscroll bounce so our indicator owns the motion.
      e.preventDefault()
    }

    const onEnd = () => {
      const final = pullYRef.current
      setPulling(false)
      if (active && final >= threshold && !refreshingRef.current) {
        setRefreshing(true)
        setPullY(48)
        haptic('medium')
        Promise.resolve()
          .then(() => onRefreshRef.current())
          .catch((err) => console.error('pull to refresh', err))
          .finally(() => {
            setRefreshing(false)
            setPullY(0)
          })
      } else {
        setPullY(0)
      }
      reset()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [scrollRef, enabled, threshold, maxPullPx])

  return { pullY, refreshing, pulling }
}
