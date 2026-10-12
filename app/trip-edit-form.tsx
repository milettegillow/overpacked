"use client";

import { useState, type FormEvent } from "react";
import { localToday, requestJson } from "@/lib/client";
import type { TripDetail } from "@/lib/trip-fields";
import { TripFields, fromLeg, legPayload, useLegList, validateLegs } from "./trips/leg-fields";
import { pillClass } from "./ui/styles";

// Edits the trip's title and legs in place of the modal header.
export function TripEditForm({
  trip,
  onCancel,
  onSaved,
}: {
  trip: TripDetail;
  onCancel: () => void;
  onSaved: (trip: TripDetail) => void;
}) {
  const [title, setTitle] = useState(trip.title);
  // Only mounted in the browser, once the trip has loaded.
  const list = useLegList(trip.legs.map((leg) => fromLeg(leg, localToday())));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const legs = list.legs ?? [];
    const today = localToday();
    const problem = validateLegs(legs, today);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await requestJson<TripDetail>(`/api/trips/${trip.id}`, {
        method: "PATCH",
        body: { title, legs: legs.map(legPayload), today },
      });
      onSaved(updated);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6 pt-10">
      <TripFields title={title} onTitle={setTitle} list={list} />
      {error && (
        <p role="alert" className="text-unneeded-foreground">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-5">
        <button type="submit" disabled={saving} className={pillClass}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
