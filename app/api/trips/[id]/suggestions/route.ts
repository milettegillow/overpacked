import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { errorResponse, fail } from "@/lib/http";
import { suggestionsForTrip } from "@/lib/suggestions";
import { getItemsForTrip, getLegsForTrip, ownsTrip } from "@/lib/trips";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]/suggestions">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id } = await ctx.params;
    if (!(await ownsTrip(id, userId))) return fail("Trip not found.", 404);

    const [legs, items] = await Promise.all([
      getLegsForTrip(id, userId),
      getItemsForTrip(id, userId),
    ]);
    if (items.length === 0) return NextResponse.json({ legs: [] });

    return NextResponse.json({ legs: await suggestionsForTrip(id, userId, legs, items) });
  } catch (err) {
    return errorResponse("Couldn't load suggestions", err);
  }
}
