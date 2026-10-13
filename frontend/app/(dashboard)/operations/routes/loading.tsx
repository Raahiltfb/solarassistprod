export default function RoutePlannerLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" data-testid="route-planner-loading-skeleton">
      <div className="h-10 w-full bg-muted/30 rounded-lg" />
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded-lg" />
          <div className="h-4 w-96 bg-muted/60 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-40 bg-muted rounded-lg" />
          <div className="h-9 w-32 bg-muted rounded-lg" />
        </div>
      </div>

      <div className="h-20 bg-card border rounded-xl" />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted/30 border rounded-xl" />
        ))}
      </div>

      <div className="h-96 bg-card border rounded-xl" />
    </div>
  );
}
