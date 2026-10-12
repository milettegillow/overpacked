-- 002: multi-leg trips. Safe to re-run.

create table if not exists op_legs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references op_trips (id) on delete cascade,
  position int not null default 0,
  city text,
  country text,
  country_code text, -- ISO 3166-1 alpha-2, uppercase
  location_key text, -- normalised, e.g. "new-york-us"
  vibe text,
  month int,
  start_date date,
  end_date date,
  nights int,
  climate_summary text,
  climate_band text,
  claude_suggestions jsonb,
  claude_suggestions_hash text
);

alter table op_trips add column if not exists title text;

alter table op_items add column if not exists leg_id uuid references op_legs (id) on delete set null;
alter table op_items add column if not exists canonical_name text;

-- Move each trip's location, dates and weather into a single leg, then drop
-- those columns from op_trips. Skipped once the columns are gone.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'op_trips' and column_name = 'city'
  ) then
    execute $sql$
      insert into op_legs (
        trip_id, position, city, country, country_code, location_key, vibe, month,
        start_date, end_date, nights, climate_summary, climate_band
      )
      select
        t.id, 0, t.city, t.country,
        upper(substring(t.location_key from '-([a-z]{2})$')),
        t.location_key, t.vibe, t.month, t.start_date, t.end_date, t.nights,
        t.climate_summary, t.climate_band
      from op_trips t
      where not exists (select 1 from op_legs l where l.trip_id = t.id)
    $sql$;

    execute $sql$
      update op_trips set title = coalesce(city, 'Trip')
      where title is null or btrim(title) = ''
    $sql$;

    alter table op_trips
      drop column city,
      drop column country,
      drop column location_key,
      drop column vibe,
      drop column month,
      drop column start_date,
      drop column end_date,
      drop column nights,
      drop column climate_summary,
      drop column climate_band;
  end if;
end
$$;

create index if not exists op_legs_trip_id_idx on op_legs (trip_id);
create index if not exists op_legs_location_month_idx on op_legs (location_key, month);
create index if not exists op_legs_vibe_band_idx on op_legs (vibe, climate_band);
create index if not exists op_items_leg_id_idx on op_items (leg_id);
create index if not exists op_items_canonical_name_idx on op_items (canonical_name);
