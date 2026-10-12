import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { errorResponse, fail } from "@/lib/http";
import { isUuid } from "@/lib/trips";

const PatchSchema = z
  .object({
    status: z.enum(["neutral", "glad", "unneeded", "wished"]).optional(),
    leg_id: z.string().uuid().nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.leg_id !== undefined);

export async function PATCH(request: Request, ctx: RouteContext<"/api/items/[id]">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id } = await ctx.params;
    if (!isUuid(id)) return fail("Item not found.", 404);

    const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("That doesn't look right.", 400);
    const { status, leg_id } = parsed.data;

    // Owner-scoped via the trip. A new leg must belong to the item's own trip.
    const rows = await sql`
      update op_items i set
        status = coalesce(${status ?? null}, i.status),
        leg_id = case when ${leg_id !== undefined}::boolean then ${leg_id ?? null}::uuid else i.leg_id end
      from op_trips t
      where i.id = ${id} and t.id = i.trip_id and t.user_id = ${userId}
        and (
          ${leg_id == null}::boolean
          or exists (select 1 from op_legs l where l.id = ${leg_id ?? null}::uuid and l.trip_id = i.trip_id)
        )
      returning i.id
    `;
    if (rows.length === 0) return fail("Item not found.", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse("Couldn't update that item", err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/items/[id]">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id } = await ctx.params;
    if (!isUuid(id)) return fail("Item not found.", 404);
    const rows = await sql`
      delete from op_items i using op_trips t
      where i.id = ${id} and t.id = i.trip_id and t.user_id = ${userId}
      returning i.id
    `;
    if (rows.length === 0) return fail("Item not found.", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse("Couldn't remove that item", err);
  }
}
