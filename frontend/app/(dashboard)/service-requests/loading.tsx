export default function ServiceRequestsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2" data-testid="service-requests-loading">
      <div className="h-9 w-64 bg-muted/60 rounded-lg" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-72 bg-muted rounded-lg" />
          <div className="h-4 w-96 bg-muted/60 rounded" />
        </div>
        <div className="h-10 w-44 bg-muted/60 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-card border rounded-xl" />
        ))}
      </div>

      <div className="h-80 bg-card border rounded-xl" />
    </div>
  );
}
