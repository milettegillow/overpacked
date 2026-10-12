// Browser-side helpers shared by client components.

// The browser's local date, so relative dates match the user's calendar.
export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

export async function requestJson<T>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (typeof data.error === "string") throw new Error(data.error);
    throw new Error(
      process.env.NODE_ENV === "development"
        ? `Request failed: ${res.status} ${res.statusText}`
        : "Something went wrong. Try again.",
    );
  }
  return data as T;
}

// A pasted packing list found during trip extraction, handed to the trip modal.
const LIST_KEY = (tripId: string) => `overpacked:list:${tripId}`;

export function stashListText(tripId: string, text: string) {
  try {
    sessionStorage.setItem(LIST_KEY(tripId), text);
  } catch {
    // storage unavailable; the list just won't be pre-filled
  }
}

export function readListText(tripId: string): string | null {
  try {
    return sessionStorage.getItem(LIST_KEY(tripId));
  } catch {
    return null;
  }
}

export function clearListText(tripId: string) {
  try {
    sessionStorage.removeItem(LIST_KEY(tripId));
  } catch {
    // nothing to clear
  }
}
