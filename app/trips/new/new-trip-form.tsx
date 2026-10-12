"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { localToday, requestJson, stashListText } from "@/lib/client";
import { AutoGrowTextarea } from "@/app/ui/auto-grow-textarea";
import { inputClass, pillClass } from "@/app/ui/styles";
import {
  TripFields,
  fromExtracted,
  legPayload,
  useLegList,
  validateLegs,
  type ExtractedLeg,
} from "../leg-fields";

type Extraction = {
  title: string;
  legs: ExtractedLeg[];
  list_text: string | null;
};

// With Cache Components, Next keeps visited pages mounted (hidden by React's
// <Activity>), so form state would otherwise survive navigation. Keying on
// bfcacheId gives every fresh visit (the "New trip" button, any push or
// replace) a clean form, while browser back/forward still restores an unsaved
// draft.
export function NewTripForm() {
  const { bfcacheId } = useRouter();
  return <NewTripFormFields key={bfcacheId} />;
}

function NewTripFormFields() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const list = useLegList(null);
  const [listText, setListText] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Guards against a second submit before the disabled button re-renders.
  const savingRef = useRef(false);
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
      list.setLegs(result.legs.map(fromExtracted));
      setListText(result.list_text);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const legs = list.legs;
    if (!legs || savingRef.current) return;
    setError(null);
    const today = localToday();

    const problem = validateLegs(legs, today);
    if (problem) {
      setError(problem);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      // The server parses list_text into items; parsing a long list can take
      // a few seconds. If it fails, the list waits in the trip modal instead.
      const { id, list_saved } = await requestJson<{ id: string; list_saved: boolean }>(
        "/api/trips",
        { body: { title, raw_input: text, list_text: listText, legs: legs.map(legPayload), today } },
      );
      if (listText && !list_saved) stashListText(id, listText);
      router.push(`/?trip=${id}`);
      // Show the new trip on the home page, and drop the saved draft so the
      // hidden page holds nothing if it's restored later.
      router.refresh();
      setText("");
      setTitle("");
      list.setLegs(null);
      setListText(null);
      setError(null);
      setSaving(false);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleNext} className="flex flex-col gap-4">
        <AutoGrowTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your trip details and packing list"
          aria-label="Your trip"
          rows={10}
          required
          className={`${inputClass} resize-none overflow-hidden`}
        />
        <div>
          <button type="submit" disabled={extracting || !text.trim()} className={pillClass}>
            {extracting ? "Reading…" : "Next"}
          </button>
        </div>
      </form>

      {list.legs && (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <TripFields title={title} onTitle={setTitle} list={list} />
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
