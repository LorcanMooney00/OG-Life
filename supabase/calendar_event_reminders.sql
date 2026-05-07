-- OG Life — calendar reminders ~30 minutes before start (Lifestyle-App pattern).
-- Requires: push_partner_alerts.sql applied (og_push_config, pg_net, Edge Function deployed).
-- Requires: Supabase **pg_cron** enabled for your project (often Pro; check Dashboard → Extensions).
--
-- Behaviour (matches Lifestyle closely):
-- - Every 5 minutes, find non-recurring events with a time, reminder not sent yet,
--   whose start falls between NOW()+25min and NOW()+35min (targets ~30 min before).
-- - Notifies **creator** and each **linked partner** (partner_links), same as instant event pushes.
-- - Recurring series (daily/weekly/…) are **skipped** — one DB row can’t represent the next
--   occurrence without expansion; we can add that later.
-- - Times: `event_date` + `event_time` (HTML `type="time"` → `HH:MM`) are interpreted in the
--   database session timezone (Supabase often UTC). If reminders feel “wrong”, set DB timezone
--   or we can switch to a named zone later.
--
-- Run in SQL Editor after replacing nothing if og_push_config is already correct.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.calendar_events
  add column if not exists reminder_sent_at timestamptz;

create index if not exists calendar_events_reminder_sent_at_idx
  on public.calendar_events (reminder_sent_at)
  where reminder_sent_at is null;

create or replace function public.send_og_calendar_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  secret text;
  win_start timestamptz;
  win_end timestamptz;
  ev record;
  partner uuid;
begin
  select c.value into base_url from public.og_push_config c where c.key = 'edge_url' limit 1;
  select c.value into secret from public.og_push_config c where c.key = 'webhook_secret' limit 1;

  if base_url is null or secret is null
     or strpos(base_url, 'YOUR_PROJECT_REF') > 0
     or strpos(secret, 'REPLACE_WITH_LONG_RANDOM_SECRET') > 0 then
    raise warning 'og calendar reminders: fix og_push_config.edge_url and webhook_secret';
    return;
  end if;

  win_start := now() + interval '25 minutes';
  win_end := now() + interval '35 minutes';

  for ev in
    select
      e.id,
      e.title,
      e.event_date,
      e.event_time,
      e.created_by
    from public.calendar_events e
    where e.recurrence = 'none'
      and e.event_time is not null
      and trim(e.event_time) <> ''
      and e.reminder_sent_at is null
      and e.event_date between current_date and current_date + 2
      and (e.event_date + e.event_time::time)::timestamptz between win_start and win_end
  loop
    -- Creator
    begin
      perform net.http_post(
        url := base_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-og-push-secret', secret
        ),
        body := jsonb_build_object(
          'type', 'event',
          'event_id', ev.id,
          'user_id', ev.created_by,
          'title', ev.title,
          'event_date', ev.event_date,
          'event_time', ev.event_time,
          'created_by', ev.created_by,
          'reminder', true
        )
      );
    exception
      when others then
        raise warning 'og reminder: creator % event %: %', ev.created_by, ev.id, sqlerrm;
    end;

    -- Linked partners
    for partner in
      select pl.partner_id
      from public.partner_links pl
      where pl.user_id = ev.created_by
    loop
      if partner is distinct from ev.created_by then
        begin
          perform net.http_post(
            url := base_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-og-push-secret', secret
            ),
            body := jsonb_build_object(
              'type', 'event',
              'event_id', ev.id,
              'user_id', partner,
              'title', ev.title,
              'event_date', ev.event_date,
              'event_time', ev.event_time,
              'created_by', ev.created_by,
              'reminder', true
            )
          );
        exception
          when others then
            raise warning 'og reminder: partner % event %: %', partner, ev.id, sqlerrm;
        end;
      end if;
    end loop;

    update public.calendar_events
    set reminder_sent_at = now()
    where id = ev.id;
  end loop;
end;
$$;

-- Idempotent: drop previous schedule if you re-run this script
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'og-calendar-event-reminders' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end;
$$;

select cron.schedule(
  'og-calendar-event-reminders',
  '*/5 * * * *',
  $$select public.send_og_calendar_event_reminders()$$
);

-- Verify:
-- select * from cron.job where jobname = 'og-calendar-event-reminders';
-- select public.send_og_calendar_event_reminders();
