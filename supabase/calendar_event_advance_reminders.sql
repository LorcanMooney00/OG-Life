-- OG Life — “advance” calendar reminders for recurring events.
--
-- Adds two new reminder channels that fire ahead of recurring events:
--   • biweekly events  → day-before notice    (T-1 day)
--   • yearly   events  → week-before notice   (T-7 days)
--
-- Both fire ONCE per occurrence per kind, deduped via
-- `calendar_event_reminder_log` so subsequent cron passes are no-ops.
--
-- Requirements (run these first, in order):
--   1. supabase/push_partner_alerts.sql  (creates og_push_config + Edge Function plumbing)
--   2. supabase/migration_yearly_and_anniversary.sql  (adds is_anniversary column
--      + 'yearly' to the recurrence CHECK constraint)
--   3. supabase/calendar_event_reminders.sql  (original 30-min reminder fn,
--      not required but recommended so all reminder kinds live side-by-side)
--   4. pg_cron extension enabled (Supabase Dashboard → Extensions)
--
-- Time of day:
--   The cron schedule fires once a day at 09:00 UTC. For Ireland/UK that lands
--   at 09:00 GMT in winter or 10:00 BST in summer. If you want a different time,
--   edit the cron expression at the bottom of this file and re-run.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Per-occurrence reminder dedup log
-- ---------------------------------------------------------------------------
-- One row per (event, occurrence_date, kind). The PRIMARY KEY guarantees a
-- given push is sent at most once even if the cron job double-fires.
create table if not exists public.calendar_event_reminder_log (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  occurrence_date date not null,
  kind text not null check (kind in ('30min', 'day_before', 'week_before')),
  sent_at timestamptz not null default now(),
  primary key (event_id, occurrence_date, kind)
);

create index if not exists calendar_event_reminder_log_event_idx
  on public.calendar_event_reminder_log (event_id);

-- ---------------------------------------------------------------------------
-- Internal helper: POST one push notification through the Edge Function.
-- Keeps the body shape consistent across creator + partner + reminder kinds.
-- ---------------------------------------------------------------------------
create or replace function public._og_post_advance_reminder(
  p_base_url text,
  p_secret text,
  p_event_id uuid,
  p_title text,
  p_target_date date,
  p_event_time text,
  p_created_by uuid,
  p_target_user uuid,
  p_kind text,
  p_is_anniversary boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := p_base_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-og-push-secret', p_secret
    ),
    body := jsonb_build_object(
      'type', 'event',
      'event_id', p_event_id,
      'user_id', p_target_user,
      'title', p_title,
      'event_date', p_target_date,
      'event_time', p_event_time,
      'created_by', p_created_by,
      'reminder', true,
      'reminder_kind', p_kind,
      'is_anniversary', p_is_anniversary
    )
  );
exception
  when others then
    raise warning 'og advance reminder: user % event % kind %: %',
      p_target_user, p_event_id, p_kind, sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Main advance-reminder function. Walks biweekly and yearly events whose
-- next occurrence aligns with the target date and posts pushes to creator +
-- linked partners, logging each (event, occurrence_date, kind) so subsequent
-- runs become no-ops.
-- ---------------------------------------------------------------------------
create or replace function public.send_og_calendar_advance_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  secret text;
  ev record;
  partner uuid;
  target_date date;
