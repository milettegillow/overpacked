import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isIsoDate, todayIso } from "@/lib/dates";
import { ExtractError, extractTrip } from "@/lib/extract";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  let body: { text?: unknown; today?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read the request." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  // The browser's local date, so "next weekend" means the user's next weekend.
  const today = isIsoDate(body.today) ? body.today : todayIso();

  try {
    return NextResponse.json(await extractTrip(text, today));
  } catch (err) {
    if (err instanceof ExtractError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
