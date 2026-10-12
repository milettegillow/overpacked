import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import {
  couldStartWithinForecastWindow,
  isIsoDate,
  isWithinForecastWindow,
  todayIso,
} from "@/lib/dates";
import { slugify } from "@/lib/text";
import { CLIMATE_BANDS, VIBES } from "@/lib/trip-fields";
import { geocode, getForecast, type Place } from "@/lib/weather";

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
  climate_summary: z.string().max(200).nullable(),
  climate_band: z.enum(CLIMATE_BANDS).nullable(),
  today: z.string().refine(isIsoDate).optional(),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read the request." }, { status: 400 });
  }

  const result = SaveTripSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Some details are missing or don't look right." },
      { status: 400 },
    );
  }
  const trip = result.data;
  const today = trip.today ?? todayIso();

  if (trip.start_date && trip.end_date && trip.end_date < trip.start_date) {
    return NextResponse.json(
      { error: "The end date is before the start date." },
      { status: 400 },
    );
  }
  if (
    couldStartWithinForecastWindow(trip.month, trip.start_date, today) &&
    (!trip.start_date || !trip.end_date)
  ) {
    return NextResponse.json(
      { error: "Add your exact dates for a forecast." },
      { status: 400 },
    );
  }

  // City or country may have been edited, so geocode afresh: the country code
  // rebuilds the location key (falling back to the extracted one).
  let place: Place | null = null;
  try {
    place = await geocode(trip.city, trip.country);
  } catch {
    // keep the extracted key and climate summary
  }
  const location_key = place?.countryCode
    ? `${slugify(trip.city)}-${place.countryCode}`
    : trip.location_key;

  // Dates may have changed since extraction, so fetch the forecast at save time.
  let climate_summary = trip.climate_summary;
  if (
    place &&
    trip.start_date &&
    trip.end_date &&
    isWithinForecastWindow(trip.start_date, today)
  ) {
    try {
      climate_summary =
        (await getForecast(place.lat, place.lon, trip.start_date, trip.end_date)) ??
        climate_summary;
    } catch {
      // keep the typical-climate summary
    }
  }

  const rows = await sql`
    insert into op_trips (
      user_id, raw_input, city, country, location_key, vibe, month,
      start_date, end_date, nights, climate_summary, climate_band
    ) values (
      ${userId}, ${trip.raw_input}, ${trip.city}, ${trip.country}, ${location_key},
      ${trip.vibe}, ${trip.month}, ${trip.start_date}, ${trip.end_date},
      ${trip.nights}, ${climate_summary}, ${trip.climate_band}
    )
    returning id
  `;

  return NextResponse.json({ id: rows[0].id as string }, { status: 201 });
}
