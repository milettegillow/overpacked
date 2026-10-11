export default function Home() {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <h1 className="text-3xl font-medium tracking-tight">Your trips</h1>
      <div>
        <button
          type="button"
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          New trip
        </button>
      </div>
    </div>
  );
}
