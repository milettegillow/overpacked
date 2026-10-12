"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  couldStartWithinForecastWindow,
  monthOf,
  nightsBetween,
} from "@/lib/dates";
import {
  MONTH_NAMES,
  VIBES,
  sentenceCase,
  tripSummaryLine,
  type ClimateBand,
  type Vibe,
} from "@/lib/trip-fields";

type Fields = {
  city: string;
  country: string;
  location_key: string | null;
  vibe: Vibe;
  month: number;
  start_date: string;
  end_date: string;
  nights: string;
  climate_summary: string | null;
  climate_band: ClimateBand | null;
};

type Extracted = Omit<Fields, "start_date" | "end_date" | "nights"> & {
  start_date: string | null;
  end_date: string | null;
  nights: number | null;
  forecast: boolean;
};

const inputClass =
  "w-full rounded-row bg-raised px-4 py-3 text-foreground placeholder:text-moss focus:outline-2 focus:outline-primary";
const pillClass =
  "rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground disabled:opacity-60";

// The browser's local date, so relative dates match the user's calendar.
function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Something went wrong. Try again.",
    );
  }
  return data as T;
}

export function NewTripForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [fields, setFields] = useState<Fields | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleNext(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExtracting(true);
    try {
      const trip = await postJson<Extracted>("/api/trips/extract", {
        text,
        today: localToday(),
      });
      setFields({
        city: trip.city,
        country: trip.country,
        location_key: trip.location_key,
        vibe: trip.vibe,
        month: trip.month,
        start_date: trip.start_date ?? "",
        end_date: trip.end_date ?? "",
        nights: trip.nights == null ? "" : String(trip.nights),
        climate_summary: trip.climate_summary,
        climate_band: trip.climate_band,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  function update(patch: Partial<Fields>) {
    setFields((f) => (f ? { ...f, ...patch } : f));
  }

  // Dates drive the month and the number of nights.
  function updateDate(key: "start_date" | "end_date", value: string) {
    if (!fields) return;
    const next = { ...fields, [key]: value };
    const nights = nightsBetween(next.start_date, next.end_date);
    if (nights != null) next.nights = String(nights);
    if (next.start_date) next.month = monthOf(next.start_date);
    setFields(next);
  }

  const datesRequired =
    fields != null &&
    couldStartWithinForecastWindow(
      fields.month,
      fields.start_date || null,
      localToday(),
    );
  const datesMissing = fields != null && (!fields.start_date || !fields.end_date);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!fields) return;
    setError(null);

    const nights = Number(fields.nights);
    if (fields.nights.trim() === "" || !Number.isInteger(nights) || nights < 0) {
      setError("Add how many nights you're away.");
      return;
    }
    if (datesRequired && datesMissing) {
      setError("Add your exact dates for a forecast.");
      return;
    }
    if (fields.start_date && fields.end_date && fields.end_date < fields.start_date) {
      setError("The end date is before the start date.");
      return;
    }

    setSaving(true);
    try {
      const { id } = await postJson<{ id: string }>("/api/trips", {
        ...fields,
        raw_input: text,
        start_date: fields.start_date || null,
        end_date: fields.end_date || null,
        nights,
        today: localToday(),
      });
      router.push(`/trips/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

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

      {fields && (
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City">
              <input
                value={fields.city}
                onChange={(e) => update({ city: e.target.value })}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Country">
              <input
                value={fields.country}
                onChange={(e) => update({ country: e.target.value })}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Vibe">
              <select
                value={fields.vibe}
                onChange={(e) => update({ vibe: e.target.value as Vibe })}
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
                value={fields.month}
                onChange={(e) => update({ month: Number(e.target.value) })}
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
                value={fields.start_date}
                onChange={(e) => updateDate("start_date", e.target.value)}
                required={datesRequired}
                className={inputClass}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={fields.end_date}
                min={fields.start_date || undefined}
                onChange={(e) => updateDate("end_date", e.target.value)}
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
                value={fields.nights}
                onChange={(e) => update({ nights: e.target.value })}
                required
                className={inputClass}
              />
            </Field>
          </div>

          {datesRequired && datesMissing && (
            <p className="text-wished-foreground">Add your exact dates for a forecast</p>
          )}

          <p className="text-moss">
            {tripSummaryLine({
              month: fields.month,
              nights: fields.nights === "" ? null : Number(fields.nights),
              climate_summary: fields.climate_summary,
            })}
          </p>

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-moss">{label}</span>
      {children}
    </label>
  );
}
