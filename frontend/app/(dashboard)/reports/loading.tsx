export default function ReportsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2" data-testid="reports-loading">
      <div className="space-y-2">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-4 w-80 bg-muted/60 rounded" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-24 bg-card border rounded-xl" />
        <div className="h-24 bg-card border rounded-xl" />
        <div className="h-24 bg-card border rounded-xl" />
      </div>

      <div className="h-96 bg-card border rounded-xl" />
    </div>
  );
}
