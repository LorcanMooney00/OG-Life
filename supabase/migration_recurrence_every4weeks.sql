-- Allow the new 'every4weeks' recurrence on existing calendar_events.
-- Safe to run multiple times.

alter table public.calendar_events
  drop constraint if exists calendar_events_recurrence_check;

alter table public.calendar_events
  add constraint calendar_events_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'biweekly', 'every4weeks', 'monthly'));
