import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarEvent, ShoppingItem } from '../types'
import { toYmd } from './date'

const CAL_SELECT =
  'id,created_by,title,notes,event_date,event_time,recurrence,recurrence_end_date,created_at'

const SHOP_SELECT = 'id,created_by,item_name,quantity,purchased,created_at'

type CalendarRow = {
  id: string
  created_by: string
  title: string
  notes: string
  event_date: string
  event_time: string | null
  recurrence: CalendarEvent['recurrence']
  recurrence_end_date: string | null
  created_at: string
}

type ShoppingRow = {
  id: string
  created_by: string
  item_name: string
  quantity: string | null
  purchased: boolean
  created_at: string
}

export function rowToEvent(r: CalendarRow): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    eventDate: r.event_date,
    eventTime: r.event_time,
    recurrence: r.recurrence,
    recurrenceEndDate: r.recurrence_end_date,
    createdAt: r.created_at,
  }
}

export function rowToShoppingItem(r: ShoppingRow): ShoppingItem {
  return {
    id: r.id,
    name: r.item_name,
    quantity: r.quantity,
    purchased: r.purchased,
    createdAt: r.created_at,
  }
}

async function fetchCalendarRowsForRange(
  client: SupabaseClient,
  pStart: string,
  pEnd: string,
): Promise<CalendarEvent[]> {
  const rpc = await client.rpc('calendar_events_for_month', {
    p_start: pStart,
    p_end: pEnd,
  })

  if (!rpc.error && rpc.data) {
    return (rpc.data as CalendarRow[]).map(rowToEvent)
  }

  const [noneSeries, recurring] = await Promise.all([
    client
      .from('calendar_events')
      .select(CAL_SELECT)
      .eq('recurrence', 'none')
      .gte('event_date', pStart)
      .lte('event_date', pEnd),
    client
      .from('calendar_events')
      .select(CAL_SELECT)
      .neq('recurrence', 'none')
      .lte('event_date', pEnd)
      .or(`recurrence_end_date.is.null,recurrence_end_date.gte.${pStart}`),
  ])

  const merged = new Map<string, CalendarRow>()
  for (const row of noneSeries.data ?? []) merged.set(row.id, row as CalendarRow)
  for (const row of recurring.data ?? []) merged.set(row.id, row as CalendarRow)

  return [...merged.values()].map(rowToEvent)
}

export async function fetchCalendarEventsForMonth(
  client: SupabaseClient,
  year: number,
  monthIndex: number,
): Promise<CalendarEvent[]> {
  const pStart = toYmd(new Date(year, monthIndex, 1))
  const pEnd = toYmd(new Date(year, monthIndex + 1, 0))
  return fetchCalendarRowsForRange(client, pStart, pEnd)
}

/** Wider range for home stats (not full expansion of recurring occurrences). */
export async function fetchCalendarEventsForDashboard(
  client: SupabaseClient,
): Promise<CalendarEvent[]> {
  const start = new Date()
  const end = new Date(start)
  end.setMonth(end.getMonth() + 6)
  return fetchCalendarRowsForRange(client, toYmd(start), toYmd(end))
}

export async function fetchShoppingItems(
  client: SupabaseClient,
): Promise<ShoppingItem[]> {
  const { data, error } = await client
    .from('shopping_items')
    .select(SHOP_SELECT)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data as ShoppingRow[] | null)?.map(rowToShoppingItem) ?? []
}

function eventPayload(e: CalendarEvent, userId: string) {
  return {
    id: e.id,
    created_by: userId,
    title: e.title,
    notes: e.notes,
    event_date: e.eventDate,
    event_time: e.eventTime,
    recurrence: e.recurrence,
    recurrence_end_date: e.recurrenceEndDate,
  }
}

function shoppingPayload(i: ShoppingItem, userId: string) {
  return {
    id: i.id,
    created_by: userId,
    item_name: i.name,
    quantity: i.quantity,
    purchased: i.purchased,
  }
}

function sameEvent(a: CalendarEvent, b: CalendarEvent) {
  return (
    a.title === b.title &&
    a.notes === b.notes &&
    a.eventDate === b.eventDate &&
    a.eventTime === b.eventTime &&
    a.recurrence === b.recurrence &&
    a.recurrenceEndDate === b.recurrenceEndDate
  )
}

function sameItem(a: ShoppingItem, b: ShoppingItem) {
  return (
    a.name === b.name &&
    a.quantity === b.quantity &&
    a.purchased === b.purchased
  )
}

export async function persistCalendarChange(
  client: SupabaseClient,
  userId: string,
  prev: CalendarEvent[],
  next: CalendarEvent[],
) {
  const prevMap = new Map(prev.map((e) => [e.id, e]))
  const nextMap = new Map(next.map((e) => [e.id, e]))

  const removed = [...prevMap.keys()].filter((id) => !nextMap.has(id))
  for (const id of removed) {
    const { error } = await client.from('calendar_events').delete().eq('id', id)
    if (error) console.error('calendar delete', error)
  }

  for (const e of next) {
    if (!prevMap.has(e.id)) {
      const { error } = await client
        .from('calendar_events')
        .insert(eventPayload(e, userId))
      if (error) console.error('calendar insert', error)
      continue
    }
    const p = prevMap.get(e.id)!
    if (!sameEvent(p, e)) {
      const { error } = await client
        .from('calendar_events')
        .update({
          title: e.title,
          notes: e.notes,
          event_date: e.eventDate,
          event_time: e.eventTime,
          recurrence: e.recurrence,
          recurrence_end_date: e.recurrenceEndDate,
        })
        .eq('id', e.id)
      if (error) console.error('calendar update', error)
    }
  }
}

export async function persistShoppingChange(
  client: SupabaseClient,
  userId: string,
  prev: ShoppingItem[],
  next: ShoppingItem[],
) {
  const prevMap = new Map(prev.map((i) => [i.id, i]))
  const nextMap = new Map(next.map((i) => [i.id, i]))

  const removed = [...prevMap.keys()].filter((id) => !nextMap.has(id))
  for (const id of removed) {
    const { error } = await client.from('shopping_items').delete().eq('id', id)
    if (error) console.error('shopping delete', error)
  }

  for (const item of next) {
    if (!prevMap.has(item.id)) {
      const { error } = await client
        .from('shopping_items')
        .insert(shoppingPayload(item, userId))
      if (error) console.error('shopping insert', error)
      continue
    }
    const p = prevMap.get(item.id)!
    if (!sameItem(p, item)) {
      const { error } = await client
        .from('shopping_items')
        .update({
          item_name: item.name,
          quantity: item.quantity,
          purchased: item.purchased,
        })
        .eq('id', item.id)
      if (error) console.error('shopping update', error)
    }
  }
}
