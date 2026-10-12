import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { tripSummaryLine } from "@/lib/trip-fields";
import { listTripsForUser } from "@/lib/trips";

export default function Home() {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <h1 className="text-3xl font-medium tracking-tight">Your trips</h1>
      <Suspense>
        <Trips />
      </Suspense>
    </div>
  );
}

// Rendered per request for the signed-in user.
async function Trips() {
  const { userId } = await auth.protect();
  const trips = await listTripsForUser(userId);

  return (
    <div className="flex flex-col gap-6">
      {trips.length > 0 && (
        <ul className="flex flex-col gap-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/trips/${trip.id}`}
                className="block rounded-[12px] bg-raised px-5 py-4 transition-colors hover:bg-[#46352a] focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="block text-lg font-medium text-foreground">
                  {trip.city}
                </span>
                <span className="block text-moss">{tripSummaryLine(trip)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Link
          href="/trips/new"
          className="inline-block rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          New trip
        </Link>
      </div>
    </div>
  );
}
