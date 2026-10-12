import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isIsoDate, monthOf } from "./dates";
import { slugify, stripDashes } from "./text";
import { CLIMATE_BANDS, MONTH_NAMES, VIBES, type ClimateBand } from "./trip-fields";
import { geocode, tripWeather, type Place } from "./weather";

// Leg preparation shared by creating and editing trips.

const MODEL = "claude-sonnet-4-6";

const isoDate = z.string().refine(isIsoDate).nullable();

export const LegInputSchema = z.object({
  id: z.string().uuid().optional(), // a saved leg, when editing
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

export type LegInput = z.infer<typeof LegInputSchema>;

export type PreparedLeg = {
  city: string;
  country: string;
  country_code: string | null;
  location_key: string | null;
  vibe: string;
  month: number;
  year: number;
  start_date: string | null;
  end_date: string | null;
  nights: number;
  climate_summary: string | null;
  climate_band: string | null;
};

// Month and year always follow the start date when there is one.
export function monthAndYear(leg: LegInput, today: string) {
  return {
    month: leg.start_date ? monthOf(leg.start_date) : leg.month,
    year: leg.start_date
      ? Number(leg.start_date.slice(0, 4))
      : (leg.year ?? Number(today.slice(0, 4))),
  };
}

// Geocode for the country code and location key ("new-york-us"). Never
// throws; falls back to whatever the leg already had.
export async function locate(leg: LegInput) {
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
  return { place, country_code, location_key };
}

const TypicalClimateSchema = z.object({
  climate_summary: z.string(),
  climate_band: z.enum(CLIMATE_BANDS),
});

// Claude's view of the typical weather for a place in a month, used when there
// are no dates for real weather (and for the band, which is always typical).
// Never throws; null on any failure.
export async function typicalClimate(
  city: string,
  country: string,
  month: number,
): Promise<{ climate_summary: string; climate_band: ClimateBand } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 256,
      system: `You describe the typical weather for a place in a given month.
- climate_summary: at most 6 words, all lowercase, e.g. "cool, wet", "hot, humid, rainy season", "cold, snowy".
- climate_band: one of cold, mild, warm or hot, then wet or dry, joined by a hyphen, e.g. "mild-wet".
Write in British English. NEVER use an em dash (—) or an en dash (–).`,
      messages: [
        { role: "user", content: `${city}, ${country} in ${MONTH_NAMES[month - 1]}` },
      ],
      output_config: { format: zodOutputFormat(TypicalClimateSchema) },
    });
    if (!message.parsed_output) return null;
    const result = stripDashes(message.parsed_output);
    return { ...result, climate_summary: result.climate_summary.toLowerCase() };
  } catch (err) {
    console.error("Typical climate lookup failed", { city, country, month }, err);
    return null;
  }
}

// A brand-new leg on a new trip: locate it, then real weather for its dates
// when available, else the climate summary that came with it.
export async function prepareNewLeg(
  leg: LegInput,
  today: string,
  opts: { typical?: boolean } = {},
): Promise<PreparedLeg> {
  const { month, year } = monthAndYear(leg, today);
  const [{ place, country_code, location_key }, typical] = await Promise.all([
    locate(leg),
    opts.typical ? typicalClimate(leg.city, leg.country, month) : Promise.resolve(null),
  ]);
  const weather = place
    ? await tripWeather(leg.city, leg.country, leg.start_date, leg.end_date, today, place)
    : null;
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
    climate_summary:
      weather?.summary ?? typical?.climate_summary ?? leg.climate_summary ?? null,
    climate_band: typical?.climate_band ?? leg.climate_band ?? null,
  };
}
