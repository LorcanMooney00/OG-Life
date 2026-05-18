import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarView } from './components/CalendarView'
import { useTabSwipeGesture } from './hooks/useDominantHorizontalSwipe'
import { usePullToRefresh } from './hooks/usePullToRefresh'
import { ShoppingListView } from './components/ShoppingListView'
import { CalendarSkeleton, ShoppingSkeleton } from './components/Skeletons'
import { PullToRefreshIndicator } from './components/PullToRefreshIndicator'
import { TabSwitcher } from './components/TabSwitcher'
import { useInstallPrompt } from './contexts/InstallPromptContext'
import { useAuth } from './lib/auth'
import { displayQuantity } from './lib/shoppingDisplay'
import {
  anniversaryCountdownLabel,
  anniversaryEmoji,
  formatClockTime,
  formatLongDate,
  formatNextWhen,
  formatShortDayLabel,
  greetingByHour,
  moodByHour,
  toYmd,
} from './lib/date'
import {
  findNextOccurrence,
  findUpcomingAnniversaries,
  nextUpcomingOccurrences,
  occurrencesOnDate,
} from './lib/calendarOccurrences'
import {
  fetchCalendarEventsForDashboard,
  fetchCalendarEventsForMonth,
  fetchShoppingItems,
  persistCalendarChange,
  persistShoppingChange,
} from './lib/supabaseData'
import { supabase } from './lib/supabaseClient'
import type { CalendarEvent, ShoppingItem } from './types'

type Tab = 'calendar' | 'shopping'
type Screen = 'home' | Tab

// Visual order left → right: Calendar | Home | Shopping. Drives swipe direction.
const SCREEN_ORDER: Screen[] = ['calendar', 'home', 'shopping']

