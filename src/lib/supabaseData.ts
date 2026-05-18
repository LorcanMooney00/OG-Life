import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarEvent, ShoppingItem } from '../types'
import { toYmd } from './date'
import { normalizeQuantity } from './shoppingDisplay'

// `*` keeps the SELECT working when (optional) columns haven’t been added to
// the Supabase project yet — the row mapper reads them defensively. Applies
// to both calendar (`is_anniversary`) and shopping (`sort_order`).
const CAL_SELECT = '*'
const SHOP_SELECT = '*'

/**
 * Tracks whether the running Supabase project has the `sort_order` column.
 * Detected lazily on the first fetch:
 *   - true  → include `sort_order` in inserts/updates and order by it on fetch.
 *   - false → strip it from payloads (drag-to-reorder is a no-op until the
 *             migration in `supabase/migration_shopping_sort_order.sql` is run).
 *   - null  → not yet determined; assume true and let `fetchShoppingItems`
 *             flip the flag if it sees the “column does not exist” error.
 */
let sortOrderSupported: boolean | null = null
/**
 * Same lazy-detect pattern for the `is_anniversary` column on calendar_events.
 * Flipped to false on the first persist that errors with “column does not
 * exist”, after which we strip it from subsequent inserts/updates. (Reads
 * already use `r.is_anniversary ?? false` so SELECTs degrade silently.)
 */
let anniversarySupported: boolean | null = null

/** Postgres SQLSTATE 42703 = `undefined_column`. PostgREST also surfaces this
 * inside `error.message`. */
function isMissingColumnError(
  err: { code?: string; message?: string } | null,
  column: string,
): boolean {
  if (!err) return false
  if (err.code === '42703') return true
  return (
    new RegExp(column).test(err.message ?? '') &&
    /does not exist|could not find/i.test(err.message ?? '')
  )
}
function isMissingSortOrderError(err: { code?: string; message?: string } | null) {
  return isMissingColumnError(err, 'sort_order')
}
function isMissingAnniversaryError(err: { code?: string; message?: string } | null) {
  return isMissingColumnError(err, 'is_anniversary')
}

type CalendarRow = {
  id: string
  created_by: string
  title: string
  notes: string
  event_date: string
  event_time: string | null
  recurrence: CalendarEvent['recurrence']
  recurrence_end_date: string | null
  /** Optional — present once the user has run migration_yearly_and_anniversary.sql. */
  is_anniversary?: boolean | null
  created_at: string
}

type ShoppingRow = {
  id: string
  created_by: string
  item_name: string
  quantity: string | null
  purchased: boolean
  sort_order: number | null
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
    isAnniversary: Boolean(r.is_anniversary),
    createdAt: r.created_at,
  }
}

export function rowToShoppingItem(r: ShoppingRow): ShoppingItem {
  return {
    id: r.id,
    name: r.item_name,
    quantity: normalizeQuantity(r.quantity),
    purchased: r.purchased,
    sortOrder: r.sort_order ?? 0,
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
  // Try the new ordering first. If the column isn’t deployed yet we’ll get a
  // PostgREST/Postgres “column does not exist” error and silently fall back.
  if (sortOrderSupported !== false) {
    const { data, error } = await client
      .from('shopping_items')
      .select(SHOP_SELECT)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (!error) {
      if (sortOrderSupported === null) sortOrderSupported = true
      return (data as ShoppingRow[] | null)?.map(rowToShoppingItem) ?? []
    }
    if (!isMissingSortOrderError(error)) throw error
    sortOrderSupported = false
  }

  const { data, error } = await client
    .from('shopping_items')
    .select(SHOP_SELECT)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data as ShoppingRow[] | null)?.map(rowToShoppingItem) ?? []
}

function eventPayload(e: CalendarEvent, userId: string) {
  const base = {
    id: e.id,
    created_by: userId,
    title: e.title,
    notes: e.notes,
    event_date: e.eventDate,
    event_time: e.eventTime,
    recurrence: e.recurrence,
    recurrence_end_date: e.recurrenceEndDate,
  }
  // Only attach is_anniversary when the column is known to exist; otherwise
  // PostgREST rejects the whole row with a 400.
  return anniversarySupported === false
    ? base
    : { ...base, is_anniversary: e.isAnniversary }
}