begin
  select c.value into base_url from public.og_push_config c where c.key = 'edge_url' limit 1;
  select c.value into secret from public.og_push_config c where c.key = 'webhook_secret' limit 1;

  if base_url is null or secret is null
     or strpos(base_url, 'YOUR_PROJECT_REF') > 0
     or strpos(secret, 'REPLACE_WITH_LONG_RANDOM_SECRET') > 0 then
    raise warning 'og advance reminders: fix og_push_config.edge_url and webhook_secret';
    return;
  end if;

  -- =====================================================================
  -- Biweekly: day-before notice (target = tomorrow)
  -- =====================================================================
  -- An event recurs on `target_date` iff:
  --   • its original event_date is on/before target_date,
  --   • (target_date − event_date) is a multiple of 14 days,
  --   • its recurrence hasn't ended before target_date.
  target_date := current_date + 1;

  for ev in
    select
      e.id,
      e.title,
      e.event_date,
      e.event_time,
      e.created_by,
      coalesce(e.is_anniversary, false) as is_anniversary
    from public.calendar_events e
    where e.recurrence = 'biweekly'
      and e.event_date <= target_date
      and ((target_date - e.event_date) % 14) = 0
      and (e.recurrence_end_date is null or e.recurrence_end_date >= target_date)
      and not exists (
        select 1 from public.calendar_event_reminder_log l
        where l.event_id = e.id
          and l.occurrence_date = target_date
          and l.kind = 'day_before'
      )
  loop
    -- Creator
    perform public._og_post_advance_reminder(
      base_url, secret, ev.id, ev.title, target_date, ev.event_time,
      ev.created_by, ev.created_by, 'day_before', ev.is_anniversary
    );
    -- Linked partners
    for partner in
      select pl.partner_id
      from public.partner_links pl
      where pl.user_id = ev.created_by
    loop
      if partner is distinct from ev.created_by then
        perform public._og_post_advance_reminder(
          base_url, secret, ev.id, ev.title, target_date, ev.event_time,
          ev.created_by, partner, 'day_before', ev.is_anniversary
        );
      end if;
    end loop;

    insert into public.calendar_event_reminder_log (event_id, occurrence_date, kind)
    values (ev.id, target_date, 'day_before')
    on conflict do nothing;
  end loop;

  -- =====================================================================
  -- Yearly: week-before notice (target = today + 7 days)
  -- =====================================================================
  -- An event recurs on `target_date` iff its (month, day) matches the
  -- target's (month, day), or — special-case — the original is Feb 29 and
  -- the target is Feb 28 in a non-leap year (matches the client expansion).
  target_date := current_date + 7;

  for ev in
    select
      e.id,
      e.title,
      e.event_date,
      e.event_time,
      e.created_by,
      coalesce(e.is_anniversary, false) as is_anniversary
    from public.calendar_events e
    where e.recurrence = 'yearly'
      and e.event_date <= target_date
      and (e.recurrence_end_date is null or e.recurrence_end_date >= target_date)
      and (
        (extract(month from e.event_date) = extract(month from target_date)
         and extract(day   from e.event_date) = extract(day   from target_date))
        or
        (extract(month from e.event_date) = 2
         and extract(day from e.event_date) = 29
         and extract(month from target_date) = 2
         and extract(day from target_date) = 28
         and not (
           (extract(year from target_date)::int % 4 = 0)
           and (extract(year from target_date)::int % 100 <> 0
                or extract(year from target_date)::int % 400 = 0)
         ))
      )
      and not exists (
        select 1 from public.calendar_event_reminder_log l
        where l.event_id = e.id
          and l.occurrence_date = target_date
          and l.kind = 'week_before'
      )
  loop
    perform public._og_post_advance_reminder(
      base_url, secret, ev.id, ev.title, target_date, ev.event_time,
      ev.created_by, ev.created_by, 'week_before', ev.is_anniversary
    );
    for partner in
      select pl.partner_id
      from public.partner_links pl
      where pl.user_id = ev.created_by
    loop
      if partner is distinct from ev.created_by then
        perform public._og_post_advance_reminder(
          base_url, secret, ev.id, ev.title, target_date, ev.event_time,
          ev.created_by, partner, 'week_before', ev.is_anniversary
        );
      end if;
    end loop;

    insert into public.calendar_event_reminder_log (event_id, occurrence_date, kind)
    values (ev.id, target_date, 'week_before')
    on conflict do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Idempotent cron schedule: drop any prior version of the job and reinstate
-- it. Fires daily at 09:00 UTC.
-- ---------------------------------------------------------------------------
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'og-calendar-advance-reminders' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end;
$$;

select cron.schedule(
  'og-calendar-advance-reminders',
  '0 9 * * *',
  $$select public.send_og_calendar_advance_reminders()$$
);

-- Verify:
--   select * from cron.job where jobname = 'og-calendar-advance-reminders';
--   select public.send_og_calendar_advance_reminders();   -- manual fire
--   select * from public.calendar_event_reminder_log
--     order by sent_at desc limit 20;
