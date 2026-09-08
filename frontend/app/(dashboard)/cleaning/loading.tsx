export default function CleaningLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-80 bg-muted/60 rounded-md" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-44 bg-muted rounded-lg" />
          <div className="h-9 w-36 bg-muted rounded-lg" />
        </div>
      </div>

      <div className="h-10 w-64 bg-muted/40 rounded-lg" />
      <div className="h-96 w-full bg-card border rounded-xl" />
    </div>
  );
}
