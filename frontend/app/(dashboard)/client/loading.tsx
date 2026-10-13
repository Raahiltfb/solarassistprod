export default function ClientPortfolioLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" data-testid="client-portfolio-loading-skeleton">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded-lg" />
          <div className="h-4 w-96 bg-muted/60 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-card border rounded-xl" />
        ))}
      </div>

      <div className="h-80 bg-card border rounded-xl" />
      <div className="h-72 bg-card border rounded-xl" />
    </div>
  );
}
