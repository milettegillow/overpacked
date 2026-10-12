// Date helpers working on ISO calendar dates ("2026-10-24"), compared in UTC so
// timezones and daylight saving never shift a day.

export const FORECAST_WINDOW_DAYS = 10;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

// Today's date in the given IANA timezone (default UK, the app's home).
export function todayIso(timeZone = "Europe/London"): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// Whole days from a to b (b - a).
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS,
  );
}

// Nights between two dates, or null if either is missing or they're reversed.
export function nightsBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!isIsoDate(start) || !isIsoDate(end)) return null;
  const nights = daysBetween(start, end);
  return nights >= 0 ? nights : null;
}

export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

// True if the trip starts between today and FORECAST_WINDOW_DAYS from today.
export function isWithinForecastWindow(
  startDate: string | null | undefined,
  today = todayIso(),
): boolean {
  if (!isIsoDate(startDate)) return false;
  const until = daysBetween(today, startDate);
  return until >= 0 && until <= FORECAST_WINDOW_DAYS;
}

// Without a start date, the trip could be soon if its month overlaps the
// forecast window (e.g. "this month", or next month near the end of this one).
export function couldStartWithinForecastWindow(
  month: number | null | undefined,
  startDate: string | null | undefined,
  today = todayIso(),
): boolean {
  if (isIsoDate(startDate)) return isWithinForecastWindow(startDate, today);
  if (month == null) return false;
  const windowEnd = addDays(today, FORECAST_WINDOW_DAYS);
  return monthOf(today) === month || monthOf(windowEnd) === month;
}
