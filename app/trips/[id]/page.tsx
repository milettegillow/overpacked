import { redirect } from "next/navigation";

// Trips open as a modal on the home page.
export const instant = false;

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  redirect(`/?trip=${encodeURIComponent(id)}`);
}
