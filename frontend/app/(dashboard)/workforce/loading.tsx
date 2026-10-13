export default function WorkforceLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" data-testid="workforce-loading-skeleton">
      <div className="h-10 w-full bg-muted/30 rounded-lg" />
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-60 bg-muted rounded-lg" />
          <div className="h-4 w-80 bg-muted/60 rounded-md" />
        </div>
        <div className="h-9 w-36 bg-muted rounded-lg" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-card border rounded-xl" />
        ))}
      </div>

      <div className="h-96 bg-card border rounded-xl" />
    </div>
  );
}
