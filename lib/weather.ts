import { addDays, isIsoDate, isWithinForecastWindow, todayIso } from "./dates";

export { isWithinForecastWindow };

// Open-Meteo: free, no API key. Forecasts reach 16 days ahead.
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_HORIZON_DAYS = 15;

export type Place = {
  lat: number;
  lon: number;
  name: string;
  country: string | null;
  countryCode: string | null; // ISO 3166-1 alpha-2, lowercase
};

type GeocodingResult = {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
  country_code?: string;
};

// Top match for a city, preferring one in the given country.
export async function geocode(
  city: string,
  country?: string | null,
): Promise<Place | null> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("name", city.trim());
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: GeocodingResult[] };
  const results = data.results ?? [];
  if (results.length === 0) return null;

  const wanted = country?.trim().toLowerCase();
  const match =
    (wanted &&
      results.find(
        (r) =>
          r.country?.toLowerCase() === wanted ||
          r.country_code?.toLowerCase() === wanted,
      )) ||
    results[0];

  return {
    lat: match.latitude,
    lon: match.longitude,
    name: match.name,
    country: match.country ?? null,
    countryCode: match.country_code?.toLowerCase() ?? null,
  };
}

// A short summary in the climate-summary style, e.g. "8-12°C, rain most days".
// Returns null if there's no forecast for those dates yet.
export async function getForecast(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<string | null> {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return null;

  // Clamp to what Open-Meteo can forecast: today to ~15 days out.
  const today = todayIso();
  const horizon = addDays(today, FORECAST_HORIZON_DAYS);
  const start = startDate < today ? today : startDate;
  const end = endDate > horizon ? horizon : endDate;
  if (start > end) return null;

  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", start);
  url.searchParams.set("end_date", end);

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    daily?: {
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
      precipitation_probability_max?: (number | null)[];
    };
  };

  const highs = (data.daily?.temperature_2m_max ?? []).filter(isNumber);
  const lows = (data.daily?.temperature_2m_min ?? []).filter(isNumber);
  const rain = (data.daily?.precipitation_probability_max ?? []).filter(isNumber);
  if (highs.length === 0 || lows.length === 0) return null;

  const low = Math.round(Math.min(...lows));
  const high = Math.round(Math.max(...highs));
  const temps =
    low === high ? `${low}°C` : low < 0 ? `${low} to ${high}°C` : `${low}-${high}°C`;

  return rain.length > 0 ? `${temps}, ${describeRain(rain)}` : temps;
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Share of days with a 50%+ chance of rain.
function describeRain(probabilities: number[]): string {
  const wetDays = probabilities.filter((p) => p >= 50).length;
  const share = wetDays / probabilities.length;
  if (wetDays === 0) return "dry";
  if (share <= 0.25) return "mostly dry";
  if (share < 0.6) return "some rain";
  return "rain most days";
}

// Geocode and fetch in one go; null on any failure so callers can fall back to
// the typical-climate summary.
export async function forecastSummary(
  city: string,
  country: string | null,
  startDate: string,
  endDate: string,
): Promise<string | null> {
  try {
    const place = await geocode(city, country);
    if (!place) return null;
    return await getForecast(place.lat, place.lon, startDate, endDate);
  } catch {
    return null;
  }
}
