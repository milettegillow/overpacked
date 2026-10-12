// Shared vocabulary for trip details. Safe to import from client components.

import { todayIso } from "./dates";

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

// Outline colour for location tags, by vibe.
export const VIBE_COLOURS: Record<Vibe, string> = {
  cabin: "#8FB59A",
  beach: "#7FC4BA",
  city: "#D9A38A",
  ski: "#A9B4C6",
  hiking: "#C9C27A",
  festival: "#D49AC0",
  work: "#C2B8A8",
  wedding: "#E0A5AF",
};

export function vibeColour(vibe: string | null): string {
  return VIBE_COLOURS[vibe as Vibe] ?? "#C2B8A8";
}

// "IE" -> 🇮🇪. Empty string for anything that isn't two letters.
export function flagEmoji(countryCode: string | null): string {
  if (!countryCode || !/^[a-z]{2}$/i.test(countryCode)) return "";
  return String.fromCodePoint(
    ...countryCode.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export type ItemStatus = "neutral" | "glad" | "unneeded" | "wished";

export type Leg = {
  id: string;
  position: number;
  city: string | null;
  country: string | null;
  country_code: string | null;
  location_key: string | null;
  vibe: string | null;
  month: number | null;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  nights: number | null;
  climate_summary: string | null;
  climate_band: string | null;
};

export type TripCard = {
  id: string;
  title: string;
  created_at: string;
  legs: Leg[];
};

export type Item = {
  id: string;
  leg_id: string | null;
  name: string;
  category: string;
  quantity: number;
  status: ItemStatus;
  canonical_name: string | null;
};

export type TripDetail = {
  id: string;
  title: string;
  created_at: string;
  legs: Leg[];
  items: Item[];
  other_trips: { id: string; title: string }[];
};

export type SuggestionSource = "own" | "others" | "claude";

export type Suggestion = {
  canonical_name: string;
  name: string;
  category: string;
  source: SuggestionSource;
};

export type LegSuggestions = {
  leg_id: string;
  forgotten: Suggestion[];
  not_needed: Suggestion[];
};

// "October 2026 · 3 nights" for a whole trip: the first leg's month (and year
// when it has dates), and total nights across legs.
export function tripDateLine(legs: Leg[]): string {
  const parts: string[] = [];
  const first = legs[0];
  if (first?.start_date) {
    const [y, m] = first.start_date.split("-").map(Number);
    parts.push(`${MONTH_NAMES[m - 1]} ${y}`);
  } else if (first?.month != null && first.month >= 1 && first.month <= 12) {
    parts.push(
      first.year ? `${MONTH_NAMES[first.month - 1]} ${first.year}` : MONTH_NAMES[first.month - 1],
    );
  }
  const known = legs.filter((l) => l.nights != null);
  if (known.length > 0) {
    const nights = known.reduce((sum, l) => sum + (l.nights ?? 0), 0);
    parts.push(`${nights} ${nights === 1 ? "night" : "nights"}`);
  }
  return parts.join(" · ");
}

export type TripMode = "planning" | "review";

// Planning for future trips, review for past and ongoing ones, decided by the
// first leg: its start date if it has one, otherwise its month and year
// (falling back to the year the trip was added).
export function getTripMode(
  trip: { created_at: string; legs: Pick<Leg, "start_date" | "month" | "year">[] },
  today: string = todayIso(),
): TripMode {
  const first = trip.legs[0];
  if (!first) return "review";
  if (first.start_date) return first.start_date > today ? "planning" : "review";
  if (first.month == null) return "review";
  const year = first.year ?? Number(trip.created_at.slice(0, 4));
  const tripMonth = year * 12 + first.month;
  const thisMonth = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
  return tripMonth > thisMonth ? "planning" : "review";
}
