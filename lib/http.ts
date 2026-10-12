import { NextResponse } from "next/server";

export function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

// Logs the real error; shows it on the page only in development.
export function errorResponse(action: string, err: unknown) {
  console.error(`${action}:`, err);
  const detail =
    process.env.NODE_ENV === "development" && err instanceof Error
      ? `${action}: ${err.message}`
      : `${action}. Try again in a moment.`;
  return fail(detail, 500);
}
