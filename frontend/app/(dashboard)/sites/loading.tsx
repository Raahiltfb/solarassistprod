export default function SitesLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2">
      <div className="space-y-2">
        <div className="h-8 w-40 bg-muted rounded-lg" />
        <div className="h-4 w-72 bg-muted/60 rounded-md" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="h-64 bg-card border rounded-xl" />
        <div className="h-64 bg-card border rounded-xl" />
        <div className="h-64 bg-card border rounded-xl" />
        <div className="h-64 bg-card border rounded-xl" />
        <div className="h-64 bg-card border rounded-xl" />
        <div className="h-64 bg-card border rounded-xl" />
      </div>
    </div>
  );
}
