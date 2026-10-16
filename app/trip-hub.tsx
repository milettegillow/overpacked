"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { tripDateLine, type Leg, type TripCard } from "@/lib/trip-fields";
import { LegTag } from "./ui/leg-tag";
import { pillClass } from "./ui/styles";
import { TripModal } from "./trip-modal";

// One card per single-leg trip, or one per leg of a multi-leg trip.
type Card = { key: string; trip: TripCard; leg: Leg | null; sortDate: string };

function tripUrl(tripId: string, legId: string | null): string {
  return legId ? `/?trip=${tripId}&leg=${legId}` : `/?trip=${tripId}`;
}

export function TripHub({ trips }: { trips: TripCard[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openTripId = searchParams.get("trip");
  const openLegId = searchParams.get("leg");
  // Whether the modal was opened from this page (so closing can go back).
  const openedHere = useRef(false);
  const [filter, setFilter] = useState<string | null>(null);

  // Each card sorts by its own leg's start date (the trip's first leg for
  // single-leg trips), falling back to when the trip was added.
  const cards = useMemo(() => {
    const out: Card[] = [];
    for (const trip of trips) {
      const added = trip.created_at.slice(0, 10);
      if (trip.legs.length > 1) {
        for (const leg of trip.legs) {
          out.push({ key: leg.id, trip, leg, sortDate: leg.start_date ?? added });
        }
      } else {
        out.push({ key: trip.id, trip, leg: null, sortDate: trip.legs[0]?.start_date ?? added });
      }
    }
    return out.sort(
      (a, b) =>
        b.sortDate.localeCompare(a.sortDate) ||
        b.trip.created_at.localeCompare(a.trip.created_at) ||
        (a.leg?.position ?? 0) - (b.leg?.position ?? 0),
    );
  }, [trips]);

  // One tag per place, using the first leg seen there.
  const locations = useMemo(() => {
    const seen = new Map<string, Leg>();
    for (const trip of trips) {
      for (const leg of trip.legs) {
        if (leg.location_key && !seen.has(leg.location_key)) seen.set(leg.location_key, leg);
      }
    }
    return [...seen.entries()];
  }, [trips]);

  // Filters match the leg on the card, not the whole trip.
  const visible = filter
    ? cards.filter((c) => (c.leg ? [c.leg] : c.trip.legs).some((l) => l.location_key === filter))
    : cards;

  function closeModal() {
    if (openedHere.current) {
      openedHere.current = false;
      router.back();
    } else {
      router.replace("/", { scroll: false });
    }
  }

  function afterDelete() {
    openedHere.current = false;
    router.replace("/", { scroll: false });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/trips/new" className={pillClass}>
          New trip
        </Link>
      </div>

      {locations.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by place">
          {locations.map(([key, leg]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter((f) => (f === key ? null : key))}
            >
              <LegTag leg={leg} selected={filter === key} />
            </button>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visible.map(({ key, trip, leg }) => {
            const tagLegs = leg ? [leg] : trip.legs;
            const line = tripDateLine(tagLegs);
            return (
              <li key={key}>
                <Link
                  href={tripUrl(trip.id, leg?.id ?? null)}
                  scroll={false}
                  onClick={() => {
                    openedHere.current = true;
                  }}
                  className="flex flex-col gap-2 rounded-[12px] bg-raised px-5 py-4 transition-colors hover:bg-[#46352a] focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="text-lg font-medium text-foreground">{trip.title}</span>
                  {tagLegs.length > 0 && (
                    <span className="flex flex-wrap gap-2">
                      {tagLegs.map((l) => (
                        <LegTag key={l.id} leg={l} />
                      ))}
                    </span>
                  )}
                  {line && <span className="text-moss">{line}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {openTripId && (
        <TripModal
          key={openTripId}
          tripId={openTripId}
          legId={openLegId}
          // Switching views swaps the URL in place: no reload, no history entry.
          onSelectLeg={(legId) => router.replace(tripUrl(openTripId, legId), { scroll: false })}
          onClose={closeModal}
          onDeleted={afterDelete}
        />
      )}
    </div>
  );
}
