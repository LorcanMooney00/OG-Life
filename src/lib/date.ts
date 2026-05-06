export function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function compareEventTime(a: string | null, b: string | null): number {
  if (a && b) return a.localeCompare(b)
  if (a && !b) return -1
  if (!a && b) return 1
  return 0
}
