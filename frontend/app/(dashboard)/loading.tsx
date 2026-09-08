export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-muted rounded-lg" />
        <div className="h-4 w-96 bg-muted/60 rounded-md" />
      </div>

      <div className="h-32 w-full bg-muted/40 rounded-2xl border" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-24 bg-card border rounded-xl" />
        <div className="h-24 bg-card border rounded-xl" />
        <div className="h-24 bg-card border rounded-xl" />
        <div className="h-24 bg-card border rounded-xl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-80 lg:col-span-2 bg-card border rounded-xl" />
        <div className="h-80 bg-card border rounded-xl" />
      </div>
    </div>
  );
}
