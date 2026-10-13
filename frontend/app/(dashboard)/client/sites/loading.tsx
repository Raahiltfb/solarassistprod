export default function ClientSitesLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" data-testid="client-sites-loading-skeleton">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-72 bg-muted/60 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 bg-card border rounded-xl" />
        ))}
      </div>
    </div>
  );
}
