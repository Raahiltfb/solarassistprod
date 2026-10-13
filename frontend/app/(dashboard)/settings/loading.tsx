export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2" data-testid="settings-loading">
      <div className="h-9 w-64 bg-muted/60 rounded-lg" />
      <div className="space-y-2">
        <div className="h-8 w-56 bg-muted rounded-lg" />
        <div className="h-4 w-72 bg-muted/60 rounded" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 bg-card border rounded-xl" />
        <div className="h-64 bg-card border rounded-xl" />
      </div>
    </div>
  );
}
