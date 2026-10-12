"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { tripDateLine, type Leg, type TripCard } from "@/lib/trip-fields";
import { LegTag } from "./ui/leg-tag";
import { pillClass } from "./ui/styles";
import { TripModal } from "./trip-modal";

export function TripHub({ trips }: { trips: TripCard[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openTripId = searchParams.get("trip");
  // Whether the modal was opened from this page (so closing can go back).
  const openedHere = useRef(false);
  const [filter, setFilter] = useState<string | null>(null);

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

  const visible = filter
    ? trips.filter((t) => t.legs.some((l) => l.location_key === filter))
    : trips;

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
          {visible.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/?trip=${trip.id}`}
                scroll={false}
                onClick={() => {
                  openedHere.current = true;
                }}
                className="flex flex-col gap-2 rounded-[12px] bg-raised px-5 py-4 transition-colors hover:bg-[#46352a] focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="text-lg font-medium text-foreground">{trip.title}</span>
                {trip.legs.length > 0 && (
                  <span className="flex flex-wrap gap-2">
                    {trip.legs.map((leg) => (
                      <LegTag key={leg.id} leg={leg} />
                    ))}
                  </span>
                )}
                {tripDateLine(trip.legs) && (
                  <span className="text-moss">{tripDateLine(trip.legs)}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {openTripId && (
        <TripModal
          key={openTripId}
          tripId={openTripId}
          onClose={closeModal}
          onDeleted={afterDelete}
        />
      )}
    </div>
  );
}
