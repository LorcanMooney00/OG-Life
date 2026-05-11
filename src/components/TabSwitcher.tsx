import { useEffect, useMemo, useRef } from 'react'
import { haptic } from '../lib/haptics'
import {
  formatClockTime,
  formatLongDate,
  formatShortDayLabel,
  toYmd,
} from '../lib/date'
import { occurrencesOnDate } from '../lib/calendarOccurrences'
import type { EventOccurrence } from '../lib/calendarOccurrences'
import type { CalendarEvent, ShoppingItem } from '../types'

export type SwitcherScreen = 'calendar' | 'home' | 'shopping'

type Props = {
  open: boolean
  current: SwitcherScreen
  /** Greeting line shown on the Home preview hero. */
  heroGreeting: string
  /** Today’s date — used by both Home and Calendar previews. */
  today: Date
  /** Number of unpurchased shopping items (for the Home hero stat tile). */
  shoppingRemaining: number
  /** Number of completed shopping items (for the Home hero stat tile). */
  purchasedCount: number
  /** Today’s expanded occurrences for the Home preview list + counts. */
  todaysEvents: EventOccurrence[]
  /** Next few upcoming occurrences for the Home preview list. */
  upcomingEvents: EventOccurrence[]
  /** All events visible in the dashboard window — used to dot the mini month grid. */
  calendarEvents: CalendarEvent[]
  /** Active shopping items in display order — used in the Shopping preview list. */
  shoppingItems: ShoppingItem[]
  onSelect: (screen: SwitcherScreen) => void
  onClose: () => void
}

/**
 * “Recents”-style switcher that shows mini previews of each tab. Long-press
 * anywhere in the main area opens it; tap a preview to jump to that tab; tap
 * the backdrop or hit Escape to dismiss without changing screens.
 *
 * The previews are hand-built stylised mockups (not literal screenshots) so we
 * stay cheap — no html2canvas, no offscreen renders. Real data is pulled in
 * from the existing dashboard slices so the cards reflect the actual state.
 */
