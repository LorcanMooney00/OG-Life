export type CalendarEvent = {
  id: string
  title: string
  notes: string
  eventDate: string
  eventTime: string | null
  recurrence: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
  recurrenceEndDate: string | null
  createdAt: string
}

export type ShoppingItem = {
  id: string
  name: string
  quantity: string | null
  purchased: boolean
  createdAt: string
}
