import type { CalendarEvent } from '../types'
import { addDays, endOfDay, parseYmd, startOfDay, toYmd } from './date'

export type EventOccurrence = {
  event: CalendarEvent
  date: Date
  ymd: string
}

/**
 * Expand a single event into concrete occurrence dates falling within [rangeStart, rangeEnd]
 * (both inclusive). Mirrors the recurrence stepping used by `CalendarView`.
 */
export function expandEventInRange(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const rangeStartDay = startOfDay(rangeStart)
  const rangeEndDay = endOfDay(rangeEnd)
  const start = parseYmd(event.eventDate)
  const recurrenceEnd = event.recurrenceEndDate
    ? endOfDay(parseYmd(event.recurrenceEndDate))
    : null

  if (event.recurrence === 'none') {
    return start >= rangeStartDay && start <= rangeEndDay
      ? [{ event, date: start, ymd: toYmd(start) }]
      : []
  }

  const hardEnd = recurrenceEnd && recurrenceEnd < rangeEndDay ? recurrenceEnd : rangeEndDay
  if (hardEnd < rangeStartDay) return []

  const out: EventOccurrence[] = []
  const cursor = new Date(start)
  // Cap iterations to keep this cheap on very long horizons.
  for (let safety = 0; safety < 1000 && cursor <= hardEnd; safety++) {
    if (cursor >= rangeStartDay) {
      out.push({ event, date: new Date(cursor), ymd: toYmd(cursor) })
    }

    if (event.recurrence === 'daily') {
      cursor.setDate(cursor.getDate() + 1)
    } else if (event.recurrence === 'weekly') {
      cursor.setDate(cursor.getDate() + 7)
    } else if (event.recurrence === 'biweekly') {
      cursor.setDate(cursor.getDate() + 14)
    } else if (event.recurrence === 'every4weeks') {
      cursor.setDate(cursor.getDate() + 28)
    } else if (event.recurrence === 'monthly') {
      const targetDay = start.getDate()
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const maxDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
      nextMonth.setDate(Math.min(targetDay, maxDay))
      cursor.setTime(nextMonth.getTime())
    } else if (event.recurrence === 'yearly') {
      // Step the cursor exactly one year. Feb 29 falls back to Feb 28 in
      // non-leap years so the series doesn't silently skip a year.
      const targetMonth = start.getMonth()
      const targetDay = start.getDate()
      const nextYear = cursor.getFullYear() + 1
      const maxDay = new Date(nextYear, targetMonth + 1, 0).getDate()
      cursor.setFullYear(nextYear, targetMonth, Math.min(targetDay, maxDay))
    } else {
      break
    }
  }

  return out
}

/** Collect occurrences for a whole list of events, sorted by date then time. */
export function collectOccurrencesInRange(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const all: EventOccurrence[] = []
  for (const ev of events) {
    all.push(...expandEventInRange(ev, rangeStart, rangeEnd))
  }
  all.sort((a, b) => {
    if (a.ymd !== b.ymd) return a.ymd < b.ymd ? -1 : 1
    const at = a.event.eventTime ?? ''
    const bt = b.event.eventTime ?? ''
    if (at && bt) return at.localeCompare(bt)
    if (at && !bt) return -1
    if (!at && bt) return 1
    return 0
  })
  return all
}

/** Occurrences for a single calendar day. */
export function occurrencesOnDate(events: CalendarEvent[], date: Date): EventOccurrence[] {
  return collectOccurrencesInRange(events, startOfDay(date), endOfDay(date))
}

/** Upcoming N occurrences strictly after `from`, within `lookaheadDays`. */
export function nextUpcomingOccurrences(
  events: CalendarEvent[],
  from: Date,
  lookaheadDays: number,
  limit: number,
): EventOccurrence[] {
  const start = startOfDay(from)
  const end = endOfDay(addDays(start, lookaheadDays))
  const all = collectOccurrencesInRange(events, start, end)
  return all.slice(0, limit)
}

/**
 * Anniversaries (events with `isAnniversary === true`) whose next occurrence
 * falls within `withinDays`. Returns each as an `AnniversaryUpcoming` carrying
 * the upcoming occurrence + the integer number of years since the original
 * event date (so a wedding from 2020 shows "5 years" on its 2025 anniversary).
 * Sorted soonest-first.
 */
export type AnniversaryUpcoming = {
  occurrence: EventOccurrence
  /** Days until the upcoming occurrence (0 = today). */
  daysUntil: number
  /** Integer years since the original `event.eventDate`. 0 if same year. */
  yearsSince: number
}

export function findUpcomingAnniversaries(
  events: CalendarEvent[],
  now: Date,
  withinDays = 7,
): AnniversaryUpcoming[] {
  const start = startOfDay(now)
  const end = endOfDay(addDays(start, withinDays))
  // Only expand anniversary events to keep this cheap; recurrence handling
  // means non-yearly anniversaries (e.g. a one-off "first date") still surface.
  const flagged = events.filter((e) => e.isAnniversary)
  if (flagged.length === 0) return []
  const all = collectOccurrencesInRange(flagged, start, end)
  const out: AnniversaryUpcoming[] = []
  for (const o of all) {
    const occDay = startOfDay(o.date)
    const daysUntil = Math.round((occDay.getTime() - start.getTime()) / 86_400_000)
    if (daysUntil < 0 || daysUntil > withinDays) continue
    const origin = parseYmd(o.event.eventDate)
    const yearsSince = Math.max(0, occDay.getFullYear() - origin.getFullYear())
    out.push({ occurrence: o, daysUntil, yearsSince })
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil)
}

/**
 * The single next *actionable* occurrence used by the Home hero’s “Next up”
 * tile. A timed event is considered past once `now` crosses its start; an
 * all-day event is considered ongoing until end-of-day. Returns `null` when
 * nothing within `lookaheadDays` qualifies.
 */
export function findNextOccurrence(
  events: CalendarEvent[],
  now: Date,
  lookaheadDays = 30,
): EventOccurrence | null {
  const start = startOfDay(now)
  const end = endOfDay(addDays(start, lookaheadDays))
  const all = collectOccurrencesInRange(events, start, end)
  for (const o of all) {
    if (o.event.eventTime) {
      const [h, m] = o.event.eventTime.split(':').map(Number)
      const dt = new Date(o.date)
      dt.setHours(h ?? 0, m ?? 0, 0, 0)
      if (dt.getTime() > now.getTime()) return o
    } else {
      // All-day events stay "next" through the rest of their day.
      if (o.date.getTime() >= start.getTime()) return o
    }
  }
  return null
}