export function TabSwitcher({
  open,
  current,
  heroGreeting,
  today,
  shoppingRemaining,
  purchasedCount,
  todaysEvents,
  upcomingEvents,
  calendarEvents,
  shoppingItems,
  onSelect,
  onClose,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Record<SwitcherScreen, HTMLButtonElement | null>>({
    calendar: null,
    home: null,
    shopping: null,
  })

  // Order matches the bottom nav: Calendar | Home | Shopping.
  const order: SwitcherScreen[] = useMemo(() => ['calendar', 'home', 'shopping'], [])

  // Keyboard escape — small accessibility win on desktop and connected keyboards.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock body scroll while open so the page doesn’t jiggle behind the overlay.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // On open, snap the carousel to the currently-active card.
  useEffect(() => {
    if (!open) return
    const node = cardRefs.current[current]
    if (node) {
      // Use rAF so the layout has settled before we scroll.
      requestAnimationFrame(() => {
        node.scrollIntoView({
          behavior: 'instant' as ScrollBehavior,
          inline: 'center',
          block: 'nearest',
        })
      })
    }
  }, [open, current])

  if (!open) return null

  const handlePick = (screen: SwitcherScreen) => {
    haptic('light')
    if (screen !== current) onSelect(screen)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/65 backdrop-blur-md tab-switcher-enter"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a tab"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <header
        className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-indigo-200/80">
          Switch tab
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/[0.08] px-3 py-1 text-[12px] font-medium text-white/85 ring-1 ring-white/[0.08] active:bg-white/[0.14]"
        >
          Cancel
        </button>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div
          className="flex h-full items-center"
          style={{
            paddingLeft: 'max(2rem, calc(50vw - 9rem))',
            paddingRight: 'max(2rem, calc(50vw - 9rem))',
          }}
        >
          {order.map((id, i) => {
            const isCurrent = id === current
            // Stacked-deck pose: cards lean toward the currently-open tab and
            // overlap each other by ~10% of their width. The 100% keyframe of
            // `.tab-switcher-card` reads these vars, so the rise-in animation
            // settles directly into the rest pose without a second transition.
            const offset = i - order.indexOf(current)
            const tilt = offset === 0 ? 0 : offset < 0 ? 4 : -4
            const scale = offset === 0 ? 1 : 0.94
            // Cast lets us pass through custom CSS properties (`--rest-rotate`,
            // `--rest-scale`) without fighting TypeScript over the index sig.
            const cardStyle = {
              animationDelay: `${i * 50}ms`,
              scrollSnapAlign: 'center',
              marginLeft: i === 0 ? '0px' : '-28px',
              zIndex: isCurrent ? 30 : 20 - Math.abs(offset),
              '--rest-rotate': `${tilt}deg`,
              '--rest-scale': String(scale),
            } as React.CSSProperties

            return (
              <div
                key={id}
                className="tab-switcher-card flex-shrink-0"
                style={cardStyle}
              >
                <button
                  ref={(el) => {
                    cardRefs.current[id] = el
                  }}
                  type="button"
                  onClick={() => handlePick(id)}
                  // active:brightness-95 replaces the previous active:scale —
                  // an extra transform on the button would compete with the
                  // wrapper’s tilt/scale and snap the card out of position.
                  className={`relative flex h-[min(72vh,560px)] w-[min(78vw,300px)] flex-col overflow-hidden rounded-[24px] text-left ring-1 transition-[filter] duration-150 active:brightness-90 ${
                    isCurrent
                      ? 'shadow-[0_24px_60px_rgba(79,70,229,0.35)] ring-indigo-300/50'
                      : 'shadow-[0_18px_40px_rgba(0,0,0,0.45)] ring-white/[0.1]'
                  }`}
                >
                  {id === 'calendar' ? (
                    <CalendarPreview today={today} events={calendarEvents} />
                  ) : id === 'home' ? (
                    <HomePreview
                      today={today}
                      heroGreeting={heroGreeting}
                      todaysEvents={todaysEvents}
                      upcomingEvents={upcomingEvents}
                      shoppingRemaining={shoppingRemaining}
                      purchasedCount={purchasedCount}
                    />
                  ) : (
                    <ShoppingPreview items={shoppingItems} />
                  )}
                  {isCurrent ? (
                    <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-indigo-400/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100 ring-1 ring-indigo-300/40 backdrop-blur">
                      Open
                    </span>
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <p
        className="px-6 pb-1 pt-4 text-center text-[12px] text-white/40"
        onClick={(e) => e.stopPropagation()}
      >
        Swipe sideways · tap a card to switch
      </p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Mini previews — small stylised mockups of each real screen.              */
/* ──────────────────────────────────────────────────────────────────────── */

function PreviewChrome({
  eyebrow,
  title,
  subtitle,
  children,
  tone = 'plain',
}: {
  eyebrow: string
  title: string
  subtitle?: string
  children: React.ReactNode
  tone?: 'plain' | 'indigo'
}) {
  return (
    <div
      className={`flex h-full flex-col ${
        tone === 'indigo'
          ? 'bg-gradient-to-br from-indigo-500/35 via-[#101013] to-[#0c0c10]'
          : 'bg-gradient-to-br from-[#1c1c1e] via-[#141416] to-[#0c0c10]'
      }`}
    >
      <header className="border-b border-white/[0.06] px-4 pb-3 pt-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-indigo-200/70">
          OG Life · {eyebrow}
        </p>
        <h3 className="mt-1 text-[17px] font-semibold leading-tight text-white">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-white/50">{subtitle}</p>
        ) : null}
      </header>
      <div className="flex-1 overflow-hidden p-4">{children}</div>
    </div>
  )
}

function HomePreview({
  today,
  heroGreeting,
  todaysEvents,
  upcomingEvents,
  shoppingRemaining,
  purchasedCount,
}: {
  today: Date
  heroGreeting: string
  todaysEvents: EventOccurrence[]
  upcomingEvents: EventOccurrence[]
  shoppingRemaining: number
  purchasedCount: number
}) {
  return (
    <PreviewChrome eyebrow="HOME" title="Home" subtitle="Your quick dashboard">
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-[12px] bg-gradient-to-br from-indigo-500/25 via-[#1c1c1e] to-[#1c1c1e] p-3 ring-1 ring-white/[0.08]">
          <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-indigo-200/80">
            {formatLongDate(today)}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-white">
            {heroGreeting}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-[8px] bg-white/[0.05] p-2 ring-1 ring-white/[0.05]">
              <p className="text-[8px] uppercase tracking-wide text-white/55">
                Upcoming
              </p>
              <p className="text-[18px] font-semibold leading-none text-white">
                {todaysEvents.length + upcomingEvents.length}
              </p>
            </div>
            <div className="rounded-[8px] bg-white/[0.05] p-2 ring-1 ring-white/[0.05]">
              <p className="text-[8px] uppercase tracking-wide text-white/55">
                Shopping
              </p>
              <p className="text-[18px] font-semibold leading-none text-white">
                {shoppingRemaining}
              </p>
              {purchasedCount > 0 ? (
                <p className="text-[8px] text-white/45">
                  {purchasedCount} done
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {todaysEvents.length > 0 ? (
          <div className="rounded-[12px] bg-[#1c1c1e] p-3 ring-1 ring-white/[0.08]">
            <p className="text-[8px] uppercase tracking-[0.14em] text-white/55">
              Today
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {todaysEvents.slice(0, 3).map((o) => (
                <li
                  key={o.event.id + '::today'}
                  className="flex items-center gap-2"
                >
                  <span className="w-9 flex-shrink-0 text-[10px] font-semibold text-indigo-200">
                    {formatClockTime(o.event.eventTime) ?? 'Day'}
                  </span>
                  <span className="truncate text-[11px] text-white">
                    {o.event.title || 'Untitled'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : upcomingEvents.length > 0 ? (
          <div className="rounded-[12px] bg-[#1c1c1e] p-3 ring-1 ring-white/[0.08]">
            <p className="text-[8px] uppercase tracking-[0.14em] text-white/55">
              Coming up
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {upcomingEvents.slice(0, 3).map((o) => (
                <li
                  key={o.event.id + '::up'}
                  className="flex items-center gap-2"
                >
                  <span className="w-11 flex-shrink-0 text-[10px] font-semibold text-white/75">
                    {formatShortDayLabel(o.date)}
                  </span>
                  <span className="truncate text-[11px] text-white">
                    {o.event.title || 'Untitled'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </PreviewChrome>
  )
}

function CalendarPreview({
  today,
  events,
}: {
  today: Date
  events: CalendarEvent[]
}) {
  const year = today.getFullYear()
  const month = today.getMonth()
  const monthName = today.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const firstWeekday = new Date(year, month, 1).getDay() // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayYmd = toYmd(today)

  // Build a set of "busy" YYYY-MM-DD strings for the current month based on
  // expanded recurrences. Skips heavy work — uses the existing helper.
  const busyDays = useMemo(() => {
    const set = new Set<string>()
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const occ = occurrencesOnDate(events, date)
      if (occ.length > 0) set.add(toYmd(date))
    }
    return set
  }, [events, year, month, daysInMonth])

  const cells: Array<{ day: number | null; ymd?: string }> = []
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, ymd: toYmd(new Date(year, month, d)) })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null })
  // Limit to 6 rows so the preview never grows out of the card.
  const rows = Math.min(6, cells.length / 7)
  const visible = cells.slice(0, rows * 7)

  const todaysOcc = occurrencesOnDate(events, today)

  return (
    <PreviewChrome
      eyebrow="CALENDAR"
      title="Calendar"
      subtitle={monthName}
      tone="indigo"
    >
      <div className="grid grid-cols-7 gap-[3px] text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span
            key={`dh-${i}`}
            className="text-[8px] font-semibold uppercase text-white/40"
          >
            {d}
          </span>
        ))}
        {visible.map((c, i) => {
          const isToday = c.ymd === todayYmd
          const isBusy = c.ymd ? busyDays.has(c.ymd) : false
          return (
            <div
              key={`c-${i}`}
              className={`relative flex aspect-square items-center justify-center rounded-[5px] text-[9px] ${
                c.day == null
                  ? 'text-transparent'
                  : isToday
                    ? 'bg-indigo-500 font-semibold text-white'
                    : 'text-white/80'
              }`}
            >
              {c.day ?? '·'}
              {isBusy && !isToday ? (
                <span
                  aria-hidden
                  className="absolute bottom-[2px] h-[3px] w-[3px] rounded-full bg-indigo-300"
                />
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-3 rounded-[10px] bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06]">
        <p className="text-[8px] uppercase tracking-[0.14em] text-white/55">
          {todaysOcc.length > 0
            ? `Today · ${todaysOcc.length} event${todaysOcc.length === 1 ? '' : 's'}`
            : 'Today'}
        </p>
        {todaysOcc.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {todaysOcc.slice(0, 2).map((o) => (
              <li key={o.event.id + '::cp'} className="flex items-center gap-2">
                <span className="w-9 flex-shrink-0 text-[10px] font-semibold text-indigo-200">
                  {formatClockTime(o.event.eventTime) ?? 'Day'}
                </span>
                <span className="truncate text-[11px] text-white">
                  {o.event.title || 'Untitled'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-white/55">Nothing scheduled.</p>
        )}
      </div>
    </PreviewChrome>
  )
}

function ShoppingPreview({ items }: { items: ShoppingItem[] }) {
  const active = items.filter((i) => !i.purchased)
  const done = items.filter((i) => i.purchased)
  const previewActive = active.slice(0, 4)
  const previewDone = done.slice(0, 2)

  return (
    <PreviewChrome
      eyebrow="SHOPPING"
      title="Shopping list"
      subtitle={
        active.length === 0
          ? 'Cart is empty'
          : `${active.length} to grab${done.length > 0 ? ` · ${done.length} done` : ''}`
      }
    >
      {active.length === 0 && done.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-[12px] text-white/50">Nothing on the list yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {previewActive.length > 0 ? (
            <div className="overflow-hidden rounded-[10px] bg-[#1c1c1e] ring-1 ring-white/[0.08]">
              {previewActive.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 px-2.5 py-2 ${
                    idx > 0 ? 'border-t border-white/[0.06]' : ''
                  }`}
                >
                  <span className="h-3 w-3 flex-shrink-0 rounded-full border-[1.5px] border-white/30" />
                  <span className="truncate text-[12px] text-white">
                    {item.name}
                  </span>
                  {item.quantity ? (
                    <span className="ml-auto flex-shrink-0 rounded-full bg-white/[0.08] px-1.5 py-px text-[9px] text-white/65">
                      {item.quantity}
                    </span>
                  ) : null}
                </div>
              ))}
              {active.length > previewActive.length ? (
                <div className="border-t border-white/[0.06] px-2.5 py-1.5 text-[10px] text-indigo-300/90">
                  +{active.length - previewActive.length} more
                </div>
              ) : null}
            </div>
          ) : null}

          {previewDone.length > 0 ? (
            <div className="overflow-hidden rounded-[10px] bg-[#1c1c1e]/70 ring-1 ring-white/[0.06]">
              {previewDone.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 ${
                    idx > 0 ? 'border-t border-white/[0.04]' : ''
                  }`}
                >
                  <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full bg-[#30d158] text-[7px] text-white">
                    ✓
                  </span>
                  <span className="truncate text-[11px] text-white/55 line-through">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </PreviewChrome>
  )
}
