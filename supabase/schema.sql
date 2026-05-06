-- OG Life — lean Supabase schema (free-tier friendly)
--
-- FREE TIER TIPS (keep usage small):
-- 1) Always query calendar with a date range (month view), never "SELECT * FROM events" unbounded.
-- 2) In the app, use .select('cols...') not '*' where possible (less egress per row).
-- 3) Paginate shopping if a list grows huge (e.g. .limit(500) + "load more" later).
-- 4) Don't store images/files in Postgres for this app (storage + egress add up fast).
-- 5) Push: store one row per device in push_subscriptions; upsert, don't duplicate.
-- 6) Turn off Realtime on these tables unless you truly need it (saves concurrent connections).
--
-- RUN: Supabase Dashboard → SQL Editor → paste → Run

-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (for partner linking by email)
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  username text,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_profiles_email_lower_idx
  on public.user_profiles (lower(email));

-- Keep email in sync from auth (cheap: only fires on auth changes)
create or replace function public.handle_user_profile_upsert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(excluded.username, public.user_profiles.username),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_user_profile_upsert();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_user_profile_upsert();

-- ---------------------------------------------------------------------------
-- Partner links (bidirectional rows: A→B and B→A)
-- ---------------------------------------------------------------------------
create table if not exists public.partner_links (
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  constraint partner_links_no_self check (user_id <> partner_id)
);

create index if not exists partner_links_by_user_idx on public.partner_links (user_id);
create index if not exists partner_links_by_partner_idx on public.partner_links (partner_id);

-- ---------------------------------------------------------------------------
-- Calendar (one row per event / recurrence series — same as your app model)
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text not null default '',
  event_date date not null,
  event_time text,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'biweekly', 'monthly')),
  recurrence_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_title_len check (char_length(title) <= 500),
  constraint calendar_notes_len check (char_length(notes) <= 4000)
);

-- Primary read pattern: "my month" + RLS narrows to me + partner rows
create index if not exists calendar_events_by_owner_date_idx
  on public.calendar_events (created_by, event_date);

create index if not exists calendar_events_event_date_idx
  on public.calendar_events (event_date);

-- ---------------------------------------------------------------------------
-- Shopping
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  item_name text not null,
  quantity text,
  purchased boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_name_len check (char_length(item_name) <= 300),
  constraint shopping_qty_len check (quantity is null or char_length(quantity) <= 120)
);

create index if not exists shopping_items_by_owner_created_idx
  on public.shopping_items (created_by, created_at);

create index if not exists shopping_items_active_idx
  on public.shopping_items (created_by, purchased);

-- Prevent ownership drift (partners can edit rows, but must not reassign creator)
create or replace function public.prevent_change_created_by()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_events_prevent_owner_change on public.calendar_events;
create trigger calendar_events_prevent_owner_change
  before update on public.calendar_events
  for each row execute function public.prevent_change_created_by();

drop trigger if exists shopping_items_prevent_owner_change on public.shopping_items;
create trigger shopping_items_prevent_owner_change
  before update on public.shopping_items
  for each row execute function public.prevent_change_created_by();

-- ---------------------------------------------------------------------------
-- Push subscriptions (OneSignal web subscription id per device; column name is legacy “player”)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  onesignal_player_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, onesignal_player_id)
);

create index if not exists push_subscriptions_by_user_idx
  on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

drop trigger if exists shopping_items_set_updated_at on public.shopping_items;
create trigger shopping_items_set_updated_at
  before update on public.shopping_items
  for each row execute function public.set_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Partner RPC
-- ---------------------------------------------------------------------------
create or replace function public.link_partner_by_email(p_partner_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
begin
  select id
    into v_partner_id
  from public.user_profiles
  where lower(email) = lower(trim(p_partner_email))
  limit 1;

  if v_partner_id is null then
    return false;
  end if;

  if v_partner_id = auth.uid() then
    return false;
  end if;

  insert into public.partner_links (user_id, partner_id)
  values (auth.uid(), v_partner_id)
  on conflict do nothing;

  insert into public.partner_links (user_id, partner_id)
  values (v_partner_id, auth.uid())
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.link_partner_by_email(text) from public;
grant execute on function public.link_partner_by_email(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.partner_links enable row level security;
alter table public.calendar_events enable row level security;
alter table public.shopping_items enable row level security;
alter table public.push_subscriptions enable row level security;

-- Profiles: users can read profiles of linked partners + self
drop policy if exists "user_profiles_select_self_or_partner" on public.user_profiles;
create policy "user_profiles_select_self_or_partner"
  on public.user_profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.partner_links pl
      where pl.user_id = auth.uid() and pl.partner_id = user_profiles.id
    )
  );

drop policy if exists "user_profiles_update_self" on public.user_profiles;
create policy "user_profiles_update_self"
  on public.user_profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Lets the app upsert a profile row on first sign-in if needed (trigger usually creates it)
drop policy if exists "user_profiles_insert_self" on public.user_profiles;
create policy "user_profiles_insert_self"
  on public.user_profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- Partner links: only involved users
drop policy if exists "partner_links_select_own" on public.partner_links;
create policy "partner_links_select_own"
  on public.partner_links
  for select
  to authenticated
  using (user_id = auth.uid() or partner_id = auth.uid());

drop policy if exists "partner_links_delete_own" on public.partner_links;
create policy "partner_links_delete_own"
  on public.partner_links
  for delete
  to authenticated
  using (user_id = auth.uid() or partner_id = auth.uid());

-- Calendar: shared read/write between linked partners (small household model)
drop policy if exists "calendar_select_linked" on public.calendar_events;
create policy "calendar_select_linked"
  on public.calendar_events
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.partner_links pl
      where pl.user_id = auth.uid() and pl.partner_id = calendar_events.created_by
    )
  );

drop policy if exists "calendar_insert_self" on public.calendar_events;
create policy "calendar_insert_self"
  on public.calendar_events
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "calendar_update_linked" on public.calendar_events;
create policy "calendar_update_linked"
  on public.calendar_events
  for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.partner_links pl
      where pl.user_id = auth.uid() and pl.partner_id = calendar_events.created_by
    )
  );

drop policy if exists "calendar_delete_linked" on public.calendar_events;
create policy "calendar_delete_linked"
  on public.calendar_events
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.partner_links pl
      where pl.user_id = auth.uid() and pl.partner_id = calendar_events.created_by
    )
  );

-- Shopping: same sharing model
drop policy if exists "shopping_select_linked" on public.shopping_items;
create policy "shopping_select_linked"
  on public.shopping_items
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.partner_links pl
      where pl.user_id = auth.uid() and pl.partner_id = shopping_items.created_by
    )
  );

drop policy if exists "shopping_insert_self" on public.shopping_items;
create policy "shopping_insert_self"
  on public.shopping_items
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "shopping_update_linked" on public.shopping_items;
create policy "shopping_update_linked"
  on public.shopping_items
  for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.partner_links pl
      where pl.user_id = auth.uid() and pl.partner_id = shopping_items.created_by
    )
  );

drop policy if exists "shopping_delete_linked" on public.shopping_items;
create policy "shopping_delete_linked"
  on public.shopping_items
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.partner_links pl
      where pl.user_id = auth.uid() and pl.partner_id = shopping_items.created_by
    )
  );

-- Push subscriptions: only the owner can manage their devices
drop policy if exists "push_select_own" on public.push_subscriptions;
create policy "push_select_own"
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_update_own" on public.push_subscriptions;
create policy "push_update_own"
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own"
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (authenticated clients only)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, delete on public.partner_links to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