function shoppingPayload(i: ShoppingItem, userId: string) {
  const base = {
    id: i.id,
    created_by: userId,
    item_name: i.name,
    quantity: normalizeQuantity(i.quantity),
    purchased: i.purchased,
  }
  // Only attach sort_order when the column is known to exist; otherwise
  // PostgREST rejects the whole row with a 400.
  return sortOrderSupported === false
    ? base
    : { ...base, sort_order: i.sortOrder }
}

function sameEvent(a: CalendarEvent, b: CalendarEvent) {
  return (
    a.title === b.title &&
    a.notes === b.notes &&
    a.eventDate === b.eventDate &&
    a.eventTime === b.eventTime &&
    a.recurrence === b.recurrence &&
    a.recurrenceEndDate === b.recurrenceEndDate &&
    a.isAnniversary === b.isAnniversary
  )
}

function sameItem(a: ShoppingItem, b: ShoppingItem) {
  return (
    a.name === b.name &&
    a.quantity === b.quantity &&
    a.purchased === b.purchased &&
    a.sortOrder === b.sortOrder
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
      if (error && isMissingAnniversaryError(error)) {
        // Mirror the sort_order fallback: strip the new column and retry once,
        // then remember the column is missing so we stop sending it.
        anniversarySupported = false
        const retry = await client
          .from('calendar_events')
          .insert(eventPayload(e, userId))
        if (retry.error) console.error('calendar insert', retry.error)
      } else if (error) {
        console.error('calendar insert', error)
      }
      continue
    }
    const p = prevMap.get(e.id)!
    if (!sameEvent(p, e)) {
      const updatePayload: Record<string, unknown> = {
        title: e.title,
        notes: e.notes,
        event_date: e.eventDate,
        event_time: e.eventTime,
        recurrence: e.recurrence,
        recurrence_end_date: e.recurrenceEndDate,
      }
      if (anniversarySupported !== false) {
        updatePayload.is_anniversary = e.isAnniversary
      }
      const { error } = await client
        .from('calendar_events')
        .update(updatePayload)
        .eq('id', e.id)
      if (error && isMissingAnniversaryError(error)) {
        anniversarySupported = false
        delete updatePayload.is_anniversary
        const retry = await client
          .from('calendar_events')
          .update(updatePayload)
          .eq('id', e.id)
        if (retry.error) console.error('calendar update', retry.error)
      } else if (error) {
        console.error('calendar update', error)
      }
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
      if (error && isMissingSortOrderError(error)) {
        // Same fallback as on UPDATE: drop sort_order and retry once.
        sortOrderSupported = false
        const retry = await client
          .from('shopping_items')
          .insert(shoppingPayload(item, userId))
        if (retry.error) console.error('shopping insert', retry.error)
      } else if (error) {
        console.error('shopping insert', error)
      }
      continue
    }
    const p = prevMap.get(item.id)!
    if (!sameItem(p, item)) {
      const updatePayload: Record<string, unknown> = {
        item_name: item.name,
        quantity: item.quantity,
        purchased: item.purchased,
      }
      if (sortOrderSupported !== false) {
        updatePayload.sort_order = item.sortOrder
      }
      const { error } = await client
        .from('shopping_items')
        .update(updatePayload)
        .eq('id', item.id)
      // If the column truly isn’t there, flip the flag and retry without it
      // so a subsequent partner edit doesn’t spam errors forever.
      if (error && isMissingSortOrderError(error)) {
        sortOrderSupported = false
        delete updatePayload.sort_order
        const retry = await client
          .from('shopping_items')
          .update(updatePayload)
          .eq('id', item.id)
        if (retry.error) console.error('shopping update', retry.error)
      } else if (error) {
        console.error('shopping update', error)
      }
    }
  }
}
