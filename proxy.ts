import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/login(.*)"]);

// /login and /login/verify are public. auth.protect() sends signed-out
// visitors to signInUrl; without it the middleware falls back to Clerk's
// hosted sign-in page (ClerkProvider's props only apply in the browser).
export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
      return;
    }
    // Already signed in: skip the login page (the verify page stays reachable).
    if (req.nextUrl.pathname === "/login" && (await auth()).userId) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  },
  { signInUrl: "/login", signUpUrl: "/login" },
);

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
