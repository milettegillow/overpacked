import "server-only";
import { sql } from "./db";
import type { Item, Leg, TripCard, TripDetail } from "./trip-fields";

// Every query here is scoped to the given Clerk userId.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

// Constant, trusted column list (no user input).
const LEG_COLUMNS = sql.unsafe(`
  l.id, l.trip_id, l.position, l.city, l.country, l.country_code, l.location_key,
  l.vibe, l.month, l.start_date, l.end_date, l.nights, l.climate_summary, l.climate_band
`);

function toLeg(row: Record<string, unknown>): Leg {
  return {
    id: row.id as string,
    position: row.position as number,
    city: row.city as string | null,
    country: row.country as string | null,
    country_code: row.country_code as string | null,
    location_key: row.location_key as string | null,
    vibe: row.vibe as string | null,
    month: row.month as number | null,
    start_date: row.start_date as string | null,
    end_date: row.end_date as string | null,
    nights: row.nights as number | null,
    climate_summary: row.climate_summary as string | null,
    climate_band: row.climate_band as string | null,
  };
}

// True if the trip exists and belongs to the user.
export async function ownsTrip(tripId: string, userId: string): Promise<boolean> {
  if (!isUuid(tripId)) return false;
  const rows = await sql`
    select 1 from op_trips where id = ${tripId} and user_id = ${userId}
  `;
  return rows.length > 0;
}

// All of a user's trips with their legs, newest first by the first leg's start
// date, falling back to when the trip was added.
export async function listTripsForUser(userId: string): Promise<TripCard[]> {
  const [trips, legs] = await Promise.all([
    sql`
      select id, title, created_at from op_trips where user_id = ${userId}
    `,
    sql`
      select ${LEG_COLUMNS} from op_legs l
      join op_trips t on t.id = l.trip_id
      where t.user_id = ${userId}
      order by l.trip_id, l.position
    `,
  ]);

  const byTrip = new Map<string, Leg[]>();
  for (const row of legs) {
    const tripId = row.trip_id as string;
    byTrip.set(tripId, [...(byTrip.get(tripId) ?? []), toLeg(row)]);
  }

  const cards = trips.map((t) => ({
    id: t.id as string,
    title: (t.title as string | null) ?? "Trip",
    created_at: new Date(t.created_at as string).toISOString(),
    legs: byTrip.get(t.id as string) ?? [],
  }));

  const sortKey = (c: TripCard) => c.legs[0]?.start_date ?? c.created_at.slice(0, 10);
  return cards.sort(
    (a, b) =>
      sortKey(b).localeCompare(sortKey(a)) || b.created_at.localeCompare(a.created_at),
  );
}

export async function getLegsForTrip(tripId: string, userId: string): Promise<Leg[]> {
  if (!isUuid(tripId)) return [];
  const rows = await sql`
    select ${LEG_COLUMNS} from op_legs l
    join op_trips t on t.id = l.trip_id
    where l.trip_id = ${tripId} and t.user_id = ${userId}
    order by l.position
  `;
  return rows.map(toLeg);
}

export async function getItemsForTrip(tripId: string, userId: string): Promise<Item[]> {
  if (!isUuid(tripId)) return [];
  const rows = await sql`
    select i.id, i.leg_id, i.name, i.category, i.quantity, i.status, i.canonical_name
    from op_items i
    join op_trips t on t.id = i.trip_id
    where i.trip_id = ${tripId} and t.user_id = ${userId}
    order by i.created_at, i.id
  `;
  return rows.map((r) => ({
    id: r.id as string,
    leg_id: r.leg_id as string | null,
    name: r.name as string,
    category: r.category as string,
    quantity: (r.quantity as number | null) ?? 1,
    status: r.status as Item["status"],
    canonical_name: r.canonical_name as string | null,
  }));
}

// Everything the trip modal needs, or null if the trip isn't the user's.
export async function getTripDetail(
  tripId: string,
  userId: string,
): Promise<TripDetail | null> {
  if (!isUuid(tripId)) return null;
  const [trip] = await sql`
    select id, title from op_trips where id = ${tripId} and user_id = ${userId}
  `;
  if (!trip) return null;

  const [legs, items, others] = await Promise.all([
    getLegsForTrip(tripId, userId),
    getItemsForTrip(tripId, userId),
    sql`
      select t.id, t.title from op_trips t
      where t.user_id = ${userId} and t.id <> ${tripId}
        and exists (select 1 from op_items i where i.trip_id = t.id)
      order by t.created_at desc
    `,
  ]);

  return {
    id: trip.id as string,
    title: (trip.title as string | null) ?? "Trip",
    legs,
    items,
    other_trips: others.map((o) => ({
      id: o.id as string,
      title: (o.title as string | null) ?? "Trip",
    })),
  };
}
