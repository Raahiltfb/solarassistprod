import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: LucideIcon;
  accent?: "primary" | "success" | "warning" | "destructive";
}) {
  const tint = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  }[accent ?? "primary"];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
            <div className="text-2xl font-display font-semibold tracking-tight">{value}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          {Icon && (
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", tint)}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
