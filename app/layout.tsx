import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { ClerkProvider, Show, SignOutButton } from "@clerk/nextjs";
import { FairyLights } from "./fairy-lights";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "overpacked",
  description: "Log your trips, build a packing list and look back on what you used.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider
      signInUrl="/login"
      signUpUrl="/login"
      afterSignOutUrl="/login"
    >
      <html lang="en-GB" className={`${bricolage.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col font-sans">
          <FairyLights />
          <header className="pt-5 pb-4">
            <div className="mx-auto flex w-full max-w-[640px] items-center justify-between px-4">
              <Link href="/" className="text-2xl font-medium tracking-tight">
                overpacked
              </Link>
              <Suspense>
                <Show when="signed-in">
                  <SignOutButton>
                    <button type="button" className="text-foreground">
                      Log out
                    </button>
                  </SignOutButton>
                </Show>
              </Suspense>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[640px] flex-1 px-4 pb-12">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
