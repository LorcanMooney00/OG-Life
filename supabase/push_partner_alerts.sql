-- OG Life — partner push alerts (shopping + calendar), Lifestyle-style:
-- AFTER INSERT → pg_net → Edge Function → OneSignal (external_id = Supabase user id).
-- Optional ~30 min calendar reminders: calendar_event_reminders.sql (pg_cron).
--
-- Prereqs
-- 1) Deploy Edge Function `send-push-notification` from supabase/functions/send-push-notification/
-- 2) In Supabase Dashboard → Edge Functions → send-push-notification → Secrets:
--      ONESIGNAL_APP_ID          (OneSignal → Keys & IDs)
--      ONESIGNAL_REST_API_KEY    (REST API Key, Authorization: Key …)
--      OG_PUSH_WEBHOOK_SECRET    (generate a long random string; same value as in DB below)
--      APP_PUBLIC_URL            (e.g. https://og-life.vercel.app — no trailing slash)
-- 3) Replace placeholders in the INSERT below, then run this entire script in SQL Editor.
--
-- Security: webhook secret is stored in DB only for this trigger; restrict who can run SQL on your project.

-- pg_net creates the `net` schema; do not force another schema or `net.http_post` will not exist.
create extension if not exists pg_net;

-- Small config table (not exposed to PostgREST clients)
create table if not exists public.og_push_config (
  key text primary key,
  value text not null
);

-- RLS with no policies blocks reads for the trigger role → NULL config → silent “no push”.
-- Table is not granted to API roles; disabling RLS is safe here.
alter table public.og_push_config disable row level security;

revoke all on public.og_push_config from anon;
revoke all on public.og_push_config from authenticated;
revoke all on public.og_push_config from service_role;

-- Replace YOUR_PROJECT_REF and generate a random secret (use the same secret in Edge secrets).
insert into public.og_push_config (key, value) values
  ('edge_url', 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification'),
  ('webhook_secret', 'REPLACE_WITH_LONG_RANDOM_SECRET')
on conflict (key) do update set value = excluded.value;

-- Shopping: notify each linked partner when someone adds an item
create or replace function public.notify_partner_push_on_shopping_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  secret text;
  partner uuid;
begin
  select c.value into base_url from public.og_push_config c where c.key = 'edge_url' limit 1;
  select c.value into secret from public.og_push_config c where c.key = 'webhook_secret' limit 1;

  if base_url is null or secret is null or strpos(base_url, 'YOUR_PROJECT_REF') > 0
     or strpos(secret, 'REPLACE_WITH_LONG_RANDOM_SECRET') > 0 then
    raise warning 'og push: set og_push_config.edge_url and webhook_secret (see push_partner_alerts.sql)';
    return new;
  end if;

  for partner in
    select pl.partner_id
    from public.partner_links pl
    where pl.user_id = new.created_by
  loop
    if partner is distinct from new.created_by then
      perform net.http_post(
        url := base_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-og-push-secret', secret
        ),
        body := jsonb_build_object(
          'type', 'shopping',
          'shopping_id', new.id,
          'user_id', partner,
          'item_name', new.item_name,
          'created_by', new.created_by
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_shopping_item_partner_push on public.shopping_items;
create trigger on_shopping_item_partner_push
  after insert on public.shopping_items
  for each row
  execute function public.notify_partner_push_on_shopping_insert();

-- Calendar: notify each linked partner when someone creates an event
create or replace function public.notify_partner_push_on_calendar_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  secret text;
  partner uuid;
begin
  select c.value into base_url from public.og_push_config c where c.key = 'edge_url' limit 1;
  select c.value into secret from public.og_push_config c where c.key = 'webhook_secret' limit 1;

  if base_url is null or secret is null or strpos(base_url, 'YOUR_PROJECT_REF') > 0
     or strpos(secret, 'REPLACE_WITH_LONG_RANDOM_SECRET') > 0 then
    raise warning 'og push: set og_push_config.edge_url and webhook_secret (see push_partner_alerts.sql)';
    return new;
  end if;

  for partner in
    select pl.partner_id
    from public.partner_links pl
    where pl.user_id = new.created_by
  loop
    if partner is distinct from new.created_by then
      perform net.http_post(
        url := base_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-og-push-secret', secret
        ),
        body := jsonb_build_object(
          'type', 'event',
          'event_id', new.id,
          'user_id', partner,
          'title', new.title,
          'event_date', new.event_date,
          'event_time', new.event_time,
          'created_by', new.created_by
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_calendar_event_partner_push on public.calendar_events;
create trigger on_calendar_event_partner_push
  after insert on public.calendar_events
  for each row
  execute function public.notify_partner_push_on_calendar_insert();

-- ---------------------------------------------------------------------------
-- If shopping pushes still don’t fire, run in SQL Editor (adjust user ids):
--
-- select * from public.og_push_config;
-- select * from public.partner_links;
-- select * from information_schema.triggers
--   where event_object_table = 'shopping_items' and trigger_name = 'on_shopping_item_partner_push';
--
-- After adding an item, check pg_net (HTTP runs after the insert commits):
-- select * from net._http_response order by id desc limit 5;
--
-- If `net.http_post` does not exist, you may have installed pg_net in the `extensions`
-- schema; either use extensions.http_post(...) in both functions, or recreate the extension.
-- ---------------------------------------------------------------------------
