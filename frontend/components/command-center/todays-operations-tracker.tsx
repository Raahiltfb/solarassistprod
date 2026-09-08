"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, CheckCircle2, Clock, MapPin, ArrowRight, UserCheck, Navigation } from "lucide-react";
import { DailyRoute, RouteStop, WorkOrder, Profile } from "@/lib/types";

export interface ExtendedRouteStop extends RouteStop {
  work_orders?: WorkOrder & { sites?: { name: string } | null } | null;
}

export interface ExtendedDailyRoute extends DailyRoute {
  profiles?: Profile | null;
  route_stops?: ExtendedRouteStop[];
}

interface TodaysOperationsTrackerProps {
  dailyRoutes: ExtendedDailyRoute[];
  technicians: Profile[];
  todayWorkOrders: WorkOrder[];
}

export function TodaysOperationsTracker({
  dailyRoutes,
  technicians,
  todayWorkOrders,
}: TodaysOperationsTrackerProps) {
  // CRITICAL: Filter out draft and cancelled work orders for today's operational stats
  const activeTodayWorkOrders = todayWorkOrders.filter(
    (wo) => wo.status !== "draft" && wo.status !== "cancelled"
  );

  const completedJobsCount = activeTodayWorkOrders.filter((wo) => wo.status === "completed").length;
  const inProgressJobsCount = activeTodayWorkOrders.filter(
    (wo) => wo.status === "in_progress" || wo.status === "en_route"
  ).length;
  const remainingScheduledCount = activeTodayWorkOrders.filter((wo) => wo.status === "scheduled").length;

  const totalActiveJobs = activeTodayWorkOrders.length;
  const completionPercentage = totalActiveJobs > 0 ? Math.round((completedJobsCount / totalActiveJobs) * 100) : 0;

  const scheduledTechsCount = dailyRoutes.length;

  return (
    <Card className="border shadow-sm" data-testid="todays-operations-tracker">
      <CardHeader className="p-6 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-bold">Today's Field Operations & Route Tracker</CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                {scheduledTechsCount} / {technicians.length || 8} Technicians Dispatched
              </Badge>
            </div>
            <CardDescription className="text-sm">
              Real-time route execution and technician work order progress across the operational fleet.
            </CardDescription>
          </div>

          <Button asChild size="sm" variant="default" className="text-xs h-8 gap-1.5">
            <Link href="/routes">
              <Navigation className="h-3.5 w-3.5" />
              <span>Optimize & Dispatch Routes</span>
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-6 pt-0 space-y-6">
        {/* Fleet Progress Summary Bar */}
        <div className="bg-muted/40 border p-4 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-muted-foreground">Total Scheduled Jobs:</span>{" "}
                <strong className="font-mono text-foreground font-bold">{totalActiveJobs}</strong>
              </div>
              <div className="h-3 w-px bg-border" />
              <div>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Completed:</span>{" "}
                <strong className="font-mono text-foreground">{completedJobsCount}</strong>
              </div>
              <div className="h-3 w-px bg-border" />
              <div>
                <span className="text-amber-600 dark:text-amber-400 font-medium">In Progress / En Route:</span>{" "}
                <strong className="font-mono text-foreground">{inProgressJobsCount}</strong>
              </div>
              <div className="h-3 w-px bg-border" />
              <div>
                <span className="text-muted-foreground">Scheduled Remaining:</span>{" "}
                <strong className="font-mono text-foreground">{remainingScheduledCount}</strong>
              </div>
            </div>

            <div className="font-mono font-bold text-xs text-primary">{completionPercentage}% Completed</div>
          </div>

          <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${completionPercentage}%` }} />
          </div>
        </div>

        {/* Individual Technician Route Cards */}
        {dailyRoutes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-xl bg-muted/20">
            <UserCheck className="h-8 w-8 text-muted-foreground mb-2" />
            <h4 className="font-semibold text-sm text-foreground">No Routes Dispatched Today</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              All 8 technician test accounts are available. Create work orders and dispatch daily optimized routes.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3 text-xs">
              <Link href="/routes">Create Today's Routes</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dailyRoutes.map((route) => {
              const techName = route.profiles?.full_name || "Technician (Test)";
              const baseLoc = route.profiles?.base_address || "Mumbai Metropolitan Region";
              const stops = route.route_stops || [];
              const totalStops = stops.length;
              
              const completedStops = stops.filter(
                (s) => s.work_orders?.status === "completed"
              ).length;
              const inProgressStop = stops.find(
                (s) => s.work_orders?.status === "in_progress" || s.work_orders?.status === "en_route"
              );

              let statusVariant: "success" | "warning" | "secondary" | "outline" = "secondary";
              let statusLabel = "Scheduled";

              if (route.status === "completed" || (totalStops > 0 && completedStops === totalStops)) {
                statusVariant = "success";
                statusLabel = "Completed";
              } else if (inProgressStop) {
                statusVariant = "warning";
                statusLabel = inProgressStop.work_orders?.status === "en_route" ? "En Route" : "On Site";
              }

              return (
                <div
                  key={route.id}
                  className="p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {techName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-foreground leading-tight">{techName}</h4>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{baseLoc}</span>
                        </div>
                      </div>
                    </div>

                    <Badge variant={statusVariant} className="text-[10px] px-2 py-0.5 shrink-0">
                      {statusLabel}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs border-t pt-2.5">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>
                        Route Stops: <strong className="text-foreground">{completedStops} / {totalStops} Done</strong>
                      </span>
                      <span className="font-mono text-[11px]">
                        {route.total_distance_km ? `${route.total_distance_km.toFixed(1)} km` : "OSRM Route"}
                      </span>
                    </div>

                    {/* Current Active Work Order preview if any */}
                    {inProgressStop && (
                      <div className="flex items-center gap-2 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 p-2 rounded-lg font-medium">
                        <Clock className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                        <span className="truncate">
                          Current: {inProgressStop.work_orders?.sites?.name || "Site"} ({inProgressStop.work_orders?.title})
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <Button asChild size="sm" variant="ghost" className="text-xs h-7 gap-1 text-primary">
                      <Link href={`/routes?id=${route.id}`}>
                        <span>View Technician Route</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
