import { addDays, isIsoDate, isWithinForecastWindow, todayIso } from "./dates";

export { isWithinForecastWindow };

// Open-Meteo: free, no API key. Forecasts reach 16 days ahead; the archive
// goes back decades.
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_HORIZON_DAYS = 15;
// The forecast API also serves roughly the last 3 months of recorded weather.
const RECENT_DAYS = 92;

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

export type WeatherSource = "forecast" | "recorded";
export type TripWeather = { summary: string; source: WeatherSource };

// Which weather a dated trip gets: recorded weather once it has started (past
// or ongoing), a forecast if it starts in the next 10 days, otherwise none
// (keep the typical-climate summary).
export function weatherSourceFor(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  today = todayIso(),
): WeatherSource | null {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
    return null;
  }
  if (startDate < today) return "recorded";
  if (isWithinForecastWindow(startDate, today)) return "forecast";
  return null;
}

type Day = { date: string; high: number | null; low: number | null; wet: boolean | null };

type DailyResponse = {
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
};

// A day counts as wet with 1mm+ of recorded rain, or a 50%+ chance forecast.
const WET_MM = 1;
const WET_PROBABILITY = 50;

async function fetchDays(
  baseUrl: string,
  lat: number,
  lon: number,
  start: string,
  end: string,
  today: string,
): Promise<Day[]> {
  const url = new URL(baseUrl);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  const daily = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum"];
  if (baseUrl === FORECAST_URL) daily.push("precipitation_probability_max");
  url.searchParams.set("daily", daily.join(","));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", start);
  url.searchParams.set("end_date", end);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  const d = ((await res.json()) as DailyResponse).daily ?? {};

  return (d.time ?? []).map((date, i) => {
    const mm = num(d.precipitation_sum?.[i]);
    const chance = num(d.precipitation_probability_max?.[i]);
    // Past days use what fell; future days use the chance of rain.
    const wet =
      date < today
        ? mm == null ? null : mm >= WET_MM
        : chance != null ? chance >= WET_PROBABILITY
        : mm == null ? null : mm >= WET_MM;
    return {
      date,
      high: num(d.temperature_2m_max?.[i]),
      low: num(d.temperature_2m_min?.[i]),
      wet,
    };
  });
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// "8-12°C, rain most days", or null if there's no usable data.
function summarise(days: Day[]): string | null {
  const highs = days.map((d) => d.high).filter((v) => v != null);
  const lows = days.map((d) => d.low).filter((v) => v != null);
  if (highs.length === 0 || lows.length === 0) return null;

  const low = Math.round(Math.min(...lows));
  const high = Math.round(Math.max(...highs));
  const temps =
    low === high ? `${low}°C` : low < 0 ? `${low} to ${high}°C` : `${low}-${high}°C`;

  const known = days.filter((d) => d.wet != null);
  if (known.length === 0) return temps;
  const wetDays = known.filter((d) => d.wet).length;
  const share = wetDays / known.length;
  const rain =
    wetDays === 0
      ? "dry"
      : share <= 0.25
        ? "mostly dry"
        : share < 0.6
          ? "some rain"
          : "rain most days";
  return `${temps}, ${rain}`;
}

// Forecast for upcoming dates. Open-Meteo forecasts ~16 days ahead, so the end
// is clamped to that horizon. Throws on network or API errors.
export async function getForecast(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  today = todayIso(),
): Promise<string | null> {
  const start = startDate < today ? today : startDate;
  const end = minDate(endDate, addDays(today, FORECAST_HORIZON_DAYS));
  if (start > end) return null;
  return summarise(await fetchDays(FORECAST_URL, lat, lon, start, end, today));
}

// What the weather actually was. The forecast API keeps the last ~3 months
// (and covers the rest of an ongoing trip); older dates come from the archive,
// which lags a few days behind. Throws on network or API errors.
export async function getRecordedWeather(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  today = todayIso(),
): Promise<string | null> {
  if (startDate >= addDays(today, -RECENT_DAYS)) {
    const end = minDate(endDate, addDays(today, FORECAST_HORIZON_DAYS));
    return summarise(await fetchDays(FORECAST_URL, lat, lon, startDate, end, today));
  }
  const end = minDate(endDate, addDays(today, -1));
  if (startDate > end) return null;
  return summarise(await fetchDays(ARCHIVE_URL, lat, lon, startDate, end, today));
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

// Geocode and fetch the right kind of weather for a trip's dates. Never
// throws: null means "keep the typical-climate summary".
export async function tripWeather(
  city: string,
  country: string | null,
  startDate: string | null,
  endDate: string | null,
  today = todayIso(),
  place?: Place | null,
): Promise<TripWeather | null> {
  const source = weatherSourceFor(startDate, endDate, today);
  if (!source || !startDate || !endDate) return null;
  try {
    const where = place ?? (await geocode(city, country));
    if (!where) return null;
    const summary =
      source === "forecast"
        ? await getForecast(where.lat, where.lon, startDate, endDate, today)
        : await getRecordedWeather(where.lat, where.lon, startDate, endDate, today);
    return summary ? { summary, source } : null;
  } catch (err) {
    console.error("Weather lookup failed", { city, country, startDate, endDate }, err);
    return null;
  }
}
