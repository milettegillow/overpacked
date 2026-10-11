import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
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
    <html lang="en-GB" className={`${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="pt-5 pb-4">
          <div className="mx-auto w-full max-w-[640px] px-4">
            <span className="text-xl font-medium tracking-tight">
              overpacked
            </span>
          </div>
          <div className="mt-4 px-4">
            <FairyLights />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[640px] flex-1 px-4 pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}
