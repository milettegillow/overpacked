import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { isIsoDate, monthOf, needsDatesForForecast, todayIso } from "@/lib/dates";
import { slugify } from "@/lib/text";
import { CLIMATE_BANDS, VIBES } from "@/lib/trip-fields";
import { geocode, tripWeather, type Place } from "@/lib/weather";
import { errorResponse, fail } from "@/lib/http";

const isoDate = z.string().refine(isIsoDate).nullable();

const LegSchema = z.object({
  city: z.string().trim().min(1).max(200),
  country: z.string().trim().min(1).max(200),
  country_code: z.string().regex(/^[a-z]{2}$/i).nullable().optional(),
  location_key: z.string().max(250).nullable().optional(),
  vibe: z.enum(VIBES),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1900).max(2200).nullable().optional(),
  start_date: isoDate,
  end_date: isoDate,
  nights: z.number().int().min(0).max(365),
  timing: z.enum(["past", "ongoing", "upcoming"]).nullable().optional(),
  climate_summary: z.string().max(200).nullable().optional(),
  climate_band: z.enum(CLIMATE_BANDS).nullable().optional(),
});

const SaveTripSchema = z.object({
  title: z.string().trim().min(1).max(200),
  raw_input: z.string().max(20000),
  legs: z.array(LegSchema).min(1).max(20),
  today: z.string().refine(isIsoDate).optional(),
});

type LegInput = z.infer<typeof LegSchema>;

// Geocode afresh (city or country may have been edited) for the country code
// and location key, then look the weather up for the confirmed dates. Weather
// never blocks saving: any failure keeps Claude's climate summary.
async function prepareLeg(leg: LegInput, today: string) {
  let place: Place | null = null;
  try {
    place = await geocode(leg.city, leg.country);
  } catch (err) {
    console.error("Geocoding failed", { city: leg.city, country: leg.country }, err);
  }
  const country_code =
    place?.countryCode?.toUpperCase() ?? leg.country_code?.toUpperCase() ?? null;
  const location_key = country_code
    ? `${slugify(leg.city)}-${country_code.toLowerCase()}`
    : (leg.location_key ?? null);

  const weather = place
    ? await tripWeather(leg.city, leg.country, leg.start_date, leg.end_date, today, place)
    : null;

  return {
    ...leg,
    country_code,
    location_key,
    // Month always follows the start date when there is one.
    month: leg.start_date ? monthOf(leg.start_date) : leg.month,
    year: leg.start_date ? Number(leg.start_date.slice(0, 4)) : (leg.year ?? Number(today.slice(0, 4))),
    climate_summary: weather?.summary ?? leg.climate_summary ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return fail("Log in first.", 401);

    const body = await request.json().catch(() => null);
    const result = SaveTripSchema.safeParse(body);
    if (!result.success) {
      console.error("Invalid trip", result.error.issues);
      return fail(
        process.env.NODE_ENV === "development"
          ? `Some details don't look right: ${result.error.issues
              .map((i) => `${i.path.join(".")} - ${i.message}`)
              .join("; ")}`
          : "Some details are missing or don't look right.",
        400,
      );
    }
    const trip = result.data;
    const today = trip.today ?? todayIso();

    for (const leg of trip.legs) {
      if (leg.start_date && leg.end_date && leg.end_date < leg.start_date) {
        return fail(`The end date for ${leg.city} is before the start date.`, 400);
      }
      if (needsDatesForForecast(leg, today)) {
        return fail(`Add your exact dates for ${leg.city} for a forecast.`, 400);
      }
    }

    const legs = await Promise.all(trip.legs.map((leg) => prepareLeg(leg, today)));
    const tripId = randomUUID();

    await sql.transaction([
      sql`
        insert into op_trips (id, user_id, title, raw_input)
        values (${tripId}, ${userId}, ${trip.title}, ${trip.raw_input})
      `,
      ...legs.map(
        (leg, position) => sql`
          insert into op_legs (
            trip_id, position, city, country, country_code, location_key, vibe, month, year,
            start_date, end_date, nights, climate_summary, climate_band
          ) values (
            ${tripId}, ${position}, ${leg.city}, ${leg.country}, ${leg.country_code},
            ${leg.location_key}, ${leg.vibe}, ${leg.month}, ${leg.year}, ${leg.start_date},
            ${leg.end_date}, ${leg.nights}, ${leg.climate_summary}, ${leg.climate_band ?? null}
          )
        `,
      ),
    ]);

    return NextResponse.json({ id: tripId }, { status: 201 });
  } catch (err) {
    return errorResponse("Couldn't save your trip", err);
  }
}
