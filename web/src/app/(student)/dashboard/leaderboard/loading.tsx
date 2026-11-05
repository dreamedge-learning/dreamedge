export default function LeaderboardLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-12 lg:px-8">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />

      <div className="mt-6 grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="h-11 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-11 animate-pulse rounded-xl border border-border bg-card" />
      </div>

      <div className="mt-6 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="h-3 w-1/5 rounded bg-muted" />
            </div>
            <div className="h-6 w-14 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
