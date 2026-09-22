export default function ModuleLoading() {
  return (
    <div className="w-full animate-pulse space-y-6 pb-12">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-4">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded-md bg-ink-200/70" />
          <div className="h-4 w-80 rounded-md bg-ink-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-md bg-ink-200/50" />
        </div>
      </div>

      {/* Top Stat Cards Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-24 rounded-lg border border-ink-200/70 bg-white p-4 shadow-sm">
          <div className="h-3 w-24 rounded bg-ink-200/60" />
          <div className="mt-3 h-7 w-16 rounded bg-ink-200" />
        </div>
        <div className="h-24 rounded-lg border border-ink-200/70 bg-white p-4 shadow-sm">
          <div className="h-3 w-28 rounded bg-ink-200/60" />
          <div className="mt-3 h-7 w-16 rounded bg-ink-200" />
        </div>
        <div className="h-24 rounded-lg border border-ink-200/70 bg-white p-4 shadow-sm">
          <div className="h-3 w-32 rounded bg-ink-200/60" />
          <div className="mt-3 h-7 w-16 rounded bg-ink-200" />
        </div>
      </div>

      {/* Content Table / Card Skeleton */}
      <div className="rounded-lg border border-ink-200/70 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-ink-100 pb-4">
          <div className="h-4 w-36 rounded bg-ink-200/70" />
          <div className="h-8 w-48 rounded bg-ink-100" />
        </div>
        <div className="mt-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 border-b border-ink-50 last:border-0">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-ink-100 shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-44 rounded bg-ink-200/70" />
                  <div className="h-3 w-28 rounded bg-ink-100" />
                </div>
              </div>
              <div className="h-6 w-20 rounded-full bg-ink-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
