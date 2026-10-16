import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { ALL_CATEGORIES } from "@/lib/categories";
import { sql } from "@/lib/db";
import { errorResponse, fail } from "@/lib/http";
import { ITEM_RETURNING, insertItems } from "@/lib/items";
import {
  normaliseCanonical,
  parsePackingList,
  ParseError,
  type ResolvedItem,
} from "@/lib/parse";
import { getLegsForTrip, isUuid, ownsTrip } from "@/lib/trips";

const legId = z.string().uuid().nullable().optional();

const AddSchema = z.discriminatedUnion("mode", [
  // A pasted list, or a single typed item: both parsed by Claude.
  z.object({
    mode: z.literal("parse"),
    text: z.string().trim().min(1).max(20000),
    status: z.enum(["neutral", "wished"]).optional(),
    leg_id: legId,
  }),
  // A suggestion: already has its name, category and canonical name.
  z.object({
    mode: z.literal("suggestion"),
    name: z.string().trim().min(1).max(200),
    category: z.enum(ALL_CATEGORIES),
    canonical_name: z.string().trim().min(1).max(200),
    leg_id: legId,
  }),
  // Copy another of the user's trips.
  z.object({
    mode: z.literal("copy"),
    from: z.string().uuid(),
  }),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/trips/[id]/items">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id: tripId } = await ctx.params;
    if (!(await ownsTrip(tripId, userId))) return fail("Trip not found.", 404);

    const parsed = AddSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("That doesn't look right.", 400);
    const body = parsed.data;

    // A leg tag must be one of this trip's legs.
    const leg = "leg_id" in body ? (body.leg_id ?? null) : null;
    if (leg) {
      const legs = await getLegsForTrip(tripId, userId);
      if (!legs.some((l) => l.id === leg)) return fail("That leg isn't on this trip.", 400);
    }

    if (body.mode === "copy") {
      if (!isUuid(body.from) || body.from === tripId) return fail("Pick another trip.", 400);
      // Everything except didn't need; wishes come over as packed items.
      const items = await sql`
        insert into op_items (trip_id, leg_id, name, category, quantity, status, canonical_name)
        select ${tripId}, null, i.name, i.category, i.quantity, 'neutral', i.canonical_name
        from op_items i
        join op_trips src on src.id = i.trip_id
        where i.trip_id = ${body.from} and src.user_id = ${userId}
          and i.status <> 'unneeded'
          and exists (select 1 from op_trips d where d.id = ${tripId} and d.user_id = ${userId})
        ${ITEM_RETURNING}
      `;
      return NextResponse.json({ items }, { status: 201 });
    }

    if (body.mode === "suggestion") {
      const items = await insertItems(
        tripId,
        userId,
        [
          {
            name: body.name,
            category: body.category,
            quantity: 1,
            canonical_name: normaliseCanonical(body.canonical_name),
            leg_id: leg,
          },
        ],
        "neutral",
      );
      return NextResponse.json({ items }, { status: 201 });
    }

    let resolved: ResolvedItem[];
    try {
      resolved = await parsePackingList(body.text);
    } catch (err) {
      if (err instanceof ParseError) return fail(err.message, err.status);
      throw err;
    }
    if (resolved.length === 0) return fail("We couldn't find any items in that.", 400);

    const items = await insertItems(
      tripId,
      userId,
      resolved.map((i) => ({ ...i, leg_id: leg })),
      body.status ?? "neutral",
    );
    return NextResponse.json({ items }, { status: 201 });
  } catch (err) {
    return errorResponse("Couldn't add that", err);
  }
}
