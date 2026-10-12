import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { listTripsForUser } from "@/lib/trips";
import { TripHub } from "./trip-hub";

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
  return <TripHub trips={trips} />;
}
