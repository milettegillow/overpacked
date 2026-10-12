"use client";

// Trip and leg fields shared by the new trip confirm step and trip editing.

import { useState, type ReactNode } from "react";
import { localToday } from "@/lib/client";
import { monthOf, needsDatesForForecast, nightsBetween, type Timing } from "@/lib/dates";
import {
  MONTH_NAMES,
  VIBES,
  sentenceCase,
  tripSummaryLine,
  type ClimateBand,
  type Leg,
  type Vibe,
} from "@/lib/trip-fields";
import { LegTag } from "@/app/ui/leg-tag";
import { inputClass } from "@/app/ui/styles";

export type LegFields = {
  key: number;
  id?: string; // set when editing a saved leg
  city: string;
  country: string;
  country_code: string | null;
  location_key: string | null;
  vibe: Vibe;
  month: number;
  year: number;
  start_date: string;
  end_date: string;
  nights: string;
  timing: Timing;
  climate_summary: string | null;
  climate_band: ClimateBand | null;
};

export type ExtractedLeg = Omit<LegFields, "key" | "id" | "start_date" | "end_date" | "nights"> & {
  start_date: string | null;
  end_date: string | null;
  nights: number | null;
};

let nextKey = 1;

export function fromExtracted(leg: ExtractedLeg): LegFields {
  return {
    key: nextKey++,
    city: leg.city,
    country: leg.country,
    country_code: leg.country_code,
    location_key: leg.location_key,
    vibe: leg.vibe,
    month: leg.month,
    year: leg.year,
    start_date: leg.start_date ?? "",
    end_date: leg.end_date ?? "",
    nights: leg.nights == null ? "" : String(leg.nights),
    timing: leg.timing,
    climate_summary: leg.climate_summary,
    climate_band: leg.climate_band,
  };
}

// Past or upcoming from the dates, or the month and year without them.
function timingOf(
  start: string | null,
  end: string | null,
  month: number,
  year: number,
  today: string,
): Timing {
  if (start) {
    if (start > today) return "upcoming";
    return end && end < today ? "past" : "ongoing";
  }
  const legMonth = year * 12 + month;
  const thisMonth = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
  return legMonth > thisMonth ? "upcoming" : "past";
}

export function fromLeg(leg: Leg, today: string): LegFields {
  const month = leg.month ?? Number(today.slice(5, 7));
  const year = leg.year ?? Number(today.slice(0, 4));
  return {
    key: nextKey++,
    id: leg.id,
    city: leg.city ?? "",
    country: leg.country ?? "",
    country_code: leg.country_code,
    location_key: leg.location_key,
    vibe: (VIBES as readonly string[]).includes(leg.vibe ?? "") ? (leg.vibe as Vibe) : "city",
    month,
    year,
    start_date: leg.start_date ?? "",
    end_date: leg.end_date ?? "",
    nights: leg.nights == null ? "" : String(leg.nights),
    timing: timingOf(leg.start_date, leg.end_date, month, year, today),
    climate_summary: leg.climate_summary,
    climate_band: (leg.climate_band as ClimateBand | null) ?? null,
  };
}

// A new leg picks up where the previous one ends.
function blankLegAfter(prev: LegFields): LegFields {
  return {
    key: nextKey++,
    city: "",
    country: "",
    country_code: null,
    location_key: null,
    vibe: prev.vibe,
    month: prev.end_date ? monthOf(prev.end_date) : prev.month,
    year: prev.end_date ? Number(prev.end_date.slice(0, 4)) : prev.year,
    start_date: prev.end_date,
    end_date: "",
    nights: "",
    timing: prev.timing,
    climate_summary: null,
    climate_band: null,
  };
}

// Dates drive the month, year and number of nights.
function withDate(leg: LegFields, field: "start_date" | "end_date", value: string): LegFields {
  const next = { ...leg, [field]: value };
  const nights = nightsBetween(next.start_date, next.end_date);
  if (nights != null) next.nights = String(nights);
  if (next.start_date) {
    next.month = monthOf(next.start_date);
    next.year = Number(next.start_date.slice(0, 4));
  }
  return next;
}

