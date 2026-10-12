import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { isIsoDate, needsDatesForForecast, todayIso } from "@/lib/dates";
import { errorResponse, fail } from "@/lib/http";
import { insertItems } from "@/lib/items";
import { LegInputSchema, prepareNewLeg } from "@/lib/legs";
import { parsePackingList, resolveParsedItem, type ResolvedItem } from "@/lib/parse";

const SaveTripSchema = z.object({
  title: z.string().trim().min(1).max(200),
  raw_input: z.string().max(20000),
  // A packing list found in the pasted text, parsed into items on save.
  list_text: z.string().max(20000).nullable().optional(),
  legs: z.array(LegInputSchema).min(1).max(20),
  today: z.string().refine(isIsoDate).optional(),
});

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

    // Parse the list alongside preparing the legs; it only needs their names.
    // A failed parse never blocks saving the trip.
    const listText = trip.list_text?.trim() ? trip.list_text : null;
    const parsing: Promise<ResolvedItem[] | null> = listText
      ? parsePackingList(listText, {
          legs: trip.legs.map((l) => `${l.city}, ${l.country}`),
        })
          .then((parsed) =>
            parsed.map(resolveParsedItem).filter((i): i is ResolvedItem => i != null),
          )
          .catch((err) => {
            console.error("Parsing the pasted list failed", err);
            return null;
          })
      : Promise.resolve(null);

    // Extraction already supplied each leg's typical climate.
    const legs = await Promise.all(trip.legs.map((leg) => prepareNewLeg(leg, today)));
    const tripId = randomUUID();
    const legIds = legs.map(() => randomUUID());

    await sql.transaction([
      sql`
        insert into op_trips (id, user_id, title, raw_input)
        values (${tripId}, ${userId}, ${trip.title}, ${trip.raw_input})
      `,
      ...legs.map(
        (leg, position) => sql`
          insert into op_legs (
            id, trip_id, position, city, country, country_code, location_key, vibe, month, year,
            start_date, end_date, nights, climate_summary, climate_band
          ) values (
            ${legIds[position]}, ${tripId}, ${position}, ${leg.city}, ${leg.country}, ${leg.country_code},
            ${leg.location_key}, ${leg.vibe}, ${leg.month}, ${leg.year}, ${leg.start_date},
            ${leg.end_date}, ${leg.nights}, ${leg.climate_summary}, ${leg.climate_band ?? null}
          )
        `,
      ),
    ]);

    // Items go in after the trip and legs exist. Tag to a leg only when the
    // parser tied the item to that destination; everything else is all legs.
    let listSaved = listText == null;
    const resolved = await parsing;
    if (resolved && resolved.length > 0) {
      try {
        await insertItems(
          tripId,
          userId,
          resolved.map((item) => ({
            ...item,
            leg_id:
              item.leg != null && legs.length > 1 && item.leg >= 0 && item.leg < legIds.length
                ? legIds[item.leg]
                : null,
          })),
        );
        listSaved = true;
      } catch (err) {
        console.error("Saving the parsed list failed", err);
      }
    }

    // When the list didn't make it, the client keeps it for the trip modal.
    return NextResponse.json({ id: tripId, list_saved: listSaved }, { status: 201 });
  } catch (err) {
    return errorResponse("Couldn't save your trip", err);
  }
}
