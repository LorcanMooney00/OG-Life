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
 * Time-of-day “mood” colours used by the Home hero. We bias toward warm tones
 * around sunrise/golden hour and cool ones midday/late-night so the app picks
 * up a hint of the time you’re actually opening it. Returned hex strings get
 * composed into a translucent gradient over the dark base.
 */
export type DayMood = {
  /** Lead colour of the gradient (top-left). */
  from: string
  /** Secondary colour, blends to the dark base. */
  via: string
  /** Accent colour for chips / eyebrow text. */
  accent: string
  /** Short label, e.g. ‘evening’ — used as a subtle eyebrow if we want it. */
  label: string
}

export function moodByHour(hour: number): DayMood {
  if (hour < 5)
    return { from: '#1e1b4b', via: '#0a0a0d', accent: '#a5b4fc', label: 'late night' }
  if (hour < 9)
    return { from: '#fb923c', via: '#0c0c10', accent: '#fbbf24', label: 'sunrise' }
  if (hour < 12)
    return { from: '#38bdf8', via: '#0c0c10', accent: '#a5b4fc', label: 'morning' }
  if (hour < 17)
    return { from: '#0ea5e9', via: '#0c0c10', accent: '#818cf8', label: 'afternoon' }
  if (hour < 20)
    return { from: '#f97316', via: '#0c0c10', accent: '#fb7185', label: 'golden hour' }
  return { from: '#6366f1', via: '#0c0c10', accent: '#a5b4fc', label: 'evening' }
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
