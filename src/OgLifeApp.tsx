import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarView } from './components/CalendarView'
import { useDominantHorizontalSwipe } from './hooks/useDominantHorizontalSwipe'
import { ShoppingListView } from './components/ShoppingListView'
import { useInstallPrompt } from './contexts/InstallPromptContext'
import { useAuth } from './lib/auth'
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

const SCREEN_ORDER: Screen[] = ['home', 'calendar', 'shopping']

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

  const today = new Date()
  const upcomingEvents = dashboardEvents.filter(
    (event) => event.recurrence !== 'none' || new Date(event.eventDate) >= today,
  ).length
  const shoppingRemaining = shopping.filter((item) => !item.purchased).length

  const onTabSwipeLeft = useCallback(() => {
    setScreen((s) => {
      // Calendar: month swipe lives on CalendarView. Shopping: list/add swipe on ShoppingListView.
      if (s === 'calendar' || s === 'shopping') return s
      const i = SCREEN_ORDER.indexOf(s)
      return SCREEN_ORDER[(i + 1) % SCREEN_ORDER.length]
    })
  }, [])

  const onTabSwipeRight = useCallback(() => {
    setScreen((s) => {
      if (s === 'calendar' || s === 'shopping') return s
      const i = SCREEN_ORDER.indexOf(s)
      return SCREEN_ORDER[(i + SCREEN_ORDER.length - 1) % SCREEN_ORDER.length]
    })
  }, [])

  const tabSwipe = useDominantHorizontalSwipe({
    onSwipeLeft: onTabSwipeLeft,
    onSwipeRight: onTabSwipeRight,
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
        {...tabSwipe}
        className="mx-auto w-full min-w-0 max-w-lg min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]"
        style={{
          paddingBottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div key={screen} data-dir={tiltDirection} className="tilt-stack-enter">
          {screen === 'home' ? (
            <div className="ios-font space-y-4">
              <section className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/[0.08]">
                <p className="text-[13px] uppercase tracking-wide text-[#8e8e93]">
                  Today at a glance
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-[10px] bg-[#2c2c2e] p-3 ring-1 ring-white/[0.06]">
                    <p className="text-[12px] text-[#8e8e93]">Upcoming events</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{upcomingEvents}</p>
                  </div>
                  <div className="rounded-[10px] bg-[#2c2c2e] p-3 ring-1 ring-white/[0.06]">
                    <p className="text-[12px] text-[#8e8e93]">Shopping left</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{shoppingRemaining}</p>
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={() => setScreen('calendar')}
                className="w-full rounded-[12px] bg-[#2c2c2e] p-4 text-left ring-1 ring-white/[0.08] transition active:bg-[#3a3a3c]"
              >
                <p className="text-[17px] font-semibold text-white">📅 Calendar</p>
                <p className="mt-1 text-[13px] text-[#8e8e93]">
                  Plan events, recurring reminders, and your week.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScreen('shopping')}
                className="w-full rounded-[12px] bg-[#2c2c2e] p-4 text-left ring-1 ring-white/[0.08] transition active:bg-[#3a3a3c]"
              >
                <p className="text-[17px] font-semibold text-white">🛒 Shopping list</p>
                <p className="mt-1 text-[13px] text-[#8e8e93]">
                  Add quickly, tick off items, and keep things tidy.
                </p>
              </button>
            </div>
          ) : screen === 'calendar' ? (
            <CalendarView
              events={events}
              onChange={handleEventsChange}
              onVisibleMonthChange={onVisibleMonthChange}
            />
          ) : (
            <ShoppingListView items={shopping} onChange={handleShoppingChange} />
          )}
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
