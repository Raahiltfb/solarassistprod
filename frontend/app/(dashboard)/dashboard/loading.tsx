export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" data-testid="dashboard-loading-skeleton">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded-lg" />
          <div className="h-4 w-96 bg-muted/60 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-32 bg-muted rounded-lg" />
          <div className="h-9 w-36 bg-muted rounded-lg" />
        </div>
      </div>

      {/* Fleet Status Banner Skeleton */}
      <div className="h-28 w-full bg-muted/40 rounded-2xl border" />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-card border rounded-xl" />
        ))}
      </div>

      {/* Two Column Grid for Needs Attention & Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80 bg-card border rounded-xl" />
        <div className="h-80 bg-card border rounded-xl" />
      </div>

      {/* Fleet Site Matrix Table Skeleton */}
      <div className="h-96 bg-card border rounded-xl" />
    </div>
  );
}
