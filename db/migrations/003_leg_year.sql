-- 003: the year each leg starts, so undated legs can still be placed in time
-- (planning vs review). Safe to re-run.

alter table op_legs add column if not exists year int;

-- Backfill: the start date's year, else the year the trip was added.
update op_legs l
set year = coalesce(extract(year from l.start_date)::int, extract(year from t.created_at)::int)
from op_trips t
where t.id = l.trip_id and l.year is null;
