import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isIsoDate, monthOf, nightsBetween } from "./dates";
import { stripDashes } from "./text";
import { CLIMATE_BANDS, VIBES } from "./trip-fields";
import { tripWeather, type WeatherSource } from "./weather";

const MODEL = "claude-sonnet-4-6";

const ExtractedTripSchema = z.object({
  city: z.string(),
  country: z.string(),
  location_key: z.string(),
  vibe: z.enum(VIBES),
  month: z.number().int(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  nights: z.number().int().nullable(),
  timing: z.enum(["past", "ongoing", "upcoming"]),
  climate_summary: z.string(),
  climate_band: z.enum(CLIMATE_BANDS),
});

export type ExtractedTrip = z.infer<typeof ExtractedTripSchema> & {
  forecast: boolean;
  weather_source: WeatherSource | null;
};

const SYSTEM_PROMPT = `You read a short, casual description of a trip and pull out its details. The trip may be in the past, happening now, or in the future. Never assume it is upcoming.

FIELDS
- city: the main destination town or city, properly capitalised. For a rural spot (a cabin, a campsite), use the nearest town or the named area.
- country: the country's common English name, e.g. "Ireland", "United States".
- location_key: the city lowercased and hyphenated, then a hyphen and the lowercase ISO 3166-1 alpha-2 country code. E.g. "new-york-us", "cavan-ie", "sao-paulo-br". Strip accents.
- vibe: the single best fit from city, cabin, beach, ski, hiking, festival, work, wedding.
- month: the month the trip starts, 1-12. If no time is given at all, use the current month.
- start_date, end_date: ISO dates (YYYY-MM-DD), only when the text pins down exact days. Past dates are fine.
  - Resolve relative phrases against today's date: "last weekend" is the most recent Saturday to Sunday before today; "next weekend" is the coming one; "9-12 October" is those days.
  - A span without exact days ("last week of October", "a week in June", "March 2024") is not exact: leave both dates null, but still set month (and nights if implied).
  - A date without a year: use past tense and context. "Went to Rome 3-7 May" is the most recent past 3-7 May; "going to Rome 3-7 May" is the next one. With no tense signal, use the next occurrence on or after today.
- nights: a whole number of nights if the text says or clearly implies it ("5 nights", "a long weekend" = 3, "a week" = 7, "last week of October" = 7). Null if you can't tell.
- timing: "past" if the trip has ended before today, "ongoing" if it includes today, "upcoming" if it starts after today. Judge from the dates, or from tense and phrasing ("went", "last", a past year) when there are no dates.
- climate_summary: the typical weather for that place in that month, at most 6 words, all lowercase, e.g. "cool, wet", "hot, humid, rainy season", "cold, snowy".
- climate_band: one of cold, mild, warm or hot, then wet or dry, joined by a hyphen, e.g. "mild-wet".

WRITING STYLE
- British English.
- NEVER use an em dash (—) or an en dash (–) in any field. Use a comma instead.`;

export class ExtractError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export async function extractTrip(
  text: string,
  today: string,
): Promise<ExtractedTrip> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ExtractError("Trip reading isn't configured yet (missing API key).");
  }
  if (!text.trim()) {
    throw new ExtractError("Tell us about your trip first.", 400);
  }

  const client = new Anthropic({ apiKey });

  let parsed: z.infer<typeof ExtractedTripSchema> | null;
  try {
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Today's date is ${today}.\n\nTrip: ${text}` },
      ],
      output_config: { format: zodOutputFormat(ExtractedTripSchema) },
    });
    parsed = message.parsed_output;
  } catch (err) {
    console.error("Trip extraction failed", err);
    throw new ExtractError("We couldn't read that just now. Try again in a moment.");
  }
  if (!parsed) {
    throw new ExtractError("We couldn't make sense of that. Try adding a place and a time.");
  }

  const trip = stripDashes(parsed);

  // Tidy and enforce the rules rather than trusting the model blindly.
  let start_date = isIsoDate(trip.start_date) ? trip.start_date : null;
  let end_date = isIsoDate(trip.end_date) ? trip.end_date : null;
  if (start_date && end_date && end_date < start_date) {
    start_date = null;
    end_date = null;
  }
  const month = start_date
    ? monthOf(start_date)
    : Math.min(12, Math.max(1, trip.month));
  const nights =
    nightsBetween(start_date, end_date) ??
    (trip.nights != null && trip.nights >= 0 ? trip.nights : null);
  const timing = start_date
    ? start_date > today
      ? "upcoming"
      : end_date
        ? end_date < today ? "past" : "ongoing"
        : trip.timing === "upcoming" ? "ongoing" : trip.timing
    : trip.timing;

  // Real weather when the dates allow it; otherwise the typical climate.
  const weather = await tripWeather(trip.city, trip.country, start_date, end_date, today);

  return {
    ...trip,
    location_key: trip.location_key.toLowerCase(),
    month,
    start_date,
    end_date,
    nights,
    timing,
    climate_summary: weather?.summary ?? trip.climate_summary.toLowerCase(),
    forecast: weather?.source === "forecast",
    weather_source: weather?.source ?? null,
  };
}
