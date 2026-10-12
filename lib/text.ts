// Belt and braces for generated copy: replace any em or en dash with a spaced
// hyphen, recursively through strings, arrays and plain objects.
export function stripDashes<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\s*[—–]\s*/g, " - ") as T;
  }
  if (Array.isArray(value)) return value.map(stripDashes) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, stripDashes(v)]),
    ) as T;
  }
  return value;
}

// "New York", "Zürich" -> "new-york", "zurich"
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
