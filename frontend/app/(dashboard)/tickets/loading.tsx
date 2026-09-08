export default function TicketsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-muted rounded-lg" />
          <div className="h-4 w-72 bg-muted/60 rounded-md" />
        </div>
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>

      <div className="h-96 w-full bg-card border rounded-xl" />
    </div>
  );
}
