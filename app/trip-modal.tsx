"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ALL_CATEGORIES } from "@/lib/categories";
import { clearListText, localToday, readListText, requestJson } from "@/lib/client";
import {
  flagEmoji,
  getLegMode,
  tripSummaryLine,
  type Item,
  type ItemStatus,
  type Leg,
  type LegSuggestions,
  type Suggestion,
  type SuggestionSource,
  type TripDetail,
  type TripMode,
} from "@/lib/trip-fields";
import { TripEditForm } from "./trip-edit-form";
import { AutoGrowTextarea } from "./ui/auto-grow-textarea";
import { CheckIcon, PlusIcon, SearchIcon, XIcon } from "./ui/icons";
import { LegTag } from "./ui/leg-tag";
import { inputClass, pillClass } from "./ui/styles";

const SOURCE_LABEL: Record<SuggestionSource, string> = {
  own: "Your past trips",
  others: "Other travellers",
  claude: "Idea",
};

const CATEGORY_ORDER = new Map<string, number>(ALL_CATEGORIES.map((c, i) => [c, i]));

function categoryRank(category: string): number {
  return CATEGORY_ORDER.get(category) ?? ALL_CATEGORIES.length;
}

export function TripModal({
  tripId,
  legId,
  onSelectLeg,
  onClose,
  onDeleted,
}: {
  tripId: string;
  // The leg being viewed on a multi-leg trip; null for the whole trip.
  legId: string | null;
  onSelectLeg: (legId: string | null) => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [trip, setTrip] = useState<TripDetail | null>(null);
  // The browser's date, read once the trip loads (never during render).
  const [today, setToday] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reset on close: the modal unmounts.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const panelRef = useRef<HTMLDivElement>(null);

  // Load the trip.
  useEffect(() => {
    let cancelled = false;
    requestJson<TripDetail>(`/api/trips/${encodeURIComponent(tripId)}`)
      .then((detail) => {
        if (cancelled) return;
        setTrip(detail);
        setToday(localToday());
        setItems(detail.items);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  // Lock the page behind, close on Escape, focus the panel. Once per open.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const legs = trip?.legs ?? [];
  const multi = legs.length > 1;

  // Leg view: this leg's items (plus those for all legs), its weather and its
  // own planning or review mode. Unknown or removed legs fall back to the
  // whole trip.
  const viewLeg = multi ? (legs.find((l) => l.id === legId) ?? null) : null;
  const legModes = new Map<string, TripMode>(
    trip && today ? legs.map((l) => [l.id, getLegMode(l, trip.created_at, today)]) : [],
  );
  const mode: TripMode = viewLeg
    ? (legModes.get(viewLeg.id) ?? "review")
    : legs.length > 0 && legs.every((l) => legModes.get(l.id) === "planning")
      ? "planning"
      : "review";
  // Suggestions: this leg if it's being planned; on the whole trip, every leg
  // that is.
  const suggestLegs = (viewLeg ? [viewLeg] : legs).filter(
    (l) => legModes.get(l.id) === "planning",
  );
  const viewItems = viewLeg
    ? items.filter((i) => i.leg_id == null || i.leg_id === viewLeg.id)
    : items;

  // Optimistic update with rollback.
  async function patchItem(id: string, patch: Partial<Pick<Item, "status" | "leg_id">>) {
    const before = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setError(null);
    try {
      await requestJson(`/api/items/${id}`, { method: "PATCH", body: patch });
    } catch (err) {
      setItems(before);
      setError((err as Error).message);
    }
  }

  async function removeItem(id: string) {
    const before = items;
    setItems((list) => list.filter((i) => i.id !== id));
    setError(null);
    try {
      await requestJson(`/api/items/${id}`, { method: "DELETE" });
    } catch (err) {
      setItems(before);
      setError((err as Error).message);
    }
  }

  // Adds items and shows them straight away. Returns the error message on
  // failure (null on success) so each control can show it next to itself.
  async function addItems(body: Record<string, unknown>): Promise<string | null> {
    try {
      const { items: added } = await requestJson<{ items: Item[] }>(
        `/api/trips/${tripId}/items`,
        { body },
      );
      setItems((list) => [...list, ...added]);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }

  function cycleLeg(item: Item) {
    const ids = [null, ...legs.map((l) => l.id)];
    const next = ids[(ids.indexOf(item.leg_id) + 1) % ids.length];
    patchItem(item.id, { leg_id: next });
  }

  // Search applies everywhere; status filters only exist in review mode.
  const needle = query.trim().toLowerCase();
  const searched = needle
    ? viewItems.filter((i) => i.name.toLowerCase().includes(needle))
    : viewItems;
  const activeFilter = mode === "review" ? filter : "all";
  const shown = searched.filter((i) => FILTERS[activeFilter].test(i.status));
  const shownPacked = shown.filter((i) => i.status !== "wished");
  const shownWished = mode === "review" ? shown.filter((i) => i.status === "wished") : [];
  const counts = Object.fromEntries(
    FILTER_ORDER.map((f) => [f, searched.filter((i) => FILTERS[f].test(i.status)).length]),
  ) as Record<StatusFilter, number>;
  const filtering = needle !== "" || activeFilter !== "all";
  const nothingMatches = filtering && shownPacked.length + shownWished.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/60 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-modal-title"
        tabIndex={-1}
        className="relative h-full w-full overflow-y-auto overscroll-contain bg-background px-4 py-6 outline-none sm:h-auto sm:max-h-full sm:max-w-[640px] sm:rounded-card sm:px-6"
      >
        <div className="absolute top-4 right-4 flex items-center gap-1">
          {trip && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full px-3 py-1.5 text-foreground hover:bg-raised"
            >
              Edit trip
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-foreground hover:bg-raised"
          >
            <XIcon size={20} />
          </button>
        </div>

        {loadError && <p className="pt-8 text-unneeded-foreground">{loadError}</p>}

        {trip && (
          <div className="flex flex-col gap-8">
            {editing ? (
              <TripEditForm
                trip={trip}
                onCancel={() => setEditing(false)}
                onSaved={(updated) => {
                  // Dates may have moved the trip between planning and review;
                  // removed legs leave their items tagged to all legs.
                  setTrip(updated);
                  setItems(updated.items);
                  setToday(localToday());
                  setEditing(false);
                  router.refresh();
                }}
              />
            ) : (
              <TripHeader trip={trip} viewLeg={viewLeg} onSelectLeg={onSelectLeg} />
            )}

            {items.length === 0 ? (
              <EmptyList trip={trip} onAdd={addItems} />
            ) : (
              <>
                {today && suggestLegs.length > 0 && (
                  <Suggestions
                    key={viewLeg?.id ?? "whole"}
                    tripId={tripId}
                    legs={legs}
                    viewLegId={viewLeg?.id ?? null}
                    items={items}
                    onAdd={async (s, legId) => {
                      setError(null);
                      const failure = await addItems({
                        mode: "suggestion",
                        name: s.name,
                        category: s.category,
                        canonical_name: s.canonical_name,
                        leg_id: multi ? legId : null,
                      });
                      if (failure) setError(errorMessage(failure, "Couldn't add that - try again"));
                      return failure == null;
                    }}
                  />
                )}

                <div className="flex flex-col gap-3">
                  <SearchInput value={query} onChange={setQuery} />
                  {mode === "review" && (
                    <FilterPills value={filter} counts={counts} onChange={setFilter} />
                  )}
                </div>

                {nothingMatches && <p>Nothing matches</p>}

                <PackedList
                  items={shownPacked}
                  legs={legs}
                  mode={mode}
                  onStatus={(item, status) => patchItem(item.id, { status })}
                  onCycleLeg={cycleLeg}
                  onRemove={removeItem}
                />
              </>
            )}

            {items.length > 0 && (
              <AddInput
                label="Add item"
                failMessage="Couldn't add that item - try again"
                onSubmit={(text) => addItems({ mode: "parse", text })}
              />
            )}

            {mode === "review" && (
              <section className="flex flex-col gap-3">
                <div>
                  <span className="inline-block rounded-full bg-wished px-3 py-1 text-wished-foreground">
                    Wish I&apos;d brought
                  </span>
                </div>
                {shownWished.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {shownWished.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 rounded-row bg-raised py-2 pr-2 pl-4"
                      >
                        <span className="min-w-0 flex-1 py-1">
                          {item.name}
                          {item.quantity > 1 && <span className="text-moss"> ×{item.quantity}</span>}
                        </span>
                        <span className="flex items-center gap-1.5">
                          {multi && (
                            <LegControl item={item} legs={legs} onCycle={() => cycleLeg(item)} />
                          )}
                          <RemoveButton name={item.name} onRemove={() => removeItem(item.id)} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <AddInput
                  label="Add something you wished you'd brought"
                  failMessage="Couldn't add that - try again"
                  onSubmit={(text) => addItems({ mode: "parse", text, status: "wished" })}
                />
              </section>
            )}

            {error && (
              <p role="alert" className="text-unneeded-foreground">
                {error}
              </p>
            )}

            <DeleteTrip tripId={tripId} onDeleted={onDeleted} onError={setError} />
          </div>
        )}
      </div>
    </div>
  );
}

type StatusFilter = "all" | "glad" | "unneeded" | "neutral" | "wished";

const FILTER_ORDER: StatusFilter[] = ["all", "glad", "unneeded", "neutral", "wished"];

// Pill styles reuse the status colours; All and Not marked are neutral cream.
const FILTERS: Record<
  StatusFilter,
  { label: string; test: (s: ItemStatus) => boolean; on: string; off: string }
> = {
  all: {
    label: "All",
    test: () => true,
    on: "border-foreground bg-foreground text-background",
    off: "border-foreground text-foreground",
  },
  glad: {
    label: "So glad",
    test: (s) => s === "glad",
    on: "border-glad bg-glad text-glad-foreground",
    off: "border-glad text-glad-foreground",
  },
  unneeded: {
    label: "Didn't need",
    test: (s) => s === "unneeded",
    on: "border-unneeded bg-unneeded text-unneeded-foreground",
    off: "border-unneeded text-unneeded-foreground",
  },
  neutral: {
    label: "Not marked",
    test: (s) => s === "neutral",
    on: "border-foreground bg-foreground text-background",
    off: "border-foreground text-foreground",
  },
  wished: {
    label: "Wish I'd brought",
    test: (s) => s === "wished",
    on: "border-wished bg-wished text-wished-foreground",
    off: "border-wished text-wished-foreground",
  },
};

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <SearchIcon
        size={18}
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-moss"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search your list"
        aria-label="Search your list"
        className={`${inputClass} pr-11 pl-11 [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-moss hover:text-foreground"
        >
          <XIcon size={16} />
        </button>
      )}
    </div>
  );
}

function FilterPills({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (f: StatusFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
      {FILTER_ORDER.map((f) => {
        const active = value === f;
        const style = FILTERS[f];
        return (
          <button
            key={f}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f)}
            className={`whitespace-nowrap rounded-full border px-3 py-0.5 ${active ? style.on : `bg-transparent ${style.off}`}`}
          >
            {style.label} {counts[f]}
          </button>
        );
      })}
    </div>
  );
}

// A single leg whose tag would just repeat the title adds nothing.
function showLegTags(trip: TripDetail): boolean {
  if (trip.legs.length === 0) return false;
  if (trip.legs.length > 1) return true;
  const city = (trip.legs[0].city ?? "").trim().toLowerCase();
  return city !== trip.title.trim().toLowerCase();
}

function TripHeader({
  trip,
  viewLeg,
  onSelectLeg,
}: {
  trip: TripDetail;
  viewLeg: Leg | null;
  onSelectLeg: (legId: string | null) => void;
}) {
  const multi = trip.legs.length > 1;
  const weatherLegs = viewLeg ? [viewLeg] : trip.legs;
  return (
    <header className="flex flex-col gap-3 pr-32">
      <h2 id="trip-modal-title" className="text-2xl font-medium tracking-tight">
        {trip.title}
      </h2>
      {multi ? (
        // A tag per leg plus "Whole trip": the current view is filled.
        <div className="flex flex-wrap gap-2" role="group" aria-label="View">
          {trip.legs.map((leg) => (
            <button
              key={leg.id}
              type="button"
              aria-pressed={viewLeg?.id === leg.id}
              onClick={() => onSelectLeg(leg.id)}
            >
              <LegTag leg={leg} filled={viewLeg?.id === leg.id} />
            </button>
          ))}
          <button
            type="button"
            aria-pressed={viewLeg == null}
            onClick={() => onSelectLeg(null)}
            className={`whitespace-nowrap rounded-full border border-foreground px-3 py-0.5 ${
              viewLeg == null ? "bg-foreground text-background" : "text-foreground"
            }`}
          >
            Whole trip
          </button>
        </div>
      ) : (
        showLegTags(trip) && (
          <div className="flex flex-wrap gap-2">
            {trip.legs.map((leg) => (
              <LegTag key={leg.id} leg={leg} />
            ))}
          </div>
        )
      )}
      <div className="flex flex-col">
        {weatherLegs.map((leg) => {
          const line = tripSummaryLine(leg);
          return line ? (
            <p key={leg.id} className="text-moss">
              {line}
            </p>
          ) : null;
        })}
      </div>
    </header>
  );
}

// The real error while developing; a plain one for everyone else.
function errorMessage(error: string, fallback: string): string {
  return process.env.NODE_ENV === "development" ? error : fallback;
}

function InlineError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-unneeded-foreground">
      {message}
    </p>
  ) : null;
}

function EmptyList({
  trip,
  onAdd,
}: {
  trip: TripDetail;
  onAdd: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  // A list pasted on the new trip page arrives pre-filled.
  const [text, setText] = useState(() => readListText(trip.id) ?? "");
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const busy = adding || copying;

  // On success the itemised list replaces this whole block; on failure the
  // pasted text stays put.
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setListError(null);
    setCopyError(null);
    setAdding(true);
    const failure = await onAdd({ mode: "parse", text });
    if (failure == null) {
      clearListText(trip.id);
    } else {
      setListError(errorMessage(failure, "Couldn't add your list - try again"));
      setAdding(false);
    }
  }

  async function copy(from: string) {
    if (!from || busy) return;
    setListError(null);
    setCopyError(null);
    setCopying(true);
    const failure = await onAdd({ mode: "copy", from });
    if (failure != null) {
      setCopyError(errorMessage(failure, "Couldn't copy that trip - try again"));
      setCopying(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <AutoGrowTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your packing list"
          aria-label="Packing list"
          rows={6}
          required
          disabled={adding}
          className={`${inputClass} resize-none overflow-hidden disabled:opacity-60`}
        />
        <InlineError message={listError} />
        <div>
          <button type="submit" disabled={busy || !text.trim()} className={pillClass}>
            {adding ? "Adding…" : "Add list"}
          </button>
        </div>
      </form>

      {trip.other_trips.length > 0 && (
        <div className="flex flex-col gap-3">
          <select
            aria-label="Copy from a previous trip"
            value=""
            disabled={busy}
            onChange={(e) => copy(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          >
            <option value="">{copying ? "Copying…" : "Copy from a previous trip"}</option>
            {trip.other_trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <InlineError message={copyError} />
        </div>
      )}
    </div>
  );
}

function PackedList({
  items,
  legs,
  mode,
  onStatus,
  onCycleLeg,
  onRemove,
}: {
  items: Item[];
  legs: Leg[];
  mode: TripMode;
  onStatus: (item: Item, status: ItemStatus) => void;
  onCycleLeg: (item: Item) => void;
  onRemove: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const byCategory = new Map<string, Item[]>();
    for (const item of items) {
      byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    }
    return [...byCategory.entries()].sort(
      ([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b),
    );
  }, [items]);

  if (items.length === 0) return null;
  const multi = legs.length > 1;

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([category, group]) => (
        <section key={category} className="flex flex-col gap-2">
          <h3 className="text-moss">{category}</h3>
          <ul className="flex flex-col gap-2">
            {group.map((item) => (
              // Controls wrap under the name when the row gets tight.
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-row bg-raised py-2 pr-2 pl-4"
              >
                <span className="min-w-[9rem] flex-1 py-1">
                  {item.name}
                  {item.quantity > 1 && <span className="text-moss"> ×{item.quantity}</span>}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {multi && <LegControl item={item} legs={legs} onCycle={() => onCycleLeg(item)} />}
                  {mode === "review" && (
                    <>
                      <StatusToggle
                        status="glad"
                        active={item.status === "glad"}
                        onClick={() => onStatus(item, item.status === "glad" ? "neutral" : "glad")}
                      />
                      <StatusToggle
                        status="unneeded"
                        active={item.status === "unneeded"}
                        onClick={() =>
                          onStatus(item, item.status === "unneeded" ? "neutral" : "unneeded")
                        }
                      />
                    </>
                  )}
                  <RemoveButton name={item.name} onRemove={() => onRemove(item.id)} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const TOGGLES = {
  glad: {
    label: "So glad",
    Icon: CheckIcon,
    on: "border-glad bg-glad text-glad-foreground",
    off: "border-glad text-glad-foreground",
  },
  unneeded: {
    label: "Didn't need",
    Icon: XIcon,
    on: "border-unneeded bg-unneeded text-unneeded-foreground",
    off: "border-unneeded text-unneeded-foreground",
  },
} as const;

// Outlined when off, filled when on. Tapping the active one turns it off.
function StatusToggle({
  status,
  active,
  onClick,
}: {
  status: "glad" | "unneeded";
  active: boolean;
  onClick: () => void;
}) {
  const t = TOGGLES[status];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 ${active ? t.on : `bg-transparent ${t.off}`}`}
    >
      <t.Icon size={14} />
      {t.label}
    </button>
  );
}

// Which leg an item belongs to on multi-leg trips: a flag, or empty for all legs.
function LegControl({
  item,
  legs,
  onCycle,
}: {
  item: Item;
  legs: Leg[];
  onCycle: () => void;
}) {
  const leg = legs.find((l) => l.id === item.leg_id) ?? null;
  const flag = leg ? flagEmoji(leg.country_code) : "";
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={leg ? `Leg: ${leg.city ?? "leg"}` : "Leg: all legs"}
      className="flex size-8 shrink-0 items-center justify-center rounded-full"
    >
      {leg ? (
        <span aria-hidden="true">{flag || (leg.city ?? "?").charAt(0)}</span>
      ) : (
        <span aria-hidden="true" className="size-4 rounded-full border border-dashed border-moss/60" />
      )}
    </button>
  );
}

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${name}`}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-moss hover:text-foreground"
    >
      <XIcon size={14} />
    </button>
  );
}

function AddInput({
  label,
  failMessage,
  onSubmit,
}: {
  label: string;
  failMessage: string;
  onSubmit: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleared on success; kept on failure so nothing typed is lost.
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setError(null);
    setBusy(true);
    const failure = await onSubmit(text);
    if (failure == null) setText("");
    else setError(errorMessage(failure, failMessage));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={label}
          aria-label={label}
          disabled={busy}
          className={`${inputClass} disabled:opacity-60`}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-full bg-primary px-5 font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
      <InlineError message={error} />
    </div>
  );
}

function Suggestions({
  tripId,
  legs,
  viewLegId,
  items,
  onAdd,
}: {
  tripId: string;
  legs: Leg[];
  viewLegId: string | null;
  items: Item[];
  onAdd: (s: Suggestion, legId: string) => Promise<boolean>;
}) {
  const [results, setResults] = useState<LegSuggestions[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  // Refresh whenever the list or the legs change (debounced).
  const signature = useMemo(
    () =>
      [
        ...items.map((i) => `${i.id}:${i.status}:${i.leg_id ?? ""}`).sort(),
        ...legs.map((l) => `${l.id}:${l.location_key}:${l.month}:${l.vibe}:${l.climate_band}`),
      ].join("|"),
    [items, legs],
  );

  const load = useCallback(
    (signal: AbortSignal) =>
      fetch(
        `/api/trips/${tripId}/suggestions${viewLegId ? `?leg=${encodeURIComponent(viewLegId)}` : ""}`,
        { signal },
      )
        .then((res) => (res.ok ? res.json() : { legs: [] }))
        .then((data: { legs: LegSuggestions[] }) => setResults(data.legs))
        .catch(() => {
          // suggestions are a nice-to-have; keep what we had
        }),
    [tripId, viewLegId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [signature, load]);

  // Group under leg tags only on a multi-leg trip's whole-trip view.
  const multi = legs.length > 1 && viewLegId == null;
  const withContent = results.filter((r) => r.forgotten.length > 0 || r.not_needed.length > 0);
  if (withContent.length === 0) return null;

  async function add(s: Suggestion, legId: string) {
    const key = `${legId}:${s.canonical_name}`;
    setAdding(key);
    if (await onAdd(s, legId)) {
      setResults((rs) =>
        rs.map((r) =>
          r.leg_id === legId
            ? { ...r, forgotten: r.forgotten.filter((f) => f.canonical_name !== s.canonical_name) }
            : r,
        ),
      );
    }
    setAdding(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {withContent.map((r) => {
        const leg = legs.find((l) => l.id === r.leg_id);
        return (
          <div key={r.leg_id} className="flex flex-col gap-4">
            {multi && leg && (
              <div>
                <LegTag leg={leg} />
              </div>
            )}
            {r.forgotten.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">You might have forgotten</h3>
                <ul className="flex flex-col gap-2">
                  {r.forgotten.map((s) => (
                    <li key={s.canonical_name}>
                      <button
                        type="button"
                        disabled={adding === `${r.leg_id}:${s.canonical_name}`}
                        onClick={() => add(s, r.leg_id)}
                        className={`${SUGGESTION_ROW} w-full text-left hover:bg-[#6E8A55]/10 disabled:opacity-60`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <PlusIcon size={16} className="shrink-0" />
                          {s.name}
                        </span>
                        <SourceTag source={s.source} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {r.not_needed.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">You might not need</h3>
                <ul className="flex flex-col gap-2">
                  {r.not_needed.map((s) => (
                    <li key={s.canonical_name} className={SUGGESTION_ROW}>
                      <span>{s.name}</span>
                      <SourceTag source={s.source} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Dashed and transparent so suggestions never read as part of the list.
const SUGGESTION_ROW =
  "flex items-center justify-between gap-3 rounded-row border-[1.5px] border-dashed border-[#6E8A55] bg-transparent px-4 py-3 text-[#C9D9B3]";

function SourceTag({ source }: { source: SuggestionSource }) {
  return (
    <span className="shrink-0 rounded-full border border-[#6E8A55] px-2.5 py-0.5 text-[#C9D9B3]">
      {SOURCE_LABEL[source]}
    </span>
  );
}

function DeleteTrip({
  tripId,
  onDeleted,
  onError,
}: {
  tripId: string;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await requestJson(`/api/trips/${tripId}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className="pt-4">
        <button type="button" onClick={() => setConfirming(true)} className="text-unneeded-foreground">
          Delete trip
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 pt-4">
      <span>Delete this trip?</span>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-full bg-unneeded px-5 py-2 text-unneeded-foreground disabled:opacity-60"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-foreground">
        Cancel
      </button>
    </div>
  );
}
