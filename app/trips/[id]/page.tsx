import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getTripForUser } from "@/lib/trips";
import { tripSummaryLine } from "@/lib/trip-fields";

// Per-user and request-time: block on the lookup so a missing trip is a real 404.
export const instant = false;

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  const { userId } = await auth.protect();
  const trip = await getTripForUser(id, userId);
  if (!trip) notFound();

  return (
    <div className="flex flex-col gap-2 pt-6">
      <h1 className="text-3xl font-medium tracking-tight">{trip.city}</h1>
      <p className="text-moss">{tripSummaryLine(trip)}</p>
    </div>
  );
}
