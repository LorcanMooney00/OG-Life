export function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a `YYYY-MM-DD` into a local-midnight Date (avoids UTC drift). */
export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

export function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export function endOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(23, 59, 59, 999)
  return c
}

export function compareEventTime(a: string | null, b: string | null): number {
  if (a && b) return a.localeCompare(b)
  if (a && !b) return -1
  if (!a && b) return 1
  return 0
}

/** “Good morning / afternoon / evening” based on local hour. */
export function greetingByHour(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** “Mon · 11 May” — short, scannable label for dashboard rows. */
export function formatShortDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** “Monday, 11 May” — used for the hero header on Home. */
export function formatLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** “2:30 PM” from a `HH:MM[:SS]` string; passthrough if parsing fails. */
export function formatClockTime(time: string | null): string | null {
  if (!time) return null
  try {
    const d = new Date(`2000-01-01T${time}`)
    if (Number.isNaN(d.getTime())) return time
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return time
  }
}

/**
 * Time-of-day “mood” colours used by the Home hero. We keep everything in the
 * warm spectrum (peach / amber / coral / rose) so the app reads as a glowy
 * dark theme rather than a cold one — even at midday and late at night. The
 * hex strings get composed into a translucent gradient layered over a warm
 * dark base (`tint` is that base — slightly brown rather than slate).
 */
export type DayMood = {
  /** Lead colour of the gradient (top-left). */
  from: string
  /** Secondary colour, sits in the middle of the gradient. */
  via: string
  /** Dark warm base the gradient finally settles to. */
  tint: string
  /** Accent colour for chips / eyebrow text — should pop on the dark base. */
  accent: string
  /** Short label, e.g. ‘evening’. Not currently rendered but handy for debug. */
  label: string
}

/**
 * Heuristic emoji for an anniversary / birthday event. Birthdays get the
 * cake, everything else the confetti popper. Same heuristic is used on the
 * Home countdown card and inside the calendar list so the two stay in sync.
 */
export function anniversaryEmoji(title: string): string {
  return /birthday|bday|b-day/i.test(title) ? '🎂' : '🎉'
}

/** Friendly countdown for an anniversary that's `days` away from today. */
export function anniversaryCountdownLabel(days: number): string {
  if (days <= 0) return 'Today!'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

export function moodByHour(hour: number): DayMood {
  if (hour < 5)
    return {
      from: '#a78bfa', // warm violet-rose
      via: '#7c3aed',
      tint: '#1a1320',
      accent: '#fbcfe8',
      label: 'late night',
    }
  if (hour < 9)
    return {
      from: '#fb923c', // sunrise peach
      via: '#f97316',
      tint: '#1c1410',
      accent: '#fed7aa',
      label: 'sunrise',
    }
  if (hour < 12)
    return {
      from: '#fbbf24', // warm amber morning
      via: '#f59e0b',
      tint: '#1c1610',
      accent: '#fef3c7',
      label: 'morning',
    }
  if (hour < 17)
    return {
      from: '#f59e0b', // afternoon gold
      via: '#f97316',
      tint: '#1c1510',
      accent: '#fcd34d',
      label: 'afternoon',
    }
  if (hour < 20)
    return {
      from: '#f97316', // golden hour orange
      via: '#ec4899',
      tint: '#1f1314',
      accent: '#fdba74',
      label: 'golden hour',
    }
  return {
    from: '#ec4899', // dusky rose evening
    via: '#a855f7',
    tint: '#1c1318',
    accent: '#f9a8d4',
    label: 'evening',
  }
}

/**
 * Format the *next event* card as two strings: a short live countdown
 * (e.g. "in 1h 23m", "starting now") and an absolute when-string
 * (e.g. "Today · 7:30 PM", "Tomorrow · all day", "Sat 18 May · 7:30 PM").
 *
 * The countdown is null when the event isn't actionable in countdown terms
 * (e.g. all-day event happening tomorrow) — in that case the absolute string
 * carries enough info on its own.
 */
export function formatNextWhen(
  date: Date,
  eventTime: string | null,
  now: Date,
): { countdown: string | null; when: string } {
  const startOfToday = startOfDay(now)
  const startOfTomorrow = addDays(startOfToday, 1)
  const startOfAfter = addDays(startOfToday, 2)

  let dt: Date
  if (eventTime) {
    const [h, m] = eventTime.split(':').map(Number)
    dt = new Date(date)
    dt.setHours(h ?? 0, m ?? 0, 0, 0)
  } else {
    dt = startOfDay(date)
  }

  let countdown: string | null = null
  if (eventTime) {
    const diffMs = dt.getTime() - now.getTime()
    const diffMin = Math.round(diffMs / 60000)
    if (diffMin >= 0 && diffMin < 24 * 60) {
      if (diffMin < 1) countdown = 'starting now'
      else if (diffMin < 60) countdown = `in ${diffMin} min`
      else {
        const h = Math.floor(diffMin / 60)
        const m = diffMin % 60
        countdown = m > 0 ? `in ${h}h ${m}m` : `in ${h}h`
      }
    }
  } else if (date >= startOfToday && date < startOfTomorrow) {
    countdown = 'happening today'
  }

  const clock = formatClockTime(eventTime)
  let when: string
  if (date >= startOfToday && date < startOfTomorrow) {
    when = clock ? `Today · ${clock}` : 'Today · all day'
  } else if (date >= startOfTomorrow && date < startOfAfter) {
    when = clock ? `Tomorrow · ${clock}` : 'Tomorrow · all day'
  } else {
    const dayLabel = formatShortDayLabel(date)
    when = clock ? `${dayLabel} · ${clock}` : `${dayLabel} · all day`
  }

  return { countdown, when }
}
