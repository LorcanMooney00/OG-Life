import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDominantHorizontalSwipe } from '../hooks/useDominantHorizontalSwipe'
import type { CalendarEvent } from '../types'
import { createId } from '../lib/id'
import { compareEventTime, toYmd } from '../lib/date'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** iOS weekday letters (Calendar uses S M T W T F S — Sunday first, matches getDay()) */
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/** Event dot colors similar to iOS multi-calendar dots */
const DOT_COLORS = [
  'bg-[#ff453a]',
  'bg-[#ff9f0a]',
  'bg-[#ffd60a]',
  'bg-[#30d158]',
  'bg-[#64d2ff]',
  'bg-[#0a84ff]',
  'bg-[#bf5af2]',
  'bg-[#ff375f]',
] as const

function dotClass(i: number) {
  return DOT_COLORS[i % DOT_COLORS.length]
}

type Props = {
  events: CalendarEvent[]
  onChange: (next: CalendarEvent[]) => void
  /** Lets parent refetch cloud rows for the visible month (efficient sync). */
  onVisibleMonthChange?: (year: number, monthIndex: number) => void
}

type CalendarOccurrence = CalendarEvent & {
  occurrenceDate: string
  sourceEventId: string
}

const recurrenceLabels: Record<CalendarEvent['recurrence'], string> = {
  none: 'Never',
  daily: 'Every day',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function CalendarView({ events, onChange, onVisibleMonthChange }: Props) {
  const nowInit = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(
    () => new Date(nowInit.getFullYear(), nowInit.getMonth(), 1),
  )
  const [selectedDay, setSelectedDay] = useState<number | null>(
    () => nowInit.getDate(),
  )
  const [draft, setDraft] = useState<CalendarEvent | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  useEffect(() => {
    onVisibleMonthChange?.(year, month)
  }, [year, month, onVisibleMonthChange])
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const daysInMonth = last.getDate()
  const startPad = first.getDay()

  const today = new Date()
  const isThisMonth =
    today.getFullYear() === year && today.getMonth() === month
  const todayDay = isThisMonth ? today.getDate() : null

  useEffect(() => {
    setSelectedDay((d) => {
      if (d === null) return null
      const max = new Date(year, month + 1, 0).getDate()
      return Math.min(d, max)
    })
  }, [year, month])

  const monthStart = useMemo(() => new Date(year, month, 1), [year, month])
  const monthEnd = useMemo(() => new Date(year, month + 1, 0), [year, month])

  const parseYmd = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  const endOfDay = (d: Date) => {
    const copy = new Date(d)
    copy.setHours(23, 59, 59, 999)
    return copy
  }

  const toOccurrence = (event: CalendarEvent, date: Date): CalendarOccurrence => ({
    ...event,
    id: `${event.id}::${toYmd(date)}`,
    occurrenceDate: toYmd(date),
    sourceEventId: event.id,
  })

  const buildOccurrencesForMonth = (
    event: CalendarEvent,
    rangeStart: Date,
    rangeEnd: Date,
  ): CalendarOccurrence[] => {
    const start = parseYmd(event.eventDate)
    const recurrenceEnd = event.recurrenceEndDate
      ? endOfDay(parseYmd(event.recurrenceEndDate))
      : null

    if (event.recurrence === 'none') {
      if (start >= rangeStart && start <= rangeEnd) {
        return [toOccurrence(event, start)]
      }
      return []
    }

    const hardEnd = recurrenceEnd && recurrenceEnd < rangeEnd ? recurrenceEnd : rangeEnd
    if (hardEnd < rangeStart) return []

    const occurrences: CalendarOccurrence[] = []
    let cursorDate = new Date(start)

    while (cursorDate <= hardEnd) {
      if (cursorDate >= rangeStart) {
        occurrences.push(toOccurrence(event, cursorDate))
      }

      if (event.recurrence === 'daily') {
        cursorDate.setDate(cursorDate.getDate() + 1)
      } else if (event.recurrence === 'weekly') {
        cursorDate.setDate(cursorDate.getDate() + 7)
      } else if (event.recurrence === 'biweekly') {
        cursorDate.setDate(cursorDate.getDate() + 14)
      } else {
        const targetDay = start.getDate()
        const nextMonthFirst = new Date(
          cursorDate.getFullYear(),
          cursorDate.getMonth() + 1,
          1,
        )
        const maxDay = new Date(
          nextMonthFirst.getFullYear(),
          nextMonthFirst.getMonth() + 1,
          0,
        ).getDate()
        nextMonthFirst.setDate(Math.min(targetDay, maxDay))
        cursorDate = nextMonthFirst
      }
    }

    return occurrences
  }

  const occurrencesByDay = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>()
    for (const ev of events) {
      const recurrence = ev.recurrence ?? 'none'
      const safeEvent: CalendarEvent = {
        ...ev,
        recurrence,
        recurrenceEndDate: ev.recurrenceEndDate ?? null,
      }
      const occurrences = buildOccurrencesForMonth(safeEvent, monthStart, monthEnd)
      for (const occ of occurrences) {
        const list = map.get(occ.occurrenceDate) ?? []
        list.push(occ)
        map.set(occ.occurrenceDate, list)
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => compareEventTime(a.eventTime, b.eventTime))
    }
    return map
  }, [events, monthStart, monthEnd])

  const selectedYmd =
    selectedDay !== null ? toYmd(new Date(year, month, selectedDay)) : null
  const selectedDayEvents =
    selectedYmd !== null ? (occurrencesByDay.get(selectedYmd) ?? []) : []

  const openNewForSelectedDay = () => {
    if (selectedDay === null) return
    setDraft({
      id: createId(),
      title: '',
      notes: '',
      eventDate: toYmd(new Date(year, month, selectedDay)),
      eventTime: null,
      recurrence: 'none',
      recurrenceEndDate: null,
      createdAt: new Date().toISOString(),
    })
  }

  const openEdit = (ev: CalendarOccurrence) => {
    const sourceEvent = events.find((e) => e.id === ev.sourceEventId)
    if (!sourceEvent) return
    setDraft({
      ...sourceEvent,
      recurrence: sourceEvent.recurrence ?? 'none',
      recurrenceEndDate: sourceEvent.recurrenceEndDate ?? null,
    })
  }

  const closeDraft = () => {
    setDraft(null)
  }

  const saveDraft = () => {
    if (!draft) return
    const title = draft.title.trim()
    if (!title || !draft.eventDate) return

    const normalized: CalendarEvent = {
      ...draft,
      title,
      notes: draft.notes.trim(),
      eventTime: draft.eventTime?.trim() ? draft.eventTime.trim() : null,
      recurrence: draft.recurrence ?? 'none',
      recurrenceEndDate:
        (draft.recurrence ?? 'none') === 'none'
          ? null
          : draft.recurrenceEndDate || null,
    }

    const exists = events.some((e) => e.id === normalized.id)
    if (exists) {
      onChange(events.map((e) => (e.id === normalized.id ? normalized : e)))
    } else {
      onChange([...events, normalized])
    }
    closeDraft()
  }

  const deleteEvent = (id: string) => {
    onChange(events.filter((e) => e.id !== id))
    setConfirmDeleteId(null)
    if (draft?.id === id) closeDraft()
  }

  const goToday = () => {
    const n = new Date()
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1))
    setSelectedDay(n.getDate())
  }

  const iosBlue = 'text-[#0a84ff]'
  const iosSecondary = 'text-[#8e8e93]'

  const onMonthSwipeLeft = useCallback(() => {
    if (draft || confirmDeleteId) return
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
  }, [draft, confirmDeleteId])

  const onMonthSwipeRight = useCallback(() => {
    if (draft || confirmDeleteId) return
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
  }, [draft, confirmDeleteId])

  const monthSwipe = useDominantHorizontalSwipe({
    onSwipeLeft: onMonthSwipeLeft,
    onSwipeRight: onMonthSwipeRight,
  })

  return (
    <div className="ios-font space-y-4 sm:space-y-5" {...monthSwipe}>
      {/* Navigation bar — like iOS month picker */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full active:bg-white/10 ${iosSecondary}`}
          aria-label="Previous month"
        >
          <ChevronLeft className="opacity-90" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-[17px] font-semibold leading-tight tracking-tight text-white sm:text-[20px]">
            <span className="font-semibold">{MONTHS[month]}</span>{' '}
            <span className="font-normal text-white/90">{year}</span>
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full active:bg-white/10 ${iosSecondary}`}
          aria-label="Next month"
        >
          <ChevronRight className="opacity-90" />
        </button>
      </div>

      <button
        type="button"
        onClick={goToday}
        className={`mx-auto block min-h-10 px-4 text-[15px] font-semibold ${iosBlue} active:opacity-70`}
      >
        Today
      </button>

      {/* Weekday header — iOS uses light caps; Sunday often tinted red on some locales — keep neutral */}
      <div className="grid grid-cols-7 gap-0 px-0.5">
        {WEEKDAY_LETTERS.map((letter, idx) => (
          <div
            key={`${letter}-${idx}`}
            className={`py-1 text-center text-[11px] font-semibold uppercase ${idx === 0 ? 'text-[#ff453a]/90' : iosSecondary}`}
          >
            {letter}
          </div>
        ))}
      </div>

      {/* Month grid — minimal cells, circular selection, dots */}
      <div className="grid grid-cols-7 gap-y-1 px-0.5">
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square max-h-[52px] sm:max-h-14" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const ymd = toYmd(new Date(year, month, day))
          const dayEvents = occurrencesByDay.get(ymd) ?? []
          const isToday = todayDay === day
          const isSelected = selectedDay === day

          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className="relative flex aspect-square max-h-[52px] flex-col items-center justify-start rounded-full pt-1.5 sm:max-h-14 sm:pt-2"
            >
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-normal leading-none sm:h-9 sm:w-9 sm:text-[16px] ${
                  isSelected
                    ? 'bg-[#0a84ff] font-semibold text-white'
                    : isToday
                      ? 'font-semibold text-[#ff9f0a]'
                      : 'text-white/95'
                }`}
              >
                {day}
              </span>
              <div className="mt-0.5 flex h-3 items-center justify-center gap-0.5 px-0.5">
                {dayEvents.slice(0, 3).map((ev, di) => (
                  <span
                    key={ev.id}
                    className={`h-1 w-1 shrink-0 rounded-full ${dotClass(di)}`}
                    title={ev.title}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[9px] font-medium leading-none text-[#8e8e93]">
                    +
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Agenda — inset grouped list below grid (iOS order) */}
      {selectedDay !== null && (
        <section className="overflow-hidden rounded-[10px] bg-[#2c2c2e]/90 ring-1 ring-white/[0.08]">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white/90">
                {new Date(year, month, selectedDay).toLocaleDateString(undefined, {
                  weekday: 'long',
                })}
              </p>
              <p className={`text-[15px] font-semibold text-white`}>
                {new Date(year, month, selectedDay).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={openNewForSelectedDay}
              className={`shrink-0 text-[17px] font-semibold ${iosBlue} min-h-11 px-2 active:opacity-70`}
            >
              Add
            </button>
          </div>

          <ul className="divide-y divide-white/[0.08]">
            {selectedDayEvents.length === 0 ? (
              <li className="px-4 py-10 text-center text-[15px] text-[#8e8e93]">
                No events
              </li>
            ) : (
              selectedDayEvents.map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(ev)}
                    className="flex w-full min-h-[56px] items-start gap-3 px-4 py-3 text-left active:bg-white/[0.06]"
                  >
                    <div className="w-[52px] shrink-0 pt-0.5 text-right">
                      {ev.eventTime ? (
                        <span className="text-[15px] font-medium tabular-nums text-[#0a84ff]">
                          {ev.eventTime}
                        </span>
                      ) : (
                        <span className="text-[13px] font-medium text-[#8e8e93]">
                          All-day
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 border-l-2 border-[#0a84ff]/80 pl-3">
                      <p className="text-[15px] font-semibold leading-snug text-white">
                        {ev.title}
                      </p>
                      {ev.recurrence !== 'none' && (
                        <p className="mt-0.5 text-[12px] leading-snug text-[#64d2ff]">
                          {recurrenceLabels[ev.recurrence]}
                        </p>
                      )}
                      {ev.notes && (
                        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#8e8e93]">
                          {ev.notes}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
          <div
            className="ios-font max-h-[min(92dvh,900px)] w-full max-w-md overflow-y-auto rounded-t-[12px] bg-[#1c1c1e] shadow-2xl sm:rounded-[12px]"
            style={{
              paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-dialog-title"
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/20 sm:hidden" />
            <div className="relative flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <button
                type="button"
                onClick={closeDraft}
                className={`z-10 min-h-11 shrink-0 text-[17px] font-normal ${iosBlue}`}
              >
                Cancel
              </button>
              <h3
                id="event-dialog-title"
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[17px] font-semibold text-white"
              >
                {events.some((e) => e.id === draft.id) ? 'Edit Event' : 'New Event'}
              </h3>
              <button
                type="button"
                onClick={saveDraft}
                disabled={!draft.title.trim()}
                className={`z-10 min-h-11 shrink-0 text-[17px] font-semibold ${iosBlue} disabled:opacity-40`}
              >
                Done
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="overflow-hidden rounded-[10px] bg-[#2c2c2e] ring-1 ring-white/[0.06]">
                <label className="block border-b border-white/[0.08] px-4 py-2">
                  <span className="sr-only">Title</span>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="min-h-11 w-full bg-transparent text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
                    placeholder="Title"
                    autoFocus
                    enterKeyHint="done"
                  />
                </label>
                <label className="block px-4 py-2">
                  <span className="sr-only">Notes</span>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    rows={3}
                    className="w-full resize-none bg-transparent text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
                    placeholder="Notes"
                  />
                </label>
              </div>

              <div className="overflow-hidden rounded-[10px] bg-[#2c2c2e] ring-1 ring-white/[0.06]">
                <div className="flex items-center border-b border-white/[0.08] px-4 py-2">
                  <span className="w-24 shrink-0 text-[17px] text-white">Starts</span>
                  <input
                    type="date"
                    value={draft.eventDate}
                    onChange={(e) =>
                      setDraft({ ...draft, eventDate: e.target.value })
                    }
                    className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] text-white outline-none [color-scheme:dark]"
                  />
                </div>
                <div className="flex items-center px-4 py-2">
                  <span className="w-24 shrink-0 text-[17px] text-white">Time</span>
                  <input
                    type="time"
                    value={draft.eventTime ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        eventTime: e.target.value || null,
                      })
                    }
                    className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] text-white outline-none [color-scheme:dark]"
                  />
                </div>
                <div className="flex items-center border-t border-white/[0.08] px-4 py-2">
                  <span className="w-24 shrink-0 text-[17px] text-white">Repeat</span>
                  <select
                    value={draft.recurrence ?? 'none'}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        recurrence: e.target.value as CalendarEvent['recurrence'],
                        recurrenceEndDate:
                          e.target.value === 'none' ? null : draft.recurrenceEndDate,
                      })
                    }
                    className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] text-white outline-none [color-scheme:dark]"
                  >
                    <option value="none">Never</option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="monthly">Every month</option>
                  </select>
                </div>
                {(draft.recurrence ?? 'none') !== 'none' && (
                  <div className="flex items-center border-t border-white/[0.08] px-4 py-2">
                    <span className="w-24 shrink-0 text-[17px] text-white">Ends</span>
                    <input
                      type="date"
                      value={draft.recurrenceEndDate ?? ''}
                      min={draft.eventDate}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          recurrenceEndDate: e.target.value || null,
                        })
                      }
                      className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-[17px] text-white outline-none [color-scheme:dark]"
                    />
                  </div>
                )}
              </div>

              {events.some((e) => e.id === draft.id) && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(draft.id)}
                  className="w-full rounded-[10px] bg-[#2c2c2e] py-3 text-center text-[17px] font-semibold text-[#ff453a] ring-1 ring-white/[0.06] active:bg-[#3a3a3c]"
                >
                  Delete Event
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div
            className="ios-font w-full max-w-sm overflow-hidden rounded-[14px] bg-[#2c2c2e] shadow-xl"
            style={{
              paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
            }}
          >
            <div className="px-4 py-4 text-center">
              <p className="text-[13px] font-medium text-[#8e8e93]">
                Delete this event?
              </p>
              <p className="mt-1 text-[13px] text-[#8e8e93]">This cannot be undone.</p>
            </div>
            <div className="flex border-t border-white/[0.12]">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="min-h-12 flex-1 text-[17px] font-semibold text-[#0a84ff] active:bg-white/[0.06]"
              >
                Cancel
              </button>
              <div className="w-px bg-white/[0.12]" />
              <button
                type="button"
                onClick={() => deleteEvent(confirmDeleteId)}
                className="min-h-12 flex-1 text-[17px] font-semibold text-[#ff453a] active:bg-white/[0.06]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
