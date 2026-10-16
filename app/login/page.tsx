import { Suspense } from "react";
import { LoginFlow } from "./login-flow";

// One combined flow: new and returning people just enter their email.
export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-8 pt-10">
      <h1 className="text-center text-[32px] leading-tight font-medium text-foreground">
        Pack less, forget nothing
      </h1>
      <div className="w-full">
        <Suspense>
          <LoginFlow />
        </Suspense>
      </div>
    </div>
  );
}
