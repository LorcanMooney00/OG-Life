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
