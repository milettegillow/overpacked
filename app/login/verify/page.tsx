import { Suspense } from "react";
import { VerifyLink } from "./verify-link";

// Where the emailed link lands.
export default function VerifyPage() {
  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col items-center pt-10">
      <Suspense>
        <VerifyLink />
      </Suspense>
    </div>
  );
}
