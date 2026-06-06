export function SlotGridSkeleton() {
  return (
    <div className="space-y-5">
      {["Morning", "Afternoon", "Evening"].map((period) => (
        <div key={period}>
          <div className="h-3 w-16 bg-gray-200 rounded-full animate-pulse mb-3" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 rounded-xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
