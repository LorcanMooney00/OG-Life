import { useState } from 'react'
import { CalendarView } from './components/CalendarView'
import { ShoppingListView } from './components/ShoppingListView'
import { useLocalStorage } from './hooks/useLocalStorage'
import type { CalendarEvent, ShoppingItem } from './types'

const EVENTS_KEY = 'og-life:calendar-events:v1'
const SHOPPING_KEY = 'og-life:shopping-items:v1'

type Tab = 'calendar' | 'shopping'
type Screen = 'home' | Tab

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [events, setEvents] = useLocalStorage<CalendarEvent[]>(EVENTS_KEY, [])
  const [shopping, setShopping] = useLocalStorage<ShoppingItem[]>(
    SHOPPING_KEY,
    [],
  )
  const upcomingEvents = events.filter((event) => new Date(event.eventDate) >= new Date()).length
  const shoppingRemaining = shopping.filter((item) => !item.purchased).length

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header
        className="shrink-0 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="mx-auto max-w-lg pb-3">
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
              : 'Saved on this device · swipe-friendly'}
          </p>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-lg flex-1 overflow-y-auto overscroll-y-contain px-4 py-4"
        style={{
          paddingBottom:
            'calc(5.25rem + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {screen === 'home' ? (
          <div className="ios-font space-y-4">
            <section className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/[0.08]">
              <p className="text-[13px] uppercase tracking-wide text-[#8e8e93]">
                Today at a glance
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-[10px] bg-[#2c2c2e] p-3 ring-1 ring-white/[0.06]">
                  <p className="text-[12px] text-[#8e8e93]">Upcoming events</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {upcomingEvents}
                  </p>
                </div>
                <div className="rounded-[10px] bg-[#2c2c2e] p-3 ring-1 ring-white/[0.06]">
                  <p className="text-[12px] text-[#8e8e93]">Shopping left</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {shoppingRemaining}
                  </p>
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
          <CalendarView events={events} onChange={setEvents} />
        ) : (
          <ShoppingListView items={shopping} onChange={setShopping} />
        )}
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

export default App
