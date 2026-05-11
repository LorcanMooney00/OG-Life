import type { EventOccurrence } from './calendarOccurrences'
import { formatShortDayLabel, startOfDay, toYmd } from './date'

/** Combine an occurrence's date (local midnight) with its `HH:MM` time. */
function combineDateAndTime(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d
}

/**
 * Pick the soonest occurrence the user should care about right now.
 *
 * Preference order:
 *   1. Any occurrence today whose start-time is still in the future (with 1
 *      minute of slack so "Now" rows don't immediately drop off).
 *   2. The first all-day event today (if no timed events qualified).
 *   3. The first upcoming occurrence beyond today.
 */
export function pickNextOccurrence(
  now: Date,
  todays: EventOccurrence[],
  upcoming: EventOccurrence[],
): EventOccurrence | null {
  const nowMs = now.getTime()
  const slack = 60_000

  const timedToday = todays
    .filter((o) => o.event.eventTime)
    .map((o) => ({
      o,
      ms: combineDateAndTime(o.date, o.event.eventTime as string).getTime(),
    }))
    .filter((x) => x.ms >= nowMs - slack)
    .sort((a, b) => a.ms - b.ms)
  if (timedToday.length > 0) return timedToday[0].o

  const allDayToday = todays.find((o) => !o.event.eventTime)
  if (allDayToday) return allDayToday

  return upcoming[0] ?? null
}

/**
 * Friendly relative-time label for an occurrence:
 *   - "Now", "In 5 mins", "In 1h 23m"
 *   - "Today", "Tomorrow", "In 3 days", or short date for further away
 *   - "Just passed" if the start was within the last few minutes
 */
export function formatTimeUntil(now: Date, occ: EventOccurrence): string {
  // All-day: think in whole calendar days.
  if (!occ.event.eventTime) {
    const todayStart = startOfDay(now).getTime()
    const eventStart = startOfDay(occ.date).getTime()
    const diffDays = Math.round((eventStart - todayStart) / 86_400_000)
    if (diffDays <= 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays < 7) return `In ${diffDays} days`
    return formatShortDayLabel(occ.date)
  }

  const eventMs = combineDateAndTime(occ.date, occ.event.eventTime).getTime()
  const diffMs = eventMs - now.getTime()
  if (diffMs < -5 * 60_000) return 'Just passed'
  if (diffMs < 60_000) return 'Now'

  const mins = Math.round(diffMs / 60_000)
  if (mins < 60) return `In ${mins} min${mins === 1 ? '' : 's'}`

  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hrs < 24) {
    return remMins > 0 ? `In ${hrs}h ${remMins}m` : `In ${hrs}h`
  }
  const days = Math.floor(hrs / 24)
  return `In ${days} day${days === 1 ? '' : 's'}`
}

/** Whether an occurrence falls on the same calendar day as `now`. */
export function isOccurrenceToday(now: Date, occ: EventOccurrence): boolean {
  return occ.ymd === toYmd(now)
}

export type DashboardMood = {
  /** Tailwind gradient classes for the hero card background. */
  gradient: string
  /** Tailwind classes for the soft blurred glow orb in the corner. */
  glow: string
  /** Tailwind class for the small eyebrow text ("Next up", etc). */
  eyebrowText: string
  /** Tailwind class for the accent line (countdown). */
  accentText: string
}

const MOOD_MORNING: DashboardMood = {
  gradient: 'bg-gradient-to-br from-amber-500/25 via-[#1c1c1e] to-[#1c1c1e]',
  glow: 'bg-amber-400/20',
  eyebrowText: 'text-amber-200/85',
  accentText: 'text-amber-200',
}
const MOOD_DAY: DashboardMood = {
  gradient: 'bg-gradient-to-br from-sky-500/25 via-[#1c1c1e] to-[#1c1c1e]',
  glow: 'bg-sky-400/20',
  eyebrowText: 'text-sky-200/85',
  accentText: 'text-sky-200',
}
const MOOD_EVENING: DashboardMood = {
  gradient: 'bg-gradient-to-br from-fuchsia-500/30 via-[#1c1c1e] to-[#1c1c1e]',
  glow: 'bg-fuchsia-400/20',
  eyebrowText: 'text-fuchsia-200/85',
  accentText: 'text-fuchsia-200',
}
const MOOD_NIGHT: DashboardMood = {
  gradient: 'bg-gradient-to-br from-indigo-700/35 via-[#1c1c1e] to-[#1c1c1e]',
  glow: 'bg-indigo-400/20',
  eyebrowText: 'text-indigo-200/85',
  accentText: 'text-indigo-200',
}

/**
 * Pick a hero palette based on local hour so the home screen feels different
 * across the day without adding any new UI. Sunrise warmth → midday cool →
 * dusky purples → deep indigo for late-night.
 */
export function moodForHour(hour: number): DashboardMood {
  if (hour >= 5 && hour < 10) return MOOD_MORNING
  if (hour >= 10 && hour < 17) return MOOD_DAY
  if (hour >= 17 && hour < 21) return MOOD_EVENING
  return MOOD_NIGHT
}