export function useLegList(initial: LegFields[] | null) {
  const [legs, setLegs] = useState<LegFields[] | null>(initial);

  function update(key: number, patch: Partial<LegFields>) {
    setLegs((ls) => ls?.map((l) => (l.key === key ? { ...l, ...patch } : l)) ?? ls);
  }

  return {
    legs,
    setLegs,
    update,
    setDate(key: number, field: "start_date" | "end_date", value: string) {
      setLegs((ls) => ls?.map((l) => (l.key === key ? withDate(l, field, value) : l)) ?? ls);
    },
    add() {
      setLegs((ls) => (ls && ls.length > 0 ? [...ls, blankLegAfter(ls[ls.length - 1])] : ls));
    },
    remove(key: number) {
      setLegs((ls) => (ls && ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
    },
  };
}

// The first problem with the legs, or null if they're ready to save.
export function validateLegs(legs: LegFields[], today: string): string | null {
  for (const leg of legs) {
    const name = leg.city || "each leg";
    const nights = Number(leg.nights);
    if (leg.nights.trim() === "" || !Number.isInteger(nights) || nights < 0) {
      return `Add how many nights you're in ${name}.`;
    }
    if (needsDatesForForecast(leg, today)) {
      return legs.length > 1
        ? `Add your exact dates for ${name} for a forecast.`
        : "Add your exact dates for a forecast.";
    }
    if (leg.start_date && leg.end_date && leg.end_date < leg.start_date) {
      return `The end date for ${name} is before the start date.`;
    }
  }
  return null;
}

// What the API expects for each leg.
export function legPayload(leg: LegFields) {
  return {
    id: leg.id,
    city: leg.city,
    country: leg.country,
    country_code: leg.country_code,
    location_key: leg.location_key,
    vibe: leg.vibe,
    month: leg.month,
    year: leg.year,
    start_date: leg.start_date || null,
    end_date: leg.end_date || null,
    nights: Number(leg.nights),
    timing: leg.timing,
    climate_summary: leg.climate_summary,
    climate_band: leg.climate_band,
  };
}

// Title plus one block of fields per leg, with "Add leg" and per-leg remove.
export function TripFields({
  title,
  onTitle,
  list,
}: {
  title: string;
  onTitle: (title: string) => void;
  list: ReturnType<typeof useLegList>;
}) {
  const legs = list.legs ?? [];
  const multi = legs.length > 1;
  return (
    <>
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          required
          className={inputClass}
        />
      </Field>

      {legs.map((leg) => (
        <LegBlock
          key={leg.key}
          leg={leg}
          multi={multi}
          onChange={(patch) => list.update(leg.key, patch)}
          onDate={(field, value) => list.setDate(leg.key, field, value)}
          onRemove={() => list.remove(leg.key)}
        />
      ))}

      <div>
        <button type="button" onClick={list.add} className="text-primary">
          Add leg
        </button>
      </div>
    </>
  );
}

function LegBlock({
  leg,
  multi,
  onChange,
  onDate,
  onRemove,
}: {
  leg: LegFields;
  multi: boolean;
  onChange: (patch: Partial<LegFields>) => void;
  onDate: (field: "start_date" | "end_date", value: string) => void;
  onRemove: () => void;
}) {
  // Only upcoming legs starting soon need exact dates; past ones never do.
  // Only rendered in the browser, after the trip details are known.
  const datesRequired = needsDatesForForecast(leg, localToday());

  return (
    <section className="flex flex-col gap-5">
      {multi && (
        <div className="flex items-center justify-between gap-3">
          <LegTag leg={leg} />
          <button type="button" onClick={onRemove} className="text-foreground">
            Remove
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City">
          <input
            value={leg.city}
            onChange={(e) => onChange({ city: e.target.value })}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Country">
          <input
            value={leg.country}
            onChange={(e) => onChange({ country: e.target.value, country_code: null })}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Vibe">
          <select
            value={leg.vibe}
            onChange={(e) => onChange({ vibe: e.target.value as Vibe })}
            className={inputClass}
          >
            {VIBES.map((v) => (
              <option key={v} value={v}>
                {sentenceCase(v)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Month">
          <select
            value={leg.month}
            onChange={(e) => onChange({ month: Number(e.target.value) })}
            className={inputClass}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input
            type="date"
            value={leg.start_date}
            onChange={(e) => onDate("start_date", e.target.value)}
            required={datesRequired}
            className={inputClass}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={leg.end_date}
            min={leg.start_date || undefined}
            onChange={(e) => onDate("end_date", e.target.value)}
            required={datesRequired}
            className={inputClass}
          />
        </Field>
        <Field label="Nights">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={leg.nights}
            onChange={(e) => onChange({ nights: e.target.value })}
            required
            className={inputClass}
          />
        </Field>
      </div>

      {datesRequired && (
        <p className="text-wished-foreground">Add your exact dates for a forecast</p>
      )}

      <p className="text-moss">
        {tripSummaryLine({
          month: leg.month,
          nights: leg.nights === "" ? null : Number(leg.nights),
          climate_summary: leg.climate_summary,
        })}
      </p>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-moss">{label}</span>
      {children}
    </label>
  );
}
