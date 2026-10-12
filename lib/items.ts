import "server-only";
import { sql } from "./db";
import type { ResolvedItem } from "./parse";
import type { Item } from "./trip-fields";

export const ITEM_RETURNING = sql.unsafe(
  "returning id, leg_id, name, category, quantity, status, canonical_name",
);

export type NewItem = Omit<ResolvedItem, "leg"> & { leg_id: string | null };

// Inserts items on a trip the user owns (checked in the same statement).
export async function insertItems(
  tripId: string,
  userId: string,
  items: NewItem[],
  status: "neutral" | "wished" = "neutral",
): Promise<Item[]> {
  if (items.length === 0) return [];
  const rows = items.map((i) => ({
    leg_id: i.leg_id,
    name: i.name,
    category: i.category,
    quantity: i.quantity,
    canonical_name: i.canonical_name,
    status,
  }));
  return (await sql`
    insert into op_items (trip_id, leg_id, name, category, quantity, status, canonical_name)
    select ${tripId}, x.leg_id, x.name, x.category, x.quantity, x.status, x.canonical_name
    from json_to_recordset(${JSON.stringify(rows)}::json) as x(
      leg_id uuid, name text, category text, quantity int, status text, canonical_name text
    )
    where exists (select 1 from op_trips t where t.id = ${tripId} and t.user_id = ${userId})
    ${ITEM_RETURNING}
  `) as Item[];
}
