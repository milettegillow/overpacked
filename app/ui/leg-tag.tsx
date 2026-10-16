import { flagEmoji, vibeColour } from "@/lib/trip-fields";

// Location pill: flag + city, coloured by vibe. Outlined by default so it
// never clashes with the filled status pills; `filled` marks the leg being
// viewed, and `selected` an active filter.
export function LegTag({
  leg,
  selected = false,
  filled = false,
}: {
  leg: { city: string | null; country_code: string | null; vibe: string | null };
  selected?: boolean;
  filled?: boolean;
}) {
  const colour = vibeColour(leg.vibe);
  const flag = flagEmoji(leg.country_code);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-0.5"
      style={{
        borderColor: colour,
        color: filled ? "var(--background)" : colour,
        backgroundColor: filled ? colour : selected ? `${colour}26` : "transparent",
      }}
    >
      {flag && <span aria-hidden="true">{flag}</span>}
      {leg.city || "Somewhere"}
    </span>
  );
}
