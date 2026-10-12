-- overpacked schema. Safe to re-run. Every table is prefixed op_.
-- Ownership is enforced in server code by filtering on the Clerk user id.

create table if not exists op_trips (
  id uuid primary key default gen_random_uuid(),
  user_id text not null, -- Clerk user id
  raw_input text,
  city text,
  country text,
  location_key text, -- normalised, e.g. "new-york-us"
  vibe text, -- city, cabin, beach, ski, hiking, festival, work or wedding
  month int,
  start_date date,
  end_date date,
  nights int,
  climate_summary text,
  climate_band text,
  created_at timestamptz default now()
);

create table if not exists op_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references op_trips (id) on delete cascade,
  name text not null,
  category text not null,
  quantity int default 1,
  -- 'wished' means not packed but wished for
  status text not null default 'neutral' check (status in ('neutral', 'glad', 'unneeded', 'wished')),
  created_at timestamptz default now()
);

create index if not exists op_trips_user_id_idx on op_trips (user_id);
create index if not exists op_trips_location_month_idx on op_trips (location_key, month);
create index if not exists op_items_trip_id_idx on op_items (trip_id);
