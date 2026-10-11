// A string of small fairy lights across the header. Enough dots to span any
// realistic width; the overflow is clipped by the container.
const COUNT = 80;

export function FairyLights() {
  return (
    <div
      aria-hidden="true"
      className="flex h-[7px] w-full justify-between gap-3 overflow-hidden"
    >
      {Array.from({ length: COUNT }, (_, i) => (
        <span
          key={i}
          className={`fairy-light size-[7px] shrink-0 rounded-full ${
            i % 2 === 0 ? "bg-light-a" : "bg-light-b"
          }`}
          style={{ animationDelay: `${((i * 7) % 12) * 0.3}s` }}
        />
      ))}
    </div>
  );
}
