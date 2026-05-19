-- works-calendar reference host schema.
--
-- One-time setup for a new Supabase project:
--   1. Open the project dashboard → SQL Editor → New Query.
--   2. Paste this file in and hit Run.
--   3. Open Authentication → URL Configuration and add your deployed
--      origin (and http://localhost:3000 for dev) to **Site URL** and
--      **Redirect URLs** (include `/auth/callback` on each).
--
-- What this gives you:
--   - An `events` table that mirrors the WorksCalendarEvent shape the
--     calendar component already understands.
--   - Row-level security so only signed-in users can touch the table.
--   - A "MVP" policy where any authenticated user can CRUD any event.
--     When you're ready for role-based filtering (CFI vs student vs
--     admin), drop these policies and replace them with policies that
--     check a `profiles` table.

create extension if not exists "pgcrypto";

create table if not exists public.events (
  id          text primary key,
  title       text not null,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean not null default false,
  resource    text,
  category    text,
  color       text,
  meta        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists events_resource_idx on public.events (resource);
create index if not exists events_start_idx    on public.events (start_at);
create index if not exists events_end_idx      on public.events (end_at);

-- Keep updated_at honest.
create or replace function public.events_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.events_set_updated_at();

-- Row-level security
alter table public.events enable row level security;

drop policy if exists "events read"   on public.events;
drop policy if exists "events insert" on public.events;
drop policy if exists "events update" on public.events;
drop policy if exists "events delete" on public.events;

-- MVP policies: any signed-in user can read/write all events. Replace
-- with role-aware policies (e.g. `using (auth.uid() = created_by)` or
-- a profiles-table check) once you've added roles.
create policy "events read" on public.events
  for select to authenticated
  using (true);

create policy "events insert" on public.events
  for insert to authenticated
  with check (true);

create policy "events update" on public.events
  for update to authenticated
  using (true) with check (true);

create policy "events delete" on public.events
  for delete to authenticated
  using (true);
