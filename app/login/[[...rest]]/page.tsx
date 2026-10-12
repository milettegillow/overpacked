import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-6 pt-10">
      <h1 className="text-3xl font-medium tracking-tight">Log in</h1>
      <Suspense>
        <SignIn routing="path" path="/login" withSignUp />
      </Suspense>
    </div>
  );
}
