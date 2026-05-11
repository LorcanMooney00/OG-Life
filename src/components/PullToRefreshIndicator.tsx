type Props = {
  /** Visible pull distance in pixels (already dampened by the hook). */
  pullY: number
  /** True while the async refresh callback is running. */
  refreshing: boolean
  /** True while the user’s finger is down — disables animation so we track 1:1. */
  pulling: boolean
}

/**
 * Small iOS-style pull-to-refresh indicator. Sits absolutely at the top of the
 * scroll container; the parent scrolls/translates the content beneath it.
 *
 * Visual rules:
 *  - opacity scales with pull progress up to the trigger threshold (~64px).
 *  - rotation tracks pull progress so the user feels their pull is engaging
 *    the indicator.
 *  - while `refreshing`, we apply a continuous spin via Tailwind `animate-spin`.
 */
export function PullToRefreshIndicator({ pullY, refreshing, pulling }: Props) {
  const visible = pullY > 0 || refreshing
  // Cap the visible translate so the spinner doesn’t fly off-screen.
  const translate = refreshing ? 28 : Math.min(pullY - 24, 96)
  // 0..1 progress used to fade in and rotate the chevron.
  const progress = Math.min(1, pullY / 64)
  const rotate = refreshing ? 0 : progress * 270

  return (
    <div
      aria-hidden={!refreshing}
      role={refreshing ? 'status' : undefined}
      className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2"
      style={{
        transform: `translate(-50%, ${translate}px)`,
        opacity: visible ? Math.max(progress, refreshing ? 1 : 0) : 0,
        transition:
          pulling || refreshing
            ? 'none'
            : 'transform 260ms cubic-bezier(0.2,0.7,0.2,1), opacity 180ms linear',
      }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1c1618] text-amber-300 ring-1 ring-white/[0.08] shadow-lg"
        style={{
          transform: `rotate(${rotate}deg)`,
          transition: pulling || refreshing ? 'none' : 'transform 220ms cubic-bezier(0.2,0.7,0.2,1)',
        }}
      >
        <svg
          className={refreshing ? 'animate-spin' : ''}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {refreshing ? (
            <>
              <path d="M21 12a9 9 0 1 1-3.2-6.9" opacity="0.9" />
              <path d="M21 4v5h-5" />
            </>
          ) : (
            <>
              <path d="M12 5v14" />
              <path d="M6 13l6 6 6-6" />
            </>
          )}
        </svg>
      </div>
    </div>
  )
}
