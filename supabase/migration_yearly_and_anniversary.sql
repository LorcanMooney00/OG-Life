-- Adds yearly recurrence + anniversary flag to calendar_events.
--
-- Safe to run multiple times: drops and re-adds the recurrence CHECK
-- constraint so the previous wording (without 'yearly') is replaced, and
-- the is_anniversary column is added IF NOT EXISTS.
--
-- Run this in the Supabase SQL editor against your project DB.

begin;

-- 1. Allow recurrence = 'yearly'.
alter table public.calendar_events
  drop constraint if exists calendar_events_recurrence_check;

alter table public.calendar_events
  add constraint calendar_events_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'biweekly', 'every4weeks', 'monthly', 'yearly'));

-- 2. Anniversary flag — surfaces the event as a Home-dashboard countdown
--    card in the week leading up to each occurrence.
alter table public.calendar_events
  add column if not exists is_anniversary boolean not null default false;

commit;
