import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { errorResponse, fail } from "@/lib/http";
import { suggestionsForTrip } from "@/lib/suggestions";
import { getTripMode } from "@/lib/trip-fields";
import { getTripDetail } from "@/lib/trips";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]/suggestions">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id } = await ctx.params;
    const trip = await getTripDetail(id, userId);
    if (!trip) return fail("Trip not found.", 404);

    // Suggestions are for planning only; past and ongoing trips are reviewed.
    if (trip.items.length === 0 || getTripMode(trip) === "review") {
      return NextResponse.json({ legs: [] });
    }

    return NextResponse.json({
      legs: await suggestionsForTrip(id, userId, trip.legs, trip.items),
    });
  } catch (err) {
    return errorResponse("Couldn't load suggestions", err);
  }
}
