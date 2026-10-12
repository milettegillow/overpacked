import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { errorResponse, fail } from "@/lib/http";
import { getTripDetail, isUuid } from "@/lib/trips";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id } = await ctx.params;
    const trip = await getTripDetail(id, userId);
    if (!trip) return fail("Trip not found.", 404);
    return NextResponse.json(trip);
  } catch (err) {
    return errorResponse("Couldn't load this trip", err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id } = await ctx.params;
    if (!isUuid(id)) return fail("Trip not found.", 404);
    const rows = await sql`
      delete from op_trips where id = ${id} and user_id = ${userId} returning id
    `;
    if (rows.length === 0) return fail("Trip not found.", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse("Couldn't delete this trip", err);
  }
}
