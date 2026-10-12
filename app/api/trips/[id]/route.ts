import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { isIsoDate, needsDatesForForecast, todayIso } from "@/lib/dates";
import { errorResponse, fail } from "@/lib/http";
import {
  LegInputSchema,
  locate,
  monthAndYear,
  prepareNewLeg,
  typicalClimate,
  type LegInput,
  type PreparedLeg,
} from "@/lib/legs";
import type { Leg } from "@/lib/trip-fields";
import { getLegsForTrip, getTripDetail, isUuid, ownsTrip } from "@/lib/trips";
import { tripWeather } from "@/lib/weather";

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

const EditTripSchema = z.object({
  title: z.string().trim().min(1).max(200),
  legs: z.array(LegInputSchema).min(1).max(20),
  today: z.string().refine(isIsoDate).optional(),
});

const same = (a: string | null, b: string | null) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

// Recompute only what an edit invalidates. Weather never blocks saving: any
// failure keeps what the leg already had.
async function prepareEditedLeg(
  old: Leg,
  leg: LegInput,
  today: string,
): Promise<PreparedLeg & { clearSuggestions: boolean }> {
  const { month, year } = monthAndYear(leg, today);
  const locationChanged = !same(old.city, leg.city) || !same(old.country, leg.country);
  const datesChanged = old.start_date !== leg.start_date || old.end_date !== leg.end_date;
  const monthChanged = old.month !== month;
  const vibeChanged = old.vibe !== leg.vibe;

  let country_code = old.country_code;
  let location_key = old.location_key;
  let place = null;
  if (locationChanged) {
    ({ place, country_code, location_key } = await locate({
      ...leg,
      country_code: null,
      location_key: null,
    }));
  }

  // Location, dates or month moved: the climate summary (and with it the
  // typical band) is regenerated, then real weather wins when dates allow.
  let climate_summary = old.climate_summary;
  let climate_band = old.climate_band;
  if (locationChanged || datesChanged || monthChanged) {
    const [typical, weather] = await Promise.all([
      typicalClimate(leg.city, leg.country, month),
      tripWeather(leg.city, leg.country, leg.start_date, leg.end_date, today, place ?? undefined),
    ]);
    climate_summary = weather?.summary ?? typical?.climate_summary ?? climate_summary;
    climate_band = typical?.climate_band ?? climate_band;
  }

  return {
    city: leg.city,
    country: leg.country,
    country_code,
    location_key,
    vibe: leg.vibe,
    month,
    year,
    start_date: leg.start_date,
    end_date: leg.end_date,
    nights: leg.nights,
    climate_summary,
    climate_band,
    // Suggestions depend on place, vibe and season.
    clearSuggestions: locationChanged || vibeChanged || monthChanged,
  };
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/trips/[id]">) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);
    const { id: tripId } = await ctx.params;
    if (!(await ownsTrip(tripId, userId))) return fail("Trip not found.", 404);

    const parsed = EditTripSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      console.error("Invalid trip edit", parsed.error.issues);
      return fail(
        process.env.NODE_ENV === "development"
          ? `Some details don't look right: ${parsed.error.issues
              .map((i) => `${i.path.join(".")} - ${i.message}`)
              .join("; ")}`
          : "Some details are missing or don't look right.",
        400,
      );
    }
    const edit = parsed.data;
    const today = edit.today ?? todayIso();

    for (const leg of edit.legs) {
      if (leg.start_date && leg.end_date && leg.end_date < leg.start_date) {
        return fail(`The end date for ${leg.city} is before the start date.`, 400);
      }
      if (needsDatesForForecast(leg, today)) {
        return fail(`Add your exact dates for ${leg.city} for a forecast.`, 400);
      }
    }

    const existing = new Map((await getLegsForTrip(tripId, userId)).map((l) => [l.id, l]));
    if (edit.legs.some((l) => l.id && !existing.has(l.id))) {
      return fail("That leg isn't on this trip.", 400);
    }

    const prepared = await Promise.all(
      edit.legs.map(async (leg) => {
        const old = leg.id ? existing.get(leg.id) : undefined;
        return old
          ? { id: old.id, ...(await prepareEditedLeg(old, leg, today)) }
          : { id: null, clearSuggestions: false, ...(await prepareNewLeg(leg, today, { typical: true })) };
      }),
    );
    const keptIds = prepared.flatMap((l) => (l.id ? [l.id] : []));

    // Removed legs go; their items stay on the trip, tagged to all legs
    // (op_items.leg_id is "on delete set null").
    await sql.transaction([
      sql`update op_trips set title = ${edit.title} where id = ${tripId} and user_id = ${userId}`,
      sql`
        delete from op_legs
        where trip_id = ${tripId} and not (id = any(${keptIds}::uuid[]))
      `,
      ...prepared.map((leg, position) =>
        leg.id
          ? sql`
              update op_legs set
                position = ${position}, city = ${leg.city}, country = ${leg.country},
                country_code = ${leg.country_code}, location_key = ${leg.location_key},
                vibe = ${leg.vibe}, month = ${leg.month}, year = ${leg.year},
                start_date = ${leg.start_date}, end_date = ${leg.end_date},
                nights = ${leg.nights}, climate_summary = ${leg.climate_summary},
                climate_band = ${leg.climate_band},
                claude_suggestions = case when ${leg.clearSuggestions}::boolean
                  then null else claude_suggestions end,
                claude_suggestions_hash = case when ${leg.clearSuggestions}::boolean
                  then null else claude_suggestions_hash end
              where id = ${leg.id} and trip_id = ${tripId}
            `
          : sql`
              insert into op_legs (
                trip_id, position, city, country, country_code, location_key, vibe, month,
                year, start_date, end_date, nights, climate_summary, climate_band
              ) values (
                ${tripId}, ${position}, ${leg.city}, ${leg.country}, ${leg.country_code},
                ${leg.location_key}, ${leg.vibe}, ${leg.month}, ${leg.year}, ${leg.start_date},
                ${leg.end_date}, ${leg.nights}, ${leg.climate_summary}, ${leg.climate_band}
              )
            `,
      ),
    ]);

    const trip = await getTripDetail(tripId, userId);
    return NextResponse.json(trip);
  } catch (err) {
    return errorResponse("Couldn't save your changes", err);
  }
}
