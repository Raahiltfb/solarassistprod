export default function DiagnosticsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2" data-testid="diagnostics-loading">
      {/* Top Header & Selector Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <div className="h-3 w-32 bg-muted/70 rounded" />
          <div className="h-8 w-72 bg-muted rounded-lg" />
          <div className="h-4 w-96 bg-muted/50 rounded" />
        </div>
        <div className="h-10 w-64 bg-muted/60 rounded-lg" />
      </div>

      {/* Site Health Overview Header Skeleton */}
      <div className="h-36 w-full bg-card border rounded-2xl p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted/70" />
          <div className="space-y-2">
            <div className="h-5 w-48 bg-muted rounded" />
            <div className="h-3 w-36 bg-muted/60 rounded" />
          </div>
        </div>
        <div className="hidden lg:grid grid-cols-4 gap-3 flex-1 max-w-lg bg-muted/30 p-3 rounded-xl border">
          <div className="h-10 bg-muted/60 rounded" />
          <div className="h-10 bg-muted/60 rounded" />
          <div className="h-10 bg-muted/60 rounded" />
          <div className="h-10 bg-muted/60 rounded" />
        </div>
        <div className="hidden xl:block w-72 h-16 bg-muted/40 rounded-xl border" />
      </div>

      {/* Tabs Skeleton */}
      <div className="h-10 w-96 bg-muted/50 rounded-lg" />

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-24 bg-card border rounded-xl" />
        <div className="h-24 bg-card border rounded-xl" />
        <div className="h-24 bg-card border rounded-xl" />
        <div className="h-24 bg-card border rounded-xl" />
      </div>

      {/* Table Skeleton */}
      <div className="h-64 bg-card border rounded-xl" />
    </div>
  );
}
