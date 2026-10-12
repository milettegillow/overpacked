import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { isIsoDate, monthOf, needsDatesForForecast, todayIso } from "@/lib/dates";
import { slugify } from "@/lib/text";
import { CLIMATE_BANDS, VIBES } from "@/lib/trip-fields";
import { geocode, tripWeather, type Place } from "@/lib/weather";

const isoDate = z.string().refine(isIsoDate).nullable();

const SaveTripSchema = z.object({
  raw_input: z.string().max(5000),
  city: z.string().trim().min(1).max(200),
  country: z.string().trim().min(1).max(200),
  location_key: z.string().max(250).nullable(),
  vibe: z.enum(VIBES),
  month: z.number().int().min(1).max(12),
  start_date: isoDate,
  end_date: isoDate,
  nights: z.number().int().min(0).max(365),
  timing: z.enum(["past", "ongoing", "upcoming"]).nullable().optional(),
  climate_summary: z.string().max(200).nullable(),
  climate_band: z.enum(CLIMATE_BANDS).nullable(),
  today: z.string().refine(isIsoDate).optional(),
});

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  try {
    return await saveTrip(request);
  } catch (err) {
    console.error("Saving trip failed", err);
    // In development, show the real cause on the page.
    const detail =
      process.env.NODE_ENV === "development" && err instanceof Error
        ? `Couldn't save your trip: ${err.message}`
        : "Couldn't save your trip. Try again in a moment.";
    return fail(detail, 500);
  }
}

async function saveTrip(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail("Log in first.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Couldn't read the request.", 400);
  }

  const result = SaveTripSchema.safeParse(body);
  if (!result.success) {
    console.error("Invalid trip", result.error.issues);
    const detail =
      process.env.NODE_ENV === "development"
        ? `Some details don't look right: ${result.error.issues
            .map((i) => `${i.path.join(".")} - ${i.message}`)
            .join("; ")}`
        : "Some details are missing or don't look right.";
    return fail(detail, 400);
  }
  const trip = result.data;
  const today = trip.today ?? todayIso();

  if (trip.start_date && trip.end_date && trip.end_date < trip.start_date) {
    return fail("The end date is before the start date.", 400);
  }
  if (needsDatesForForecast(trip, today)) {
    return fail("Add your exact dates for a forecast.", 400);
  }

  // Month always follows the start date when there is one.
  const month = trip.start_date ? monthOf(trip.start_date) : trip.month;

  // City or country may have been edited, so geocode afresh: the country code
  // rebuilds the location key (falling back to the extracted one). Weather is
  // never allowed to block saving.
  let place: Place | null = null;
  try {
    place = await geocode(trip.city, trip.country);
  } catch (err) {
    console.error("Geocoding failed", { city: trip.city, country: trip.country }, err);
  }
  const location_key = place?.countryCode
    ? `${slugify(trip.city)}-${place.countryCode}`
    : trip.location_key;

  // Dates may have changed since extraction, so look the weather up again:
  // a forecast for soon trips, recorded weather for past ones.
  const weather = place
    ? await tripWeather(trip.city, trip.country, trip.start_date, trip.end_date, today, place)
    : null;
  const climate_summary = weather?.summary ?? trip.climate_summary;

  const rows = await sql`
    insert into op_trips (
      user_id, raw_input, city, country, location_key, vibe, month,
      start_date, end_date, nights, climate_summary, climate_band
    ) values (
      ${userId}, ${trip.raw_input}, ${trip.city}, ${trip.country}, ${location_key},
      ${trip.vibe}, ${month}, ${trip.start_date}, ${trip.end_date},
      ${trip.nights}, ${climate_summary}, ${trip.climate_band}
    )
    returning id
  `;

  return NextResponse.json({ id: rows[0].id as string }, { status: 201 });
}
