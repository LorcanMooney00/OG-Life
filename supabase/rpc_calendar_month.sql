-- Run once in Supabase SQL Editor (after schema.sql) for efficient calendar reads.
-- Returns event *series* rows that can appear during [p_start, p_end] (inclusive dates).

create or replace function public.calendar_events_for_month(p_start date, p_end date)
returns setof public.calendar_events
language sql
stable
security invoker
set search_path = public
as $$
  select e.*
  from public.calendar_events e
  where
    e.event_date <= p_end
    and (
      (e.recurrence = 'none' and e.event_date >= p_start and e.event_date <= p_end)
      or
      (
        e.recurrence <> 'none'
        and (e.recurrence_end_date is null or e.recurrence_end_date >= p_start)
      )
    );
$$;

revoke all on function public.calendar_events_for_month(date, date) from public;
grant execute on function public.calendar_events_for_month(date, date) to authenticated;
