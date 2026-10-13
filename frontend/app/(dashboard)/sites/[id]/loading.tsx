export default function SiteDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" data-testid="site-detail-loading-skeleton">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-72 bg-muted rounded-lg" />
          <div className="h-4 w-48 bg-muted/60 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-muted rounded-lg" />
          <div className="h-9 w-32 bg-muted rounded-lg" />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-card border rounded-xl" />
        ))}
      </div>

      {/* Performance Chart Skeleton */}
      <div className="h-80 bg-card border rounded-xl" />

      {/* Inverters & Strings Table Skeleton */}
      <div className="h-72 bg-card border rounded-xl" />
    </div>
  );
}
