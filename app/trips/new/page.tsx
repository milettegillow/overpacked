import { NewTripForm } from "./new-trip-form";

export default function NewTripPage() {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <h1 className="text-3xl font-medium tracking-tight">New trip</h1>
      <NewTripForm />
    </div>
  );
}