export default function OgLifeApp() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const { deferred, promptInstall, dismissDeferred, installMessage, clearInstallMessage } =
    useInstallPrompt()
  const [screen, setScreen] = useState<Screen>('home')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [dashboardEvents, setDashboardEvents] = useState<CalendarEvent[]>([])
  const [shopping, setShopping] = useState<ShoppingItem[]>([])
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date()
    return { y: n.getFullYear(), m: n.getMonth() }
  })
  const [syncNote, setSyncNote] = useState<string | null>(null)
  // Per-resource initial-load flags: drive the skeleton placeholders. We only
  // show skeletons on the *first* load — subsequent fetches (month changes,
  // refreshes) keep the old data on screen to avoid jarring flashes.
  const [shoppingLoaded, setShoppingLoaded] = useState(false)
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [dashboardLoaded, setDashboardLoaded] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)

  useLayoutEffect(() => {
    const tab = searchParams.get('screen')
    if (tab === 'shopping' || tab === 'calendar' || tab === 'home') {
      setScreen(tab)
      const next = new URLSearchParams(searchParams)
      next.delete('screen')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const userId = user?.id

  useEffect(() => {
    if (!supabase || !userId) return

    let cancelled = false
    ;(async () => {
      try {
        const evs = await fetchCalendarEventsForMonth(
          supabase,
          calendarMonth.y,
          calendarMonth.m,
        )
        if (!cancelled) setEvents(evs)
      } catch (e) {
        console.error(e)
        if (!cancelled) setSyncNote('Could not load calendar. Check your connection.')
      } finally {
        if (!cancelled) setEventsLoaded(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, calendarMonth.y, calendarMonth.m])

  useEffect(() => {
    if (!supabase || !userId) return

    let cancelled = false
    ;(async () => {
      try {
        const items = await fetchShoppingItems(supabase)
        if (!cancelled) setShopping(items)
      } catch (e) {
        console.error(e)
        if (!cancelled) setSyncNote('Could not load shopping list.')
      } finally {
        if (!cancelled) setShoppingLoaded(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId) return

    let cancelled = false
    ;(async () => {
      try {
        const evs = await fetchCalendarEventsForDashboard(supabase)
        if (!cancelled) setDashboardEvents(evs)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setDashboardLoaded(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  const onVisibleMonthChange = useCallback((year: number, monthIndex: number) => {
    setCalendarMonth((prev) =>
      prev.y === year && prev.m === monthIndex ? prev : { y: year, m: monthIndex },
    )
  }, [])

  // Pull-to-refresh: re-pulls everything that powers the current screen. We
  // settle.allSettled so a single failing fetch doesn’t skip the others.
  const refreshAll = useCallback(async () => {
    if (!supabase || !userId) return
    await Promise.allSettled([
      fetchCalendarEventsForMonth(supabase, calendarMonth.y, calendarMonth.m).then(setEvents),
      fetchCalendarEventsForDashboard(supabase).then(setDashboardEvents),
      fetchShoppingItems(supabase).then(setShopping),
    ])
  }, [userId, calendarMonth.y, calendarMonth.m])

  const handleEventsChange = useCallback(
    (next: CalendarEvent[]) => {
      const client = supabase
      if (!client || !userId) return
      setEvents((prev) => {
        void (async () => {
          await persistCalendarChange(client, userId, prev, next)
          try {
            const evs = await fetchCalendarEventsForDashboard(client)
            setDashboardEvents(evs)
          } catch (e) {
            console.error(e)
          }
        })()
        return next
      })
    },
    [userId],
  )

  const handleShoppingChange = useCallback(
    (next: ShoppingItem[]) => {
      const client = supabase
      if (!client || !userId) return
      setShopping((prev) => {
        void persistShoppingChange(client, userId, prev, next)
        return next
      })
    },
    [userId],
  )

  // Tick the clock every minute so the Home hero’s “in 1h 23m” countdown stays
  // honest without us recomputing the heavier event slices on a timer.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Compute dashboard slices off the cached events/shopping data. Memoised so we don’t
  // re-expand recurrences on every keystroke / poll.
  const dashboardSummary = useMemo(() => {
    const today = now
    const todaysEvents = occurrencesOnDate(dashboardEvents, today)
    const upcoming = nextUpcomingOccurrences(dashboardEvents, today, 14, 4).filter(
      (o) => o.ymd !== toYmd(today),
    )
    const remaining = shopping.filter((i) => !i.purchased)
    const nextOccurrence = findNextOccurrence(dashboardEvents, today, 30)
    const upcomingAnniversaries = findUpcomingAnniversaries(dashboardEvents, today, 7)
    return {
      today,
      todaysEvents,
      upcoming,
      remaining,
      purchasedCount: shopping.length - remaining.length,
      nextOccurrence,
      upcomingAnniversaries,
    }
  }, [dashboardEvents, shopping, now])

  const {
    today,
    todaysEvents,
    upcoming,
    remaining,
    purchasedCount,
    nextOccurrence,
    upcomingAnniversaries,
  } = dashboardSummary
  const shoppingRemaining = remaining.length
  const mood = moodByHour(today.getHours())
  const nextWhen = nextOccurrence
    ? formatNextWhen(nextOccurrence.date, nextOccurrence.event.eventTime, today)
    : null

  const greetingName =
    (user?.user_metadata?.username as string | undefined)?.trim() ||
    user?.email?.split('@')[0] ||
    'there'
  const heroGreeting = `${greetingByHour(today.getHours())}, ${greetingName}`

  // Tab navigation: swipe-left = next (right tab), swipe-right = prev (left tab).
  // Clamps at the edges of SCREEN_ORDER (no wrap).
  const onTabNext = useCallback(() => {
    setScreen((s) => {
      const i = SCREEN_ORDER.indexOf(s)
      return SCREEN_ORDER[Math.min(i + 1, SCREEN_ORDER.length - 1)]
    })
  }, [])

  const onTabPrev = useCallback(() => {
    setScreen((s) => {
      const i = SCREEN_ORDER.indexOf(s)
      return SCREEN_ORDER[Math.max(i - 1, 0)]
    })
  }, [])

  // Gesture model:
  //  - Home: horizontal drag engages scrub immediately (quick adjacent-tab
  //    swipe), AND a still hold for 400ms opens the switcher.
  //  - Calendar / Shopping: NO horizontal drag (inner views own the X axis);
  //    a still hold for 400ms opens the switcher.
  const openSwitcher = useCallback(() => setSwitcherOpen(true), [])
  const { rootRef: mainRef, innerRef: scrubInnerRef, scrubbing } = useTabSwipeGesture({
    onNext: onTabNext,
    onPrev: onTabPrev,
    onLongPress: openSwitcher,
    enabled: !switcherOpen,
    longPressMs: 400,
    immediateDrag: screen === 'home',
  })

  // Pull-to-refresh listens on the main scroll container at the bubble phase,
  // so once the tab-swipe gesture engages (capture phase + stopPropagation)
  // we don’t fight it.
  const { pullY, refreshing, pulling } = usePullToRefresh({
    scrollRef: mainRef as React.RefObject<HTMLElement | null>,
    enabled: Boolean(userId) && !scrubbing,
    onRefresh: refreshAll,
  })

  // Tilt-stack: figure out direction of the incoming tab so CSS can pick left/right anim.
  const prevScreenRef = useRef<Screen>(screen)
  const tiltDirection: 'next' | 'prev' =
    SCREEN_ORDER.indexOf(screen) > SCREEN_ORDER.indexOf(prevScreenRef.current) ? 'next' : 'prev'
  useEffect(() => {
    prevScreenRef.current = screen
  }, [screen])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stone-950 text-stone-100">
      <header
        className="shrink-0 border-b border-stone-800 bg-stone-950/90 backdrop-blur-md"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="mx-auto max-w-lg pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
                OG Life
              </p>
              <h1 className="text-lg font-semibold leading-tight text-white sm:text-xl">
                {screen === 'home'
                  ? 'Home'
                  : screen === 'calendar'
                    ? 'Calendar'
                    : 'Shopping list'}
              </h1>
              <p className="mt-0.5 text-xs text-stone-500">
                {screen === 'home'
                  ? 'Your quick dashboard'
                  : 'Synced with your account · swipe-friendly'}
              </p>
            </div>
            <Link
              to="/app/settings"
              className="shrink-0 rounded-[10px] bg-[#26201f] px-3 py-2 text-xs font-semibold text-[#0a84ff] ring-1 ring-white/[0.08] active:bg-[#3a322f]"
            >
              Account
            </Link>
          </div>
          {syncNote && (
            <p className="mt-2 rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
              {syncNote}
            </p>
          )}
          {deferred && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-amber-500/40 bg-amber-950/50 px-3 py-2.5">
              <p className="min-w-0 flex-1 text-[13px] text-amber-100/95">
                Install OG Life on this phone for a full-screen shortcut.
              </p>
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Install
              </button>
              <button
                type="button"
                onClick={dismissDeferred}
                className="shrink-0 text-xs text-[#8e8e93] underline"
              >
                Not now
              </button>
            </div>
          )}
          {installMessage && (
            <p className="mt-2 text-[13px] text-green-300/90">
              {installMessage}{' '}
              <button
                type="button"
                onClick={clearInstallMessage}
                className="text-[#0a84ff] underline"
              >
                OK
              </button>
            </p>
          )}
        </div>
      </header>

      <main
        ref={mainRef}
        className={`relative mx-auto w-full min-w-0 max-w-lg min-h-0 flex-1 ${
          scrubbing ? 'overflow-hidden' : 'overflow-y-auto'
        } overscroll-y-contain px-4 py-4 [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]`}
        style={{
          paddingBottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <PullToRefreshIndicator
          pullY={pullY}
          refreshing={refreshing}
          pulling={pulling}
        />
        <div
          // Rubber-bands the entire screen down while the user pulls.
          // Transition is off mid-pull so it tracks the finger 1:1.
          style={{
            transform: `translate3d(0, ${refreshing ? 36 : pullY}px, 0)`,
            transition:
              pulling || refreshing
                ? 'none'
                : 'transform 260ms cubic-bezier(0.2,0.7,0.2,1)',
            willChange: 'transform',
          }}
        >
        <div
          ref={scrubInnerRef as React.RefObject<HTMLDivElement | null>}
          className={`tab-scrub-wrapper ${scrubbing ? 'is-scrubbing' : ''}`}
        >
          <div key={screen} data-dir={tiltDirection} className="tilt-stack-enter">
          {screen === 'home' ? (
            <div className="ios-font space-y-4">
              {/* Hero: time-of-day mood + single focus tile (next event /
                  shopping nudge / all-clear). Two stacked gradients give the
                  card real warmth: a strong diagonal wash from the lead mood
                  colour into a warm-dark base, and a soft radial highlight in
                  the top-right that picks up the accent. Surfaces *inside*
                  the hero use translucent white so they read as lit chips on
                  the glow, not holes in it. */}
              <section
                className="relative overflow-hidden rounded-[20px] p-5 ring-1"
                style={{
                  background: `radial-gradient(120% 80% at 100% 0%, ${mood.accent}33 0%, transparent 55%), linear-gradient(135deg, ${mood.from}80 0%, ${mood.via}55 45%, ${mood.tint} 100%)`,
                  boxShadow: `0 18px 50px -25px ${mood.from}80, inset 0 1px 0 rgba(255,255,255,0.06)`,
                  borderColor: 'transparent',
                }}
              >
                {/* Brighter accent orb — picks up the mood colour to give
                    the card a tiny bit of depth without an illustration. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-12 h-52 w-52 rounded-full blur-3xl"
                  style={{ background: mood.from, opacity: 0.35 }}
                />

                <p
                  className="relative text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: mood.accent }}
                >
                  {formatLongDate(today)}
                </p>
                <h2 className="relative mt-2 text-[26px] font-semibold leading-tight text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
                  {heroGreeting}
                </h2>

                {/* Focus tile — exactly one of:
                    1) next event with live countdown,
                    2) shopping nudge when there's nothing on the calendar,
                    3) all-clear card when both are empty.
                    Loading state shows a soft placeholder so the hero never
                    collapses to a thin line on first paint. */}
                {!dashboardLoaded || !shoppingLoaded ? (
                  <div className="relative mt-5 h-[88px] rounded-[14px] bg-white/[0.08] ring-1 ring-white/[0.08]" />
                ) : nextOccurrence && nextWhen ? (
                  <button
                    type="button"
                    onClick={() => setScreen('calendar')}
                    className="relative mt-5 flex w-full items-center gap-3 rounded-[14px] bg-white/[0.10] px-4 py-3.5 text-left ring-1 ring-white/[0.12] backdrop-blur-md transition active:bg-white/[0.16]"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{ color: mood.accent }}
                      >
                        Next up
                      </p>
                      <p className="mt-0.5 truncate text-[17px] font-semibold text-white">
                        {nextOccurrence.event.title || 'Untitled'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {nextWhen.countdown ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              background: `${mood.accent}40`,
                              color: '#fff',
                              boxShadow: `inset 0 0 0 1px ${mood.accent}55`,
                            }}
                          >
                            {nextWhen.countdown}
                          </span>
                        ) : null}
                        <span className="text-[12px] text-white/75">
                          {nextWhen.when}
                        </span>
                      </div>
                    </div>
                    <span
                      aria-hidden
                      className="flex-shrink-0 text-[20px] leading-none text-white/55"
                    >
                      →
                    </span>
                  </button>
                ) : shoppingRemaining > 0 ? (
                  <button
                    type="button"
                    onClick={() => setScreen('shopping')}
                    className="relative mt-5 flex w-full items-center gap-3 rounded-[14px] bg-white/[0.10] px-4 py-3.5 text-left ring-1 ring-white/[0.12] backdrop-blur-md transition active:bg-white/[0.16]"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{ color: mood.accent }}
                      >
                        On the list
                      </p>
                      <p className="mt-0.5 text-[17px] font-semibold text-white">
                        {shoppingRemaining === 1
                          ? '1 item to grab'
                          : `${shoppingRemaining} items to grab`}
                      </p>
                      <p className="mt-1 text-[12px] text-white/75">
                        Tap to open the shopping list.
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="flex-shrink-0 text-[20px] leading-none text-white/55"
                    >
                      →
                    </span>
                  </button>
                ) : (
                  <div className="relative mt-5 rounded-[14px] bg-white/[0.08] px-4 py-3.5 ring-1 ring-white/[0.10] backdrop-blur-md">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: mood.accent }}
                    >
                      All clear
                    </p>
                    <p className="mt-0.5 text-[17px] font-semibold text-white">
                      Nothing on the books.
                    </p>
                    <p className="mt-1 text-[12px] text-white/75">
                      Enjoy the calm.
                    </p>
                  </div>
                )}
              </section>

              {/* Anniversary / birthday countdown — shown only when at least
                  one anniversary occurrence falls within the next 7 days.
                  Special card so it stands out from the rest of the dashboard;
                  tap a row to jump to the source event in the calendar. */}
              {upcomingAnniversaries.length > 0 ? (
                <section className="relative overflow-hidden rounded-[16px] p-[1px] ring-1 ring-amber-300/20">
                  {/* Warm amber → rose gradient frame so it visibly belongs
                      to the "celebration" category without screaming. */}
                  <div className="rounded-[15px] bg-gradient-to-br from-amber-500/25 via-[#1c1618] to-[#1c1618] p-4 ring-1 ring-white/[0.04]">
                    <header className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/85">
                          Coming up
                        </p>
                        <h3 className="mt-0.5 text-[17px] font-semibold text-white">
                          {upcomingAnniversaries.length === 1
                            ? 'An anniversary this week'
                            : `${upcomingAnniversaries.length} celebrations this week`}
                        </h3>
                      </div>
                    </header>
                    <ul className="mt-3 space-y-2">
                      {upcomingAnniversaries.map(({ occurrence, daysUntil, yearsSince }) => (
                        <li key={occurrence.event.id + '::' + occurrence.ymd}>
                          <button
                            type="button"
                            onClick={() => setScreen('calendar')}
                            className="flex w-full items-center gap-3 rounded-[12px] bg-white/[0.05] px-3 py-3 text-left ring-1 ring-white/[0.06] transition active:bg-white/[0.10]"
                          >
                            <span
                              aria-hidden
                              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[20px] ring-1 ring-amber-300/30"
                            >
                              {anniversaryEmoji(occurrence.event.title)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-white">
                                {occurrence.event.title || 'Anniversary'}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                                <span className="font-semibold text-amber-200">
                                  {anniversaryCountdownLabel(daysUntil)}
                                </span>
                                {yearsSince > 0 ? (
                                  <span className="text-white/55">
                                    · {yearsSince}{' '}
                                    {yearsSince === 1 ? 'year' : 'years'}
                                  </span>
                                ) : null}
                                <span className="text-white/45">
                                  · {formatShortDayLabel(occurrence.date)}
                                </span>
                              </div>
                            </div>
                            <span
                              aria-hidden
                              className="flex-shrink-0 text-[18px] leading-none text-white/40"
                            >
                              →
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              ) : null}

              {/* Today’s events — hidden entirely when nothing’s on. */}
              {todaysEvents.length > 0 ? (
                <section className="rounded-[16px] bg-[#1c1618] ring-1 ring-white/[0.07]">
                  <header className="flex items-center justify-between px-4 pt-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-[#8e8e93]">
                        Today
                      </p>
                      <h3 className="mt-0.5 text-[17px] font-semibold text-white">
                        On your plate
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScreen('calendar')}
                      className="rounded-full bg-amber-500/15 px-3 py-1 text-[12px] font-medium text-amber-200 transition active:bg-amber-500/25"
                    >
                      Open
                    </button>
                  </header>
                  <div className="mt-3 divide-y divide-white/[0.04]">
                    {todaysEvents.map((o) => (
                      <div
                        key={o.event.id + '::today'}
                        className="flex items-start gap-3 px-4 py-3"
                      >
                        <div className="flex w-14 flex-shrink-0 flex-col items-start">
                          <p className="text-[13px] font-semibold text-amber-200">
                            {formatClockTime(o.event.eventTime) ?? 'All day'}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium text-white">
                            {o.event.title || 'Untitled'}
                          </p>
                          {o.event.notes ? (
                            <p className="mt-0.5 truncate text-[12px] text-[#8e8e93]">
                              {o.event.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Coming up */}
              {upcoming.length > 0 ? (
                <section className="rounded-[16px] bg-[#1c1618] ring-1 ring-white/[0.07]">
                  <header className="flex items-center justify-between px-4 pt-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-[#8e8e93]">
                        Coming up
                      </p>
                      <h3 className="mt-0.5 text-[17px] font-semibold text-white">
                        Next two weeks
                      </h3>
                    </div>
                  </header>
                  <div className="mt-3 divide-y divide-white/[0.04]">
                    {upcoming.map((o) => (
                      <div
                        key={o.event.id + '::' + o.ymd}
                        className="flex items-start gap-3 px-4 py-3"
                      >
                        <div className="flex w-20 flex-shrink-0 flex-col items-start">
                          <p className="text-[12px] font-semibold text-white">
                            {formatShortDayLabel(o.date)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#8e8e93]">
                            {formatClockTime(o.event.eventTime) ?? 'All day'}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium text-white">
                            {o.event.title || 'Untitled'}
                          </p>
                          {o.event.notes ? (
                            <p className="mt-0.5 truncate text-[12px] text-[#8e8e93]">
                              {o.event.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Shopping snapshot — hidden entirely when the cart is empty. */}
              {shoppingRemaining > 0 ? (
                <section className="rounded-[16px] bg-[#1c1618] ring-1 ring-white/[0.07]">
                  <header className="flex items-center justify-between px-4 pt-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-[#8e8e93]">
                        Shopping list
                      </p>
                      <h3 className="mt-0.5 text-[17px] font-semibold text-white">
                        {`${shoppingRemaining} to grab`}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScreen('shopping')}
                      className="rounded-full bg-amber-500/15 px-3 py-1 text-[12px] font-medium text-amber-200 transition active:bg-amber-500/25"
                    >
                      Open
                    </button>
                  </header>
                  <div className="mt-3 divide-y divide-white/[0.04]">
                    {remaining.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-400/80"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] text-white">{item.name}</p>
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-[#a1a1aa]">
                          {displayQuantity(item.quantity)}
                        </span>
                      </div>
                    ))}
                    {shoppingRemaining > 5 ? (
                      <button
                        type="button"
                        onClick={() => setScreen('shopping')}
                        className="w-full px-4 py-3 text-left text-[13px] font-medium text-amber-300 active:bg-white/[0.04]"
                      >
                        +{shoppingRemaining - 5} more
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>
          ) : screen === 'calendar' ? (
            !eventsLoaded && events.length === 0 ? (
              <CalendarSkeleton />
            ) : (
              <CalendarView
                events={events}
                onChange={handleEventsChange}
                onVisibleMonthChange={onVisibleMonthChange}
              />
            )
          ) : !shoppingLoaded && shopping.length === 0 ? (
            <ShoppingSkeleton />
          ) : (
            <ShoppingListView items={shopping} onChange={handleShoppingChange} />
          )}
          </div>
        </div>
        </div>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-800 bg-stone-950/95 backdrop-blur-lg"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="mx-auto flex max-w-lg">
          <button
            type="button"
            onClick={() => setScreen('calendar')}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition active:bg-stone-900/80 ${
              screen === 'calendar' ? 'text-amber-300' : 'text-stone-500'
            }`}
          >
            <span className="text-lg leading-none" aria-hidden>
              📅
            </span>
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setScreen('home')}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition active:bg-stone-900/80 ${
              screen === 'home' ? 'text-amber-300' : 'text-stone-500'
            }`}
          >
            <span className="text-lg leading-none" aria-hidden>
              🏠
            </span>
            Home
          </button>
          <button
            type="button"
            onClick={() => setScreen('shopping')}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition active:bg-stone-900/80 ${
              screen === 'shopping' ? 'text-amber-300' : 'text-stone-500'
            }`}
          >
            <span className="text-lg leading-none" aria-hidden>
              🛒
            </span>
            Shopping
          </button>
        </div>
      </nav>

      <TabSwitcher
        open={switcherOpen}
        current={screen}
        onClose={() => setSwitcherOpen(false)}
        onSelect={(next) => setScreen(next)}
        heroGreeting={heroGreeting}
        today={today}
        shoppingRemaining={shoppingRemaining}
        purchasedCount={purchasedCount}
        todaysEvents={todaysEvents}
        upcomingEvents={upcoming}
        calendarEvents={dashboardEvents}
        shoppingItems={shopping}
      />
    </div>
  )
}
