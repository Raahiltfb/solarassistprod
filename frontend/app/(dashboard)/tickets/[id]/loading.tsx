export default function TicketDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" data-testid="ticket-detail-loading-skeleton">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded-lg" />
          <div className="h-4 w-40 bg-muted/60 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-muted rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-64 bg-card border rounded-xl" />
          <div className="h-80 bg-card border rounded-xl" />
        </div>
        <div className="space-y-6">
          <div className="h-48 bg-card border rounded-xl" />
          <div className="h-64 bg-card border rounded-xl" />
        </div>
      </div>
    </div>
  );
}
