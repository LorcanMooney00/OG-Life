-- Adds a per-user `sort_order` to shopping_items so the UI can drag-to-reorder
-- the list and have the order persist (and sync to a linked partner).
-- Safe to run multiple times.

alter table public.shopping_items
  add column if not exists sort_order integer not null default 0;

-- Backfill existing rows by created_at order, per creator. This is a one-shot
-- pass: rows that already have a non-zero sort_order are left alone.
with ranked as (
  select id,
         row_number() over (partition by created_by order by created_at) as rn
    from public.shopping_items
   where sort_order = 0
)
update public.shopping_items s
   set sort_order = r.rn
  from ranked r
 where s.id = r.id;

create index if not exists shopping_items_sort_order_idx
  on public.shopping_items (created_by, sort_order);
