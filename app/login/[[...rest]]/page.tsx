import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

// One combined flow: new and returning people just enter their email.
export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-8 pt-10">
      <h1 className="text-center text-[32px] leading-tight font-medium text-foreground">
        Pack less, forget nothing
      </h1>
      <div className="w-full">
        <Suspense>
          {/* After the link is opened, this tab notices and continues to the app. */}
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/login"
            withSignUp
            fallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/"
          />
        </Suspense>
      </div>
    </div>
  );
}
