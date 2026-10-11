-- overpacked schema. Shared Supabase project: every table is prefixed op_.

create table if not exists public.op_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  raw_input text,
  city text,
  country text,
  location_key text, -- normalised, e.g. "new-york-us"
  vibe text check (vibe in ('city', 'cabin', 'beach', 'ski', 'hiking', 'festival', 'work', 'wedding')),
  month int check (month between 1 and 12),
  start_date date,
  end_date date,
  nights int,
  climate_summary text,
  climate_band text,
  created_at timestamptz not null default now()
);

create table if not exists public.op_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.op_trips (id) on delete cascade,
  name text not null,
  category text not null,
  quantity int default 1,
  -- 'wished' means not packed but wished for
  status text not null default 'neutral' check (status in ('neutral', 'glad', 'unneeded', 'wished')),
  created_at timestamptz not null default now()
);

create index if not exists op_trips_user_id_idx on public.op_trips (user_id);
create index if not exists op_trips_location_month_idx on public.op_trips (location_key, month);
create index if not exists op_items_trip_id_idx on public.op_items (trip_id);

alter table public.op_trips enable row level security;
alter table public.op_items enable row level security;

-- op_trips: owners only

create policy "op_trips select own" on public.op_trips
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "op_trips insert own" on public.op_trips
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "op_trips update own" on public.op_trips
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "op_trips delete own" on public.op_trips
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- op_items: only items on trips the user owns

create policy "op_items select own" on public.op_items
  for select to authenticated
  using (exists (
    select 1 from public.op_trips t
    where t.id = op_items.trip_id and t.user_id = (select auth.uid())
  ));

create policy "op_items insert own" on public.op_items
  for insert to authenticated
  with check (exists (
    select 1 from public.op_trips t
    where t.id = op_items.trip_id and t.user_id = (select auth.uid())
  ));

create policy "op_items update own" on public.op_items
  for update to authenticated
  using (exists (
    select 1 from public.op_trips t
    where t.id = op_items.trip_id and t.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.op_trips t
    where t.id = op_items.trip_id and t.user_id = (select auth.uid())
  ));

create policy "op_items delete own" on public.op_items
  for delete to authenticated
  using (exists (
    select 1 from public.op_trips t
    where t.id = op_items.trip_id and t.user_id = (select auth.uid())
  ));
