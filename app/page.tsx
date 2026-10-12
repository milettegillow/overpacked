import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

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

// Rendered per request for the signed-in user. Trips will load here.
async function Trips() {
  await auth.protect();

  return (
    <div>
      <Link
        href="/trips/new"
        className="inline-block rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground"
      >
        New trip
      </Link>
    </div>
  );
}
