export type CalendarEvent = {
  id: string
  title: string
  notes: string
  eventDate: string
  eventTime: string | null
  recurrence:
    | 'none'
    | 'daily'
    | 'weekly'
    | 'biweekly'
    | 'every4weeks'
    | 'monthly'
    | 'yearly'
  recurrenceEndDate: string | null
  /**
   * Marks this event as an anniversary / birthday. When true the Home
   * dashboard will surface it as a countdown card in the week leading up to
   * each occurrence, and we’ll annotate the title with an emoji in lists.
   * Independent of `recurrence` so one-offs (first dates, etc.) work too,
   * but the form defaults to `recurrence: 'yearly'` when the toggle is on.
   */
  isAnniversary: boolean
  createdAt: string
}

export type ShoppingItem = {
  id: string
  name: string
  quantity: string | null
  purchased: boolean
  sortOrder: number
  createdAt: string
}

export type AuthUser = {
  id: string
  email?: string
}

export type PartnerSummary = {
  id: string
  email: string
  username: string | null
}
