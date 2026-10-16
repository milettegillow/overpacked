"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { inputClass, pillClass } from "@/app/ui/styles";

type Stage = "start" | "waiting";

// Clerk's own wording for the first problem, else a plain fallback.
function clerkMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    // Clerk calls a mistyped address an "invalid identifier".
    if (first?.code?.includes("invalid") && /identifier|email/i.test(first.meta?.paramName ?? "")) {
      return "That doesn't look like an email address";
    }
    return first?.longMessage || first?.message || "Couldn't send your link - try again";
  }
  return err instanceof Error ? err.message : "Couldn't send your link - try again";
}

function isUnknownAccount(err: unknown): boolean {
  return (
    isClerkAPIResponseError(err) &&
    err.errors.some((e) => e.code === "form_identifier_not_found")
  );
}

export function LoginFlow() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const signInHook = useSignIn();
  const signUpHook = useSignUp();
  const loaded = signInHook.isLoaded && signUpHook.isLoaded;

  const [stage, setStage] = useState<Stage>("start");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  // Stops the current link's polling (used on resend, change of email, unmount).
  const cancelFlow = useRef<(() => void) | null>(null);
  // Bumped per attempt so a cancelled attempt can't move the screen on.
  const attempt = useRef(0);

  useEffect(() => () => cancelFlow.current?.(), []);

  // Opening the link in another tab of this browser signs this one in too.
  useEffect(() => {
    if (stage === "waiting" && isSignedIn) router.push("/");
  }, [stage, isSignedIn, router]);

  // Sends the link and waits (Clerk polls) until it's opened. Returns when the
  // link is used or the flow is cancelled; throws if sending fails.
  async function sendAndWait(address: string, id: number) {
    if (!signInHook.isLoaded || !signUpHook.isLoaded) return;
    const { signIn, setActive } = signInHook;
    const { signUp } = signUpHook;
    const verifyUrl = `${window.location.origin}/login/verify`;

    let sessionId: string | null = null;
    let expired = false;
    try {
      const attemptIn = await signIn.create({ identifier: address });
      const factor = attemptIn.supportedFirstFactors?.find((f) => f.strategy === "email_link");
      if (!factor || !("emailAddressId" in factor)) {
        throw new Error("Email links aren't switched on for sign-in.");
      }
      const flow = attemptIn.createEmailLinkFlow();
      cancelFlow.current = flow.cancelEmailLinkFlow;
      const result = await flow.startEmailLinkFlow({
        emailAddressId: factor.emailAddressId,
        redirectUrl: verifyUrl,
      });
      expired = result.firstFactorVerification.status === "expired";
      if (result.status === "complete") sessionId = result.createdSessionId;
    } catch (err) {
      if (!isUnknownAccount(err)) throw err;
      // New here: same link, same screens, via sign-up.
      await signUp.create({ emailAddress: address });
      const flow = signUp.createEmailLinkFlow();
      cancelFlow.current = flow.cancelEmailLinkFlow;
      const result = await flow.startEmailLinkFlow({ redirectUrl: verifyUrl });
      expired = result.verifications.emailAddress.status === "expired";
      if (result.status === "complete") sessionId = result.createdSessionId;
    }

    if (id !== attempt.current) return; // superseded by a resend or new email
    if (expired) {
      setStage("start");
      setError("That link's expired - send a new one");
      return;
    }
    // This tab moves on by itself once the link is opened anywhere.
    if (sessionId) {
      await setActive({ session: sessionId });
      router.push("/");
    }
  }

  async function begin(address: string) {
    cancelFlow.current?.();
    const id = ++attempt.current;
    try {
      await sendAndWait(address, id);
    } catch (err) {
      if (id !== attempt.current) return;
      console.error("Sending the sign-in link failed", err);
      setStage("start");
      setError(clerkMessage(err));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address || !loaded) return;
    setError(null);
    // Straight to the waiting screen; the link goes out in the background.
    setStage("waiting");
    void begin(address);
  }

  async function resend() {
    setResending(true);
    setError(null);
    void begin(email.trim());
    // Give the new request a moment before re-enabling the button.
    setTimeout(() => setResending(false), 2000);
  }

  function useDifferentEmail() {
    cancelFlow.current?.();
    attempt.current++;
    setError(null);
    setStage("start");
  }

  if (stage === "waiting") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-medium text-foreground">Check your email</h2>
        <p className="text-foreground">
          We&apos;ve sent a link to <span className="font-medium break-all">{email.trim()}</span>.
          If it&apos;s not in your inbox, check your junk folder.
        </p>
        <div className="flex flex-col items-center gap-3 pt-2">
          <button type="button" onClick={resend} disabled={resending} className="text-moss">
            {resending ? "Sending…" : "Send it again"}
          </button>
          <button type="button" onClick={useDifferentEmail} className="text-foreground">
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-foreground">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>
      {error && (
        <p role="alert" className="text-unneeded-foreground">
          {error}
        </p>
      )}
      <button type="submit" disabled={!loaded || !email.trim()} className={`${pillClass} w-full`}>
        Send link
      </button>
    </form>
  );
}
