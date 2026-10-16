import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { errorResponse, fail } from "@/lib/http";
import { suggestionsForTrip } from "@/lib/suggestions";
import { getLegMode } from "@/lib/trip-fields";
import { getTripDetail } from "@/lib/trips";

// Suggestions for the trip's legs that are still being planned, or just the
// one leg given by ?leg=. Past and ongoing legs are reviewed, not suggested to.
export async function GET(request: Request, ctx: RouteContext<"/api/trips/[id]/suggestions">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id } = await ctx.params;
    const trip = await getTripDetail(id, userId);
    if (!trip) return fail("Trip not found.", 404);

    const only = new URL(request.url).searchParams.get("leg");
    const legs = trip.legs.filter(
      (leg) =>
        (!only || leg.id === only) && getLegMode(leg, trip.created_at) === "planning",
    );
    if (trip.items.length === 0 || legs.length === 0) {
      return NextResponse.json({ legs: [] });
    }

    return NextResponse.json({
      legs: await suggestionsForTrip(id, userId, legs, trip.items),
    });
  } catch (err) {
    return errorResponse("Couldn't load suggestions", err);
  }
}
