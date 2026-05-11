/**
 * Lightweight loading placeholders. The grey blocks pulse via Tailwind’s
 * `animate-pulse` (already part of the default theme) so we don’t need a
 * dedicated CSS keyframe.
 */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-white/[0.06] ${className}`} />
}

/** Mirrors the shape of ShoppingListView’s list page (tab pills + search + rows). */
export function ShoppingSkeleton() {
  return (
    <div className="ios-font animate-pulse space-y-4" aria-hidden>
      <div className="flex items-center justify-center gap-2 pt-0.5">
        <div className="h-9 w-16 rounded-full bg-white/[0.06]" />
        <div className="h-9 w-16 rounded-full bg-white/[0.06]" />
      </div>
      <div className="h-11 rounded-[10px] bg-[#26201f]/60 ring-1 ring-white/[0.08]" />
      <Bar className="h-3 w-20" />
      <div className="overflow-hidden rounded-[10px] bg-[#26201f] ring-1 ring-white/[0.08]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-4 py-3 ${
              i > 0 ? 'border-t border-white/[0.04]' : ''
            }`}
          >
            <div className="h-[22px] w-[22px] flex-shrink-0 rounded-full bg-white/[0.06]" />
            <div className="flex-1 space-y-2">
              <Bar className={`h-3.5 ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
              <Bar className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mirrors CalendarView: header + 6-row grid + day list. */
export function CalendarSkeleton() {
  return (
    <div className="ios-font animate-pulse space-y-4" aria-hidden>
      <div className="flex items-center justify-between">
        <Bar className="h-8 w-8 rounded-full" />
        <Bar className="h-5 w-32" />
        <Bar className="h-8 w-8 rounded-full" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Bar key={`hdr-${i}`} className="h-3" />
        ))}
        {Array.from({ length: 42 }).map((_, i) => (
          <Bar key={`d-${i}`} className="h-10" />
        ))}
      </div>
      <Bar className="h-3 w-24" />
      <div className="overflow-hidden rounded-[10px] bg-[#26201f] ring-1 ring-white/[0.08]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 px-4 py-3 ${
              i > 0 ? 'border-t border-white/[0.04]' : ''
            }`}
          >
            <Bar className="h-4 w-14" />
            <div className="flex-1 space-y-2">
              <Bar className="h-4 w-2/3" />
              <Bar className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
