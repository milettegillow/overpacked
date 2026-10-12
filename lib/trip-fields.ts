// Shared vocabulary for trip details. Safe to import from client components.

export const VIBES = [
  "city",
  "cabin",
  "beach",
  "ski",
  "hiking",
  "festival",
  "work",
  "wedding",
] as const;
export type Vibe = (typeof VIBES)[number];

export const CLIMATE_BANDS = [
  "cold-wet",
  "cold-dry",
  "mild-wet",
  "mild-dry",
  "warm-wet",
  "warm-dry",
  "hot-wet",
  "hot-dry",
] as const;
export type ClimateBand = (typeof CLIMATE_BANDS)[number];

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// "October · 5 nights · cool, wet". Missing parts are skipped.
export function tripSummaryLine(trip: {
  month: number | null;
  nights: number | null;
  climate_summary: string | null;
}): string {
  const parts: string[] = [];
  if (trip.month != null && trip.month >= 1 && trip.month <= 12) {
    parts.push(MONTH_NAMES[trip.month - 1]);
  }
  if (trip.nights != null) {
    parts.push(`${trip.nights} ${trip.nights === 1 ? "night" : "nights"}`);
  }
  if (trip.climate_summary) parts.push(trip.climate_summary);
  return parts.join(" · ");
}
