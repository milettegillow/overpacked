"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { localToday, requestJson, stashListText } from "@/lib/client";
import {
  monthOf,
  needsDatesForForecast,
  nightsBetween,
  type Timing,
} from "@/lib/dates";
import {
  MONTH_NAMES,
  VIBES,
  sentenceCase,
  tripSummaryLine,
  type ClimateBand,
  type Vibe,
} from "@/lib/trip-fields";
import { LegTag } from "@/app/ui/leg-tag";
import { inputClass, pillClass } from "@/app/ui/styles";

type LegFields = {
  key: number;
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

type ExtractedLeg = Omit<LegFields, "key" | "start_date" | "end_date" | "nights"> & {
  start_date: string | null;
  end_date: string | null;
  nights: number | null;
};

type Extraction = {
  title: string;
  legs: ExtractedLeg[];
  list_text: string | null;
};

let nextKey = 1;

function toFields(leg: ExtractedLeg): LegFields {
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

export function NewTripForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [legs, setLegs] = useState<LegFields[] | null>(null);
  const [listText, setListText] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleNext(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExtracting(true);
    try {
      const result = await requestJson<Extraction>("/api/trips/extract", {
        body: { text, today: localToday() },
      });
      setTitle(result.title);
      setLegs(result.legs.map(toFields));
      setListText(result.list_text);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  function updateLeg(key: number, patch: Partial<LegFields>) {
    setLegs((ls) => ls?.map((l) => (l.key === key ? { ...l, ...patch } : l)) ?? ls);
  }

  // Dates drive the month and the number of nights.
  function updateDate(leg: LegFields, field: "start_date" | "end_date", value: string) {
    const next = { ...leg, [field]: value };
    const nights = nightsBetween(next.start_date, next.end_date);
    if (nights != null) next.nights = String(nights);
    if (next.start_date) {
      next.month = monthOf(next.start_date);
      next.year = Number(next.start_date.slice(0, 4));
    }
    updateLeg(leg.key, next);
  }

  function addLeg() {
    setLegs((ls) => (ls && ls.length > 0 ? [...ls, blankLegAfter(ls[ls.length - 1])] : ls));
  }

  function removeLeg(key: number) {
    setLegs((ls) => (ls && ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!legs) return;
    setError(null);
    const today = localToday();

    for (const leg of legs) {
      const name = leg.city || "each leg";
      const nights = Number(leg.nights);
      if (leg.nights.trim() === "" || !Number.isInteger(nights) || nights < 0) {
        setError(`Add how many nights you're in ${name}.`);
        return;
      }
      if (needsDatesForForecast(leg, today)) {
        setError(
          legs.length > 1
            ? `Add your exact dates for ${name} for a forecast.`
            : "Add your exact dates for a forecast.",
        );
        return;
      }
      if (leg.start_date && leg.end_date && leg.end_date < leg.start_date) {
        setError(`The end date for ${name} is before the start date.`);
        return;
      }
    }

    setSaving(true);
    try {
      const { id } = await requestJson<{ id: string }>("/api/trips", {
        body: {
          title,
          raw_input: text,
          legs: legs.map((leg) => ({
            ...leg,
            key: undefined,
            start_date: leg.start_date || null,
            end_date: leg.end_date || null,
            nights: Number(leg.nights),
          })),
          today,
        },
      });
      if (listText) stashListText(id, listText);
      router.push(`/?trip=${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const multi = (legs?.length ?? 0) > 1;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleNext} className="flex flex-col gap-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cabin in Cavan, last week of October"
          aria-label="Your trip"
          rows={3}
          required
          className={`${inputClass} resize-y`}
        />
        <div>
          <button type="submit" disabled={extracting || !text.trim()} className={pillClass}>
            {extracting ? "Reading…" : "Next"}
          </button>
        </div>
      </form>

      {legs && (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={inputClass}
            />
          </Field>

          {legs.map((leg) => (
            <LegBlock
              key={leg.key}
              leg={leg}
              multi={multi}
              onChange={(patch) => updateLeg(leg.key, patch)}
              onDate={(field, value) => updateDate(leg, field, value)}
              onRemove={() => removeLeg(leg.key)}
            />
          ))}

          <div>
            <button type="button" onClick={addLeg} className="text-primary">
              Add leg
            </button>
          </div>

          <div>
            <button type="submit" disabled={saving} className={pillClass}>
              {saving ? "Saving…" : "Save trip"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-unneeded-foreground">
          {error}
        </p>
      )}
    </div>
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
  // Only rendered after extraction, in the browser.
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-moss">{label}</span>
      {children}
    </label>
  );
}
