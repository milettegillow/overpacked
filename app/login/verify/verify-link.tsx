"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { EmailLinkErrorCodeStatus, isEmailLinkError } from "@clerk/nextjs/errors";
import { pillClass } from "@/app/ui/styles";

type Outcome = "checking" | "elsewhere" | "expired" | "failed";

export function VerifyLink() {
  const clerk = useClerk();
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>("checking");
  const started = useRef(false);

  useEffect(() => {
    if (!clerk.loaded || started.current) return;
    started.current = true;
    clerk
      .handleEmailLinkVerification(
        {
          // Completed here: straight into the app.
          redirectUrlComplete: "/",
          redirectUrl: "/",
          // Completed in the tab (or device) that asked for the link.
          onVerifiedOnOtherDevice: () => setOutcome("elsewhere"),
        },
        (to) => Promise.resolve(router.push(to)),
      )
      .catch((err: unknown) => {
        console.error("Email link verification failed", err);
        setOutcome(
          err instanceof Error &&
            isEmailLinkError(err) &&
            err.code === EmailLinkErrorCodeStatus.Expired
            ? "expired"
            : "failed",
        );
      });
  }, [clerk, clerk.loaded, router]);

  if (outcome === "checking") {
    return (
      <div role="status" aria-label="Logging you in" className="pt-6">
        <span className="block size-6 animate-spin rounded-full border-2 border-moss border-t-transparent" />
      </div>
    );
  }

  if (outcome === "elsewhere") {
    return (
      <Message
        title="You're logged in"
        body="Head back to your other tab, or close this one"
        action={{ href: "/", label: "Go to my trips" }}
      />
    );
  }

  return (
    <Message
      title={outcome === "expired" ? "That link's expired" : "Something went wrong with that link"}
      action={{ href: "/login", label: "Send a new one" }}
    />
  );
}

function Message({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-medium text-foreground">{title}</h1>
      {body && <p className="text-foreground">{body}</p>}
      <Link href={action.href} className={`${pillClass} mt-2`}>
        {action.label}
      </Link>
    </div>
  );
}
