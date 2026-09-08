export default function WorkOrdersLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-80 bg-muted/60 rounded-md" />
        </div>
        <div className="h-9 w-36 bg-muted rounded-lg" />
      </div>

      <div className="h-12 w-full bg-muted/30 border rounded-xl" />
      <div className="h-96 w-full bg-card border rounded-xl" />
    </div>
  );
}
