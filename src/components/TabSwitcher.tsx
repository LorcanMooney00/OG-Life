import { useEffect, useMemo, useRef, useState } from 'react'
import { haptic } from '../lib/haptics'
import {
  anniversaryCountdownLabel,
  anniversaryEmoji,
  formatClockTime,
  formatLongDate,
  formatNextWhen,
  formatShortDayLabel,
  moodByHour,
  toYmd,
} from '../lib/date'
import {
  findNextOccurrence,
  findUpcomingAnniversaries,
  occurrencesOnDate,
} from '../lib/calendarOccurrences'
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
  // We point at the *wrapper* div for each card (not the button) because the
  // tilt/scale CSS vars live on `.tab-switcher-card`, which is the wrapper.
  const cardRefs = useRef<Record<SwitcherScreen, HTMLDivElement | null>>({
    calendar: null,
    home: null,
    shopping: null,
  })

  // Order matches the bottom nav: Calendar | Home | Shopping.
  const order: SwitcherScreen[] = useMemo(() => ['calendar', 'home', 'shopping'], [])

  // The card closest to the carousel’s centre. Drives the highlight ring +
  // shadow so the user gets a live "this is what I’m about to pick" signal as
  // they scroll. Defaults to whatever tab is actually open.
  const [focusedScreen, setFocusedScreen] = useState<SwitcherScreen>(current)
  // Mirror in a ref so the rAF scroll handler can compare against the latest
  // value without re-binding on every state change.
  const focusedRef = useRef<SwitcherScreen>(current)
  useEffect(() => {
    if (open) {
      setFocusedScreen(current)
      focusedRef.current = current
    }
  }, [open, current])

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

  // Live scale/depth: each card’s `--rest-scale` and `--rest-translate-y`
  // vars are recomputed from its distance to the scroller’s centre on every
  // scroll frame. No rotation — we want a deck-of-cards stack, not an
  // umbrella fan, so the off-centre cards stay parallel and just sit a touch
  // smaller and slightly lifted to imply depth.
  useEffect(() => {
    if (!open) return
    const scroller = scrollerRef.current
    if (!scroller) return

    let raf = 0
    const MAX_SCALE_DROP = 0.08 // 0.92 at extremes — card behind feels recessed
    const MAX_LIFT_PX = 10 // back cards rise a hair to peek over the front one

    const update = () => {
      const scrollerRect = scroller.getBoundingClientRect()
      const scrollerCenter = scrollerRect.left + scrollerRect.width / 2
      let nearestId: SwitcherScreen | null = null
      let nearestDist = Infinity
      for (const id of order) {
        const node = cardRefs.current[id]
        if (!node) continue
        const rect = node.getBoundingClientRect()
        const cardCenter = rect.left + rect.width / 2
        // Normalise by the wrapper’s un-transformed layout width so the math
        // stays stable as we scale the card (otherwise we’d feedback-loop).
        const baseWidth = node.offsetWidth || rect.width || 1
        const dx = cardCenter - scrollerCenter
        const tRaw = dx / baseWidth
        const tClamped = Math.max(-1, Math.min(1, tRaw))
        const absT = Math.abs(tClamped)
        const scale = 1 - absT * MAX_SCALE_DROP
        const liftY = -absT * MAX_LIFT_PX
        node.style.setProperty('--rest-scale', scale.toFixed(3))
        node.style.setProperty('--rest-translate-y', `${liftY.toFixed(1)}px`)
        const absDist = Math.abs(dx)
        if (absDist < nearestDist) {
          nearestDist = absDist
          nearestId = id
        }
      }
      // Promote the closest-to-centre card to "focused" so the ring/glow
      // follow the scroll. Only fire setState on transitions to keep this
      // out of React’s render loop on every frame.
      if (nearestId && nearestId !== focusedRef.current) {
        focusedRef.current = nearestId
        setFocusedScreen(nearestId)
        haptic('light')
      }
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }

    // First pass: wait two frames so the scroll-into-view above has executed
    // and the rise-in animation has had a chance to grab its starting vars.
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(update)
    })

    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [open, order])

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
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
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
            const isFocused = id === focusedScreen
            // Initial pose seeds — only used for the very first paint (before
            // the scroll handler has had a chance to compute live values).
            // The scroll effect above overwrites `--rest-scale` /
            // `--rest-translate-y` on rAF based on each card’s real distance
            // to the carousel centre, so the deck-of-cards stack tracks the
            // scroll smoothly. Anchor the seed pose to the *focused* card
            // (= currently centred), not the actually-open one, so the live
            // pose lines up with the highlight from the very first paint.
            const offset = i - order.indexOf(focusedScreen)
            const seedScale = offset === 0 ? 1 : 0.94
            const seedLiftY = offset === 0 ? 0 : -6
            // Cast lets us pass through custom CSS properties (`--rest-scale`,
            // `--rest-translate-y`) without fighting TypeScript over the index sig.
            const cardStyle = {
              animationDelay: `${i * 50}ms`,
              scrollSnapAlign: 'center',
              marginLeft: i === 0 ? '0px' : '-28px',
              // Focused card sits on top; neighbours stack behind it by
              // distance, so the centred one never gets clipped by overlap.
              zIndex: isFocused ? 30 : 20 - Math.abs(offset),
              '--rest-scale': String(seedScale),
              '--rest-translate-y': `${seedLiftY}px`,
            } as React.CSSProperties

            return (
              <div
                key={id}
                ref={(el) => {
                  cardRefs.current[id] = el
                }}
                className="tab-switcher-card flex-shrink-0"
                style={cardStyle}
              >
                <button
                  type="button"
                  onClick={() => handlePick(id)}
                  // active:brightness-90 replaces the previous active:scale —
                  // an extra transform on the button would compete with the
                  // wrapper’s scale/lift and snap the card out of position.
                  // Ring + shadow swap is on a CSS transition so the highlight
                  // glides on/off as the user scrolls past each card.
                  className={`relative flex h-[min(72vh,560px)] w-[min(78vw,300px)] flex-col overflow-hidden rounded-[24px] text-left ring-1 transition-[box-shadow,filter] duration-200 active:brightness-90 ${
                    isFocused
                      ? 'shadow-[0_24px_60px_rgba(245,158,11,0.35)] ring-amber-300/50'
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
                      calendarEvents={calendarEvents}
                    />
                  ) : (
                    <ShoppingPreview items={shoppingItems} />
                  )}
                  {isCurrent ? (
                    <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-amber-400/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 ring-1 ring-amber-300/40 backdrop-blur">
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
  tone?: 'plain' | 'warm'
}) {
  return (
    <div
      className={`flex h-full flex-col ${
        tone === 'warm'
          ? 'bg-gradient-to-br from-amber-500/35 via-[#1c1410] to-[#100c0d]'
          : 'bg-gradient-to-br from-[#1c1618] via-[#161214] to-[#100c0d]'
      }`}
    >
      <header className="border-b border-white/[0.06] px-4 pb-3 pt-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-amber-200/70">
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
  calendarEvents,
}: {
  today: Date
  heroGreeting: string
  todaysEvents: EventOccurrence[]
  upcomingEvents: EventOccurrence[]
  shoppingRemaining: number
  calendarEvents: CalendarEvent[]
  /** Kept in the parent prop shape for symmetry; unused here. */
  purchasedCount: number
}) {
  // Mirror the real Home: pull the same mood gradient, next-up occurrence
  // and anniversary list so the preview always reflects the live screen
  // rather than a baked-in stat-tile mockup.
  const mood = useMemo(() => moodByHour(today.getHours()), [today])
  const nextOccurrence = useMemo(
    () => findNextOccurrence(calendarEvents, today, 30),
    [calendarEvents, today],
  )
  const nextWhen = nextOccurrence
    ? formatNextWhen(nextOccurrence.date, nextOccurrence.event.eventTime, today)
    : null
  const upcomingAnniversaries = useMemo(
    () => findUpcomingAnniversaries(calendarEvents, today, 7),
    [calendarEvents, today],
  )

  return (
    <PreviewChrome eyebrow="HOME" title="Home" subtitle="Your quick dashboard">
      <div className="space-y-3">
        {/* Warm hero — same composition as the real one, scaled down to fit. */}
        <div
          className="relative overflow-hidden rounded-[12px] p-3 ring-1 ring-white/[0.08]"
          style={{
            background: `radial-gradient(110% 75% at 100% 0%, ${mood.accent}33 0%, transparent 55%), linear-gradient(135deg, ${mood.from}80 0%, ${mood.via}55 45%, ${mood.tint} 100%)`,
            boxShadow: `0 12px 28px -18px ${mood.from}80, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl"
            style={{ background: mood.from, opacity: 0.35 }}
          />
          <p
            className="relative text-[8px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: mood.accent }}
          >
            {formatLongDate(today)}
          </p>
          <p className="relative mt-0.5 truncate text-[14px] font-semibold text-white">
            {heroGreeting}
          </p>

          {/* Focus tile — Next up / On the list / All clear, like Home. */}
          {nextOccurrence && nextWhen ? (
            <div className="relative mt-2 rounded-[10px] bg-white/[0.10] px-2.5 py-2 ring-1 ring-white/[0.12] backdrop-blur">
              <p
                className="text-[8px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: mood.accent }}
              >
                Next up
              </p>
              <p className="mt-0.5 truncate text-[12px] font-semibold text-white">
                {nextOccurrence.event.title || 'Untitled'}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {nextWhen.countdown ? (
                  <span
                    className="rounded-full px-1.5 py-px text-[9px] font-semibold text-white"
                    style={{
                      background: `${mood.accent}40`,
                      boxShadow: `inset 0 0 0 1px ${mood.accent}55`,
                    }}
                  >
                    {nextWhen.countdown}
                  </span>
                ) : null}
                <span className="text-[9px] text-white/75">{nextWhen.when}</span>
              </div>
            </div>
          ) : shoppingRemaining > 0 ? (
            <div className="relative mt-2 rounded-[10px] bg-white/[0.10] px-2.5 py-2 ring-1 ring-white/[0.12] backdrop-blur">
              <p
                className="text-[8px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: mood.accent }}
              >
                On the list
              </p>
              <p className="mt-0.5 text-[12px] font-semibold text-white">
                {shoppingRemaining === 1
                  ? '1 item to grab'
                  : `${shoppingRemaining} items to grab`}
              </p>
            </div>
          ) : (
            <div className="relative mt-2 rounded-[10px] bg-white/[0.08] px-2.5 py-2 ring-1 ring-white/[0.10] backdrop-blur">
              <p
                className="text-[8px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: mood.accent }}
              >
                All clear
              </p>
              <p className="mt-0.5 text-[12px] font-semibold text-white">
                Nothing on the books.
              </p>
            </div>
          )}
        </div>

        {/* Anniversary mini-card — only when one or more land in the week. */}
        {upcomingAnniversaries.length > 0 ? (
          <div className="relative overflow-hidden rounded-[12px] p-[1px] ring-1 ring-amber-300/20">
            <div className="rounded-[11px] bg-gradient-to-br from-amber-500/25 via-[#1c1618] to-[#1c1618] p-2.5 ring-1 ring-white/[0.04]">
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-200/85">
                Coming up
              </p>
              <ul className="mt-1 space-y-1">
                {upcomingAnniversaries.slice(0, 2).map(({ occurrence, daysUntil, yearsSince }) => (
                  <li
                    key={occurrence.event.id + '::ann::' + occurrence.ymd}
                    className="flex items-center gap-1.5"
                  >
                    <span
                      aria-hidden
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] ring-1 ring-amber-300/30"
                    >
                      {anniversaryEmoji(occurrence.event.title)}
                    </span>
                    <span className="truncate text-[11px] font-medium text-white">
                      {occurrence.event.title || 'Anniversary'}
                    </span>
                    <span className="ml-auto flex-shrink-0 text-[9px] font-semibold text-amber-200">
                      {anniversaryCountdownLabel(daysUntil)}
                      {yearsSince > 0
                        ? ` · ${yearsSince}y`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {todaysEvents.length > 0 ? (
          <div className="rounded-[12px] bg-[#1c1618] p-3 ring-1 ring-white/[0.08]">
            <p className="text-[8px] uppercase tracking-[0.14em] text-white/55">
              Today
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {todaysEvents.slice(0, 3).map((o) => (
                <li
                  key={o.event.id + '::today'}
                  className="flex items-center gap-2"
                >
                  <span className="w-9 flex-shrink-0 text-[10px] font-semibold text-amber-200">
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
          <div className="rounded-[12px] bg-[#1c1618] p-3 ring-1 ring-white/[0.08]">
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
      tone="warm"
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
                    ? 'bg-amber-500 font-semibold text-white'
                    : 'text-white/80'
              }`}
            >
              {c.day ?? '·'}
              {isBusy && !isToday ? (
                <span
                  aria-hidden
                  className="absolute bottom-[2px] h-[3px] w-[3px] rounded-full bg-amber-300"
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
                <span className="w-9 flex-shrink-0 text-[10px] font-semibold text-amber-200">
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
            <div className="overflow-hidden rounded-[10px] bg-[#1c1618] ring-1 ring-white/[0.08]">
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
                <div className="border-t border-white/[0.06] px-2.5 py-1.5 text-[10px] text-amber-300/90">
                  +{active.length - previewActive.length} more
                </div>
              ) : null}
            </div>
          ) : null}

          {previewDone.length > 0 ? (
            <div className="overflow-hidden rounded-[10px] bg-[#1c1618]/70 ring-1 ring-white/[0.06]">
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
