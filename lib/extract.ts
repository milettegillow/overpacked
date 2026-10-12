import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isIsoDate, monthOf, nightsBetween, type Timing } from "./dates";
import { slugify, stripDashes } from "./text";
import { CLIMATE_BANDS, VIBES, type ClimateBand, type Vibe } from "./trip-fields";
import { tripWeather, type WeatherSource } from "./weather";

const MODEL = "claude-sonnet-4-6";

const LegSchema = z.object({
  city: z.string(),
  country: z.string(),
  country_code: z.string(),
  location_key: z.string(),
  vibe: z.enum(VIBES),
  month: z.number().int(),
  year: z.number().int(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  nights: z.number().int().nullable(),
  timing: z.enum(["past", "ongoing", "upcoming"]),
  climate_summary: z.string(),
  climate_band: z.enum(CLIMATE_BANDS),
});

const ExtractionSchema = z.object({
  title: z.string(),
  legs: z.array(LegSchema),
  list_text: z.string().nullable(),
});

export type ExtractedLeg = {
  city: string;
  country: string;
  country_code: string | null;
  location_key: string;
  vibe: Vibe;
  month: number;
  year: number;
  start_date: string | null;
  end_date: string | null;
  nights: number | null;
  timing: Timing;
  climate_summary: string;
  climate_band: ClimateBand;
  forecast: boolean;
  weather_source: WeatherSource | null;
};

export type Extraction = {
  title: string;
  legs: ExtractedLeg[];
  list_text: string | null;
};

const SYSTEM_PROMPT = `You read a casual description of a trip and pull out its details. The trip may be in the past, happening now, or in the future. Never assume it is upcoming.

The text may also contain a packing list. If it does, copy that list verbatim into list_text and do not treat its items as trip details. Otherwise list_text is null.

TITLE
- A short, natural title in sentence case, e.g. "Cabin in Cavan", "San Francisco and Costa Rica", "Wedding in Lisbon".

LEGS
- One leg per destination, in travel order. "SF then Costa Rica, 3 nights then 7" is two legs. Several stops in one city is one leg.
- If the text gives dates for the whole trip and nights per leg, chain the legs: each leg starts on the day the previous one ends.

FIELDS PER LEG
- city: the main destination town or city, properly capitalised. For a rural spot (a cabin, a campsite), use the nearest town or the named area.
- country: the country's common English name, e.g. "Ireland", "United States".
- country_code: the ISO 3166-1 alpha-2 code in uppercase, e.g. "IE", "US", "CR".
- location_key: the city lowercased and hyphenated, then a hyphen and the lowercase country code. E.g. "new-york-us", "cavan-ie", "sao-paulo-br". Strip accents.
- vibe: the single best fit from city, cabin, beach, ski, hiking, festival, work, wedding.
- month: the month the leg starts, 1-12. If no time is given at all, use the current month.
- year: the year the leg starts, e.g. 2027 for "skiing next March", 2024 for "March 2024". Use tense and context like for dates.
- start_date, end_date: ISO dates (YYYY-MM-DD), only when the text pins down exact days. Past dates are fine.
  - Resolve relative phrases against today's date: "last weekend" is the most recent Saturday to Sunday before today; "next weekend" is the coming one; "9-12 October" is those days.
  - A span without exact days ("last week of October", "a week in June", "March 2024") is not exact: leave both dates null, but still set month (and nights if implied).
  - A date without a year: use past tense and context. "Went to Rome 3-7 May" is the most recent past 3-7 May; "going to Rome 3-7 May" is the next one. With no tense signal, use the next occurrence on or after today.
- nights: a whole number of nights if the text says or clearly implies it ("5 nights", "a long weekend" = 3, "a week" = 7, "last week of October" = 7). Null if you can't tell.
- timing: "past" if the leg has ended before today, "ongoing" if it includes today, "upcoming" if it starts after today. Judge from the dates, or from tense and phrasing ("went", "last", a past year) when there are no dates.
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

// Tidy one leg and enforce the rules rather than trusting the model blindly.
async function finishLeg(
  leg: z.infer<typeof LegSchema>,
  today: string,
): Promise<ExtractedLeg> {
  let start_date = isIsoDate(leg.start_date) ? leg.start_date : null;
  let end_date = isIsoDate(leg.end_date) ? leg.end_date : null;
  if (start_date && end_date && end_date < start_date) {
    start_date = null;
    end_date = null;
  }
  const month = start_date ? monthOf(start_date) : Math.min(12, Math.max(1, leg.month));
  const year = start_date ? Number(start_date.slice(0, 4)) : leg.year;
  const nights =
    nightsBetween(start_date, end_date) ??
    (leg.nights != null && leg.nights >= 0 ? leg.nights : null);
  const timing: Timing = start_date
    ? start_date > today
      ? "upcoming"
      : end_date
        ? end_date < today ? "past" : "ongoing"
        : leg.timing === "upcoming" ? "ongoing" : leg.timing
    : leg.timing;
  const country_code = /^[a-z]{2}$/i.test(leg.country_code)
    ? leg.country_code.toUpperCase()
    : null;
  const location_key = country_code
    ? `${slugify(leg.city)}-${country_code.toLowerCase()}`
    : leg.location_key.toLowerCase();

  // Real weather when the dates allow it; otherwise the typical climate.
  const weather = await tripWeather(leg.city, leg.country, start_date, end_date, today);

  return {
    ...leg,
    country_code,
    location_key,
    month,
    year,
    start_date,
    end_date,
    nights,
    timing,
    climate_summary: weather?.summary ?? leg.climate_summary.toLowerCase(),
    forecast: weather?.source === "forecast",
    weather_source: weather?.source ?? null,
  };
}

export async function extractTrip(text: string, today: string): Promise<Extraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ExtractError("Trip reading isn't configured yet (missing API key).");
  }
  if (!text.trim()) {
    throw new ExtractError("Tell us about your trip first.", 400);
  }

  const client = new Anthropic({ apiKey });

  let parsed: z.infer<typeof ExtractionSchema> | null;
  try {
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Today's date is ${today}.\n\nTrip:\n${text}` },
      ],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    });
    parsed = message.parsed_output;
  } catch (err) {
    console.error("Trip extraction failed", err);
    throw new ExtractError("We couldn't read that just now. Try again in a moment.");
  }
  if (!parsed || parsed.legs.length === 0) {
    throw new ExtractError("We couldn't make sense of that. Try adding a place and a time.");
  }

  // Only the generated fields get the dash ban; list_text is the user's own words.
  const { list_text, ...generated } = parsed;
  const clean = stripDashes(generated);
  const legs = await Promise.all(clean.legs.map((leg) => finishLeg(leg, today)));

  return {
    title: clean.title.trim() || legs.map((l) => l.city).join(" and "),
    legs,
    list_text: list_text?.trim() ? list_text : null,
  };
}
