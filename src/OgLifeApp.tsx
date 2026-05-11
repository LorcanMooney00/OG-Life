import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarView } from './components/CalendarView'
import { useTabSwipeGesture } from './hooks/useDominantHorizontalSwipe'
import { usePullToRefresh } from './hooks/usePullToRefresh'
import { ShoppingListView } from './components/ShoppingListView'
import { CalendarSkeleton, ShoppingSkeleton } from './components/Skeletons'
import { PullToRefreshIndicator } from './components/PullToRefreshIndicator'
import { useInstallPrompt } from './contexts/InstallPromptContext'
import { useAuth } from './lib/auth'
import {
  formatClockTime,
  formatLongDate,
  formatShortDayLabel,
  greetingByHour,
  toYmd,
} from './lib/date'
import {
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

  // Compute dashboard slices off the cached events/shopping data. Memoised so we don’t
  // re-expand recurrences on every keystroke / poll.
  const dashboardSummary = useMemo(() => {
    const today = new Date()
    const todaysEvents = occurrencesOnDate(dashboardEvents, today)
    const upcoming = nextUpcomingOccurrences(dashboardEvents, today, 14, 4).filter(
      (o) => o.ymd !== toYmd(today),
    )
    const remaining = shopping.filter((i) => !i.purchased)
    return {
      today,
      todaysEvents,
      upcoming,
      remaining,
      purchasedCount: shopping.length - remaining.length,
    }
  }, [dashboardEvents, shopping])

  const { today, todaysEvents, upcoming, remaining, purchasedCount } = dashboardSummary
  const upcomingEvents = todaysEvents.length + upcoming.length
  const shoppingRemaining = remaining.length

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

  // Home: drag horizontally to engage immediately (no competing gesture there).
  // Calendar / Shopping: must hold ~0.6s before scrub takes over, so quick swipes
  // still belong to the inner views (month-swipe / list-add toggle).
  const { rootRef: mainRef, innerRef: scrubInnerRef, scrubbing } = useTabSwipeGesture({
    onNext: onTabNext,
    onPrev: onTabPrev,
    enabled: true,
    longPressMs: screen === 'home' ? 0 : 400,
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header
        className="shrink-0 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="mx-auto max-w-lg pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300/90">
                OG Life
              </p>
              <h1 className="text-lg font-semibold leading-tight text-white sm:text-xl">
                {screen === 'home'
                  ? 'Home'
                  : screen === 'calendar'
                    ? 'Calendar'
                    : 'Shopping list'}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                {screen === 'home'
                  ? 'Your quick dashboard'
                  : 'Synced with your account · swipe-friendly'}
              </p>
            </div>
            <Link
              to="/app/settings"
              className="shrink-0 rounded-[10px] bg-[#2c2c2e] px-3 py-2 text-xs font-semibold text-[#0a84ff] ring-1 ring-white/[0.08] active:bg-[#3a3a3c]"
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
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-indigo-500/40 bg-indigo-950/50 px-3 py-2.5">
              <p className="min-w-0 flex-1 text-[13px] text-indigo-100/95">
                Install OG Life on this phone for a full-screen shortcut.
              </p>
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
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
              {/* Hero: greeting + date */}
              <section className="relative overflow-hidden rounded-[16px] bg-gradient-to-br from-indigo-500/25 via-[#1c1c1e] to-[#1c1c1e] p-5 ring-1 ring-white/[0.08]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-500/15 blur-3xl"
                />
                <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-indigo-200/80">
                  {formatLongDate(today)}
                </p>
                <h2 className="mt-1 text-[22px] font-semibold leading-tight text-white">
                  {heroGreeting}
                </h2>
                <p className="mt-1 text-[13px] text-[#a1a1aa]">
                  {!dashboardLoaded || !shoppingLoaded
                    ? 'Loading your day…'
                    : todaysEvents.length === 0 && upcoming.length === 0 && shoppingRemaining === 0
                      ? 'You’re all caught up. Enjoy the calm.'
                      : todaysEvents.length > 0
                        ? `${todaysEvents.length} thing${todaysEvents.length === 1 ? '' : 's'} on today${shoppingRemaining > 0 ? ` · ${shoppingRemaining} to grab` : ''}.`
                        : shoppingRemaining > 0
                          ? `${shoppingRemaining} item${shoppingRemaining === 1 ? '' : 's'} still on the shopping list.`
                          : `${upcoming.length} thing${upcoming.length === 1 ? '' : 's'} coming up soon.`}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setScreen('calendar')}
                    className="rounded-[12px] bg-white/[0.04] p-3 text-left ring-1 ring-white/[0.06] transition active:bg-white/[0.08]"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-[#8e8e93]">
                      Upcoming
                    </p>
                    <p className="mt-1 text-[26px] font-semibold leading-none text-white">
                      {upcomingEvents}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8e8e93]">events ahead</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreen('shopping')}
                    className="rounded-[12px] bg-white/[0.04] p-3 text-left ring-1 ring-white/[0.06] transition active:bg-white/[0.08]"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-[#8e8e93]">
                      Shopping
                    </p>
                    <p className="mt-1 text-[26px] font-semibold leading-none text-white">
                      {shoppingRemaining}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8e8e93]">
                      {purchasedCount > 0 ? `${purchasedCount} done` : 'left to grab'}
                    </p>
                  </button>
                </div>
              </section>

              {/* Today’s events — hidden entirely when nothing’s on. */}
              {todaysEvents.length > 0 ? (
                <section className="rounded-[16px] bg-[#1c1c1e] ring-1 ring-white/[0.08]">
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
                      className="rounded-full bg-indigo-500/15 px-3 py-1 text-[12px] font-medium text-indigo-200 transition active:bg-indigo-500/25"
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
                          <p className="text-[13px] font-semibold text-indigo-200">
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
                <section className="rounded-[16px] bg-[#1c1c1e] ring-1 ring-white/[0.08]">
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
                <section className="rounded-[16px] bg-[#1c1c1e] ring-1 ring-white/[0.08]">
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
                      className="rounded-full bg-indigo-500/15 px-3 py-1 text-[12px] font-medium text-indigo-200 transition active:bg-indigo-500/25"
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
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-indigo-400/80"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] text-white">{item.name}</p>
                        </div>
                        {item.quantity ? (
                          <span className="flex-shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-[#a1a1aa]">
                            {item.quantity}
                          </span>
                        ) : null}
                      </div>
                    ))}
                    {shoppingRemaining > 5 ? (
                      <button
                        type="button"
                        onClick={() => setScreen('shopping')}
                        className="w-full px-4 py-3 text-left text-[13px] font-medium text-indigo-300 active:bg-white/[0.04]"
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
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur-lg"
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
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition active:bg-slate-900/80 ${
              screen === 'calendar' ? 'text-indigo-300' : 'text-slate-500'
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
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition active:bg-slate-900/80 ${
              screen === 'home' ? 'text-indigo-300' : 'text-slate-500'
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
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition active:bg-slate-900/80 ${
              screen === 'shopping' ? 'text-indigo-300' : 'text-slate-500'
            }`}
          >
            <span className="text-lg leading-none" aria-hidden>
              🛒
            </span>
            Shopping
          </button>
        </div>
      </nav>
    </div>
  )
}
