import "server-only";
import { sql } from "./db";

export type Trip = {
  id: string;
  user_id: string;
  raw_input: string | null;
  city: string | null;
  country: string | null;
  location_key: string | null;
  vibe: string | null;
  month: number | null;
  start_date: string | null;
  end_date: string | null;
  nights: number | null;
  climate_summary: string | null;
  climate_band: string | null;
  created_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Loads a trip only if it belongs to the given user; null otherwise.
// Every trip or item query must be scoped to the current Clerk userId like this.
export async function getTripForUser(
  tripId: string,
  userId: string,
): Promise<Trip | null> {
  if (!UUID.test(tripId)) return null;
  const rows = await sql`
    select * from op_trips where id = ${tripId} and user_id = ${userId} limit 1
  `;
  return (rows[0] as Trip | undefined) ?? null;
}

// All of a user's trips, newest trip date first. Trips without dates fall back
// to when they were added.
export async function listTripsForUser(userId: string): Promise<Trip[]> {
  const rows = await sql`
    select * from op_trips
    where user_id = ${userId}
    order by coalesce(start_date, end_date, created_at::date) desc, created_at desc
  `;
  return rows as Trip[];
}
