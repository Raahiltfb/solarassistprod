export default function FleetOverviewLoading() {
  return (
    <div className="space-y-8 pb-12 animate-pulse p-2" data-testid="fleet-overview-loading">
      {/* Header Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-80 bg-muted rounded-lg" />
          <div className="h-4 w-96 bg-muted/60 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-36 bg-muted/60 rounded-full" />
          <div className="h-7 w-40 bg-muted/60 rounded-full" />
        </div>
      </div>

      {/* KPI Section 1 */}
      <div className="space-y-3">
        <div className="h-4 w-48 bg-muted/70 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-card border rounded-xl" />
          <div className="h-28 bg-card border rounded-xl" />
          <div className="h-28 bg-card border rounded-xl" />
          <div className="h-28 bg-card border rounded-xl" />
        </div>
      </div>

      {/* KPI Section 2 */}
      <div className="space-y-3">
        <div className="h-4 w-56 bg-muted/70 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-card border rounded-xl" />
          <div className="h-28 bg-card border rounded-xl" />
          <div className="h-28 bg-card border rounded-xl" />
          <div className="h-28 bg-card border rounded-xl" />
        </div>
      </div>

      {/* Analytics Chart Skeleton */}
      <div className="h-80 bg-card border rounded-xl p-5" />
    </div>
  );
}
