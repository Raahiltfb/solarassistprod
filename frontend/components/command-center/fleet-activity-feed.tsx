"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Wrench, CheckCircle2, Activity, ArrowRight, ShieldAlert } from "lucide-react";
import { Alert, Ticket, WorkOrder, CleaningLog } from "@/lib/types";

export interface ExtendedAlert extends Alert {
  sites?: { name: string } | null;
}

export interface ExtendedTicketFeed extends Ticket {
  sites?: { name: string } | null;
}

export interface ExtendedWorkOrderFeed extends WorkOrder {
  sites?: { name: string } | null;
  profiles?: { full_name: string } | null;
}

export interface ExtendedCleaningLogFeed extends CleaningLog {
  sites?: { name: string } | null;
}

interface FleetActivityFeedProps {
  alerts: ExtendedAlert[];
  tickets: ExtendedTicketFeed[];
  workOrders: ExtendedWorkOrderFeed[];
  cleaningLogs: ExtendedCleaningLogFeed[];
}

export function FleetActivityFeed({
  alerts,
  tickets,
  workOrders,
  cleaningLogs,
}: FleetActivityFeedProps) {
  // Combine all items into a unified timeline sorted descending by timestamp
  const events = [
    ...alerts.map((a) => ({
      id: `alert-${a.id}`,
      type: "alert" as const,
      timestamp: new Date(a.triggered_at).getTime(),
      timestampStr: a.triggered_at,
      siteName: a.sites?.name || "Site",
      title: `Alert Triggered: ${a.code}`,
      description: a.title,
      severity: a.severity,
      icon: ShieldAlert,
      link: `/alerts`,
    })),

    ...tickets.map((t) => ({
      id: `ticket-${t.id}`,
      type: "ticket" as const,
      timestamp: new Date(t.created_at).getTime(),
      timestampStr: t.created_at,
      siteName: t.sites?.name || "Site",
      title: `Incident Ticket Created (${t.priority.toUpperCase()})`,
      description: t.title,
      status: t.status,
      icon: AlertCircle,
      link: `/tickets?id=${t.id}`,
    })),

    ...workOrders.map((wo) => ({
      id: `wo-${wo.id}`,
      type: "work_order" as const,
      timestamp: new Date(wo.created_at).getTime(),
      timestampStr: wo.created_at,
      siteName: wo.sites?.name || "Site",
      title: `Work Order ${wo.status === "completed" ? "Completed" : "Scheduled"}`,
      description: `${wo.title} (${wo.type}) ${wo.profiles?.full_name ? `· Tech: ${wo.profiles.full_name}` : ""}`,
      status: wo.status,
      icon: Wrench,
      link: `/work-orders?id=${wo.id}`,
    })),

    ...cleaningLogs.map((cl) => ({
      id: `cleaning-${cl.id}`,
      type: "cleaning" as const,
      timestamp: new Date(cl.performed_at).getTime(),
      timestampStr: cl.performed_at,
      siteName: cl.sites?.name || "Site",
      title: "Solar Panel Cleaning Completed",
      description: cl.remarks || "Modules cleaned and verified with before/after evidence photos.",
      icon: CheckCircle2,
      link: `/cleaning`,
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  return (
    <Card className="border shadow-sm" data-testid="fleet-activity-feed">
      <CardHeader className="p-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-bold">Fleet Activity & Operational Feed</CardTitle>
            </div>
            <CardDescription className="text-sm">
              Unified real-time audit log of telemetry events, incident tickets, dispatches, and cleanings.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 pt-0">
        {events.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No recent operational activity recorded.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {events.map((event) => {
              const Icon = event.icon;

              return (
                <div key={event.id} className="relative flex items-start gap-3 text-xs">
                  {/* Timeline Node Badge */}
                  <div
                    className={`absolute -left-6 top-0.5 h-5 w-5 rounded-full border flex items-center justify-center bg-background shrink-0 ${
                      event.type === "alert"
                        ? "text-destructive border-destructive/40"
                        : event.type === "ticket"
                        ? "text-amber-600 border-amber-500/40"
                        : event.type === "cleaning"
                        ? "text-emerald-600 border-emerald-500/40"
                        : "text-primary border-primary/40"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                  </div>

                  <div className="flex-1 space-y-0.5 bg-muted/20 p-2.5 rounded-lg border">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="text-foreground font-semibold">{event.title}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {event.siteName}
                        </Badge>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                        {new Date(event.timestampStr).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <p className="text-muted-foreground text-xs leading-relaxed">{event.description}</p>
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
