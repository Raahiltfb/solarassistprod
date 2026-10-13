export default function InverterDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" data-testid="inverter-detail-loading-skeleton">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-80 bg-muted rounded-lg" />
          <div className="h-4 w-56 bg-muted/60 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-muted rounded-lg" />
          <div className="h-9 w-28 bg-muted rounded-lg" />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-card border rounded-xl" />
        ))}
      </div>

      {/* Main Diagnostic Chart Skeleton */}
      <div className="h-80 bg-card border rounded-xl" />

      {/* String Telemetry Matrix Skeleton */}
      <div className="h-64 bg-card border rounded-xl" />
    </div>
  );
}
