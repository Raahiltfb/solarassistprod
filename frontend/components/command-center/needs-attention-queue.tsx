"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Wrench, Building2, Clock, ArrowRight, ShieldAlert, CheckCircle2, UserX } from "lucide-react";
import { Ticket, WorkOrder, Site, Alert } from "@/lib/types";

export interface ExtendedTicket extends Ticket {
  sites?: { name: string } | null;
  alerts?: { id: string; code: string; title: string } | null;
}

export interface ExtendedWorkOrder extends WorkOrder {
  sites?: { name: string } | null;
  profiles?: { full_name: string } | null;
}

export interface ExtendedSite extends Site {
  offlineInvertersCount?: number;
}

interface NeedsAttentionQueueProps {
  tickets: ExtendedTicket[];
  workOrders: ExtendedWorkOrder[];
  offlineSites: ExtendedSite[];
  alerts: Alert[];
}

export function NeedsAttentionQueue({
  tickets,
  workOrders,
  offlineSites,
  alerts,
}: NeedsAttentionQueueProps) {
  const [filter, setFilter] = useState<"all" | "p1" | "unassigned" | "offline">("all");

  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Identify Unassigned or Overdue Work Orders (Excluding draft or completed)
  const unassignedWorkOrders = workOrders.filter(
    (wo) => !wo.technician_id && wo.status !== "completed" && wo.status !== "cancelled"
  );

  const overdueWorkOrders = workOrders.filter(
    (wo) =>
      wo.scheduled_date &&
      wo.scheduled_date < todayStr &&
      wo.status !== "completed" &&
      wo.status !== "cancelled"
  );

  // 2. Map tickets as primary deduplicated incidents
  const p1Tickets = tickets.filter((t) => t.priority === "p1");

  // Deduplicated incidents array
  const incidents = [
    // Offline Sites
    ...offlineSites.map((site) => ({
      id: `site-${site.id}`,
      type: "site_offline" as const,
      siteName: site.name,
      siteId: site.id,
      title: `${site.name} Telemetry Disconnected`,
      subtitle: `${site.offlineInvertersCount || 1} inverter unit(s) offline or non-responsive`,
      severity: "critical" as const,
      timestamp: site.created_at,
      actionUrl: `/sites/${site.id}`,
      actionLabel: "Inspect Site",
      badgeText: "Site Offline",
      badgeVariant: "destructive" as const,
    })),

    // High Severity Open Tickets (P1 / P2)
    ...tickets
      .filter((t) => t.status !== "resolved" && t.status !== "closed")
      .map((ticket) => {
        // Find if work order already exists for this ticket
        const linkedWo = workOrders.find((wo) => wo.ticket_id === ticket.id);
        const linkedAlert = alerts.find((a) => a.id === ticket.alert_id);

        let subtitle = linkedAlert
          ? `Alert: ${linkedAlert.code} · ${linkedAlert.title}`
          : ticket.description || "Operational incident requires technician dispatch";
        if (linkedWo) {
          subtitle += ` · Work Order #${linkedWo.id.slice(0, 8)} (${linkedWo.status})`;
        }

        return {
          id: `ticket-${ticket.id}`,
          type: "ticket" as const,
          siteName: ticket.sites?.name || "Unknown Site",
          siteId: ticket.site_id,
          title: ticket.title,
          subtitle,
          severity: ticket.priority === "p1" ? ("critical" as const) : ("high" as const),
          priority: ticket.priority,
          timestamp: ticket.created_at,
          actionUrl: `/tickets?id=${ticket.id}`,
          actionLabel: linkedWo ? "View Incident" : "Create Work Order",
          badgeText: `Ticket ${ticket.priority.toUpperCase()}`,
          badgeVariant: ticket.priority === "p1" ? ("destructive" as const) : ("warning" as const),
        };
      }),

    // Unassigned Work Orders not already linked to an open ticket
    ...unassignedWorkOrders
      .filter((wo) => !tickets.some((t) => t.id === wo.ticket_id && t.status !== "resolved"))
      .map((wo) => ({
        id: `wo-unassigned-${wo.id}`,
        type: "unassigned_wo" as const,
        siteName: wo.sites?.name || "Unknown Site",
        siteId: wo.site_id,
        title: `Unassigned Work Order: ${wo.title}`,
        subtitle: `Scheduled for ${wo.scheduled_date || "TBD"} · Duration ~${wo.estimated_duration_mins}m`,
        severity: "medium" as const,
        timestamp: wo.created_at,
        actionUrl: `/work-orders?id=${wo.id}`,
        actionLabel: "Assign Technician",
        badgeText: "Unassigned WO",
        badgeVariant: "secondary" as const,
      })),

    // Overdue Work Orders
    ...overdueWorkOrders
      .filter(
        (wo) =>
          !unassignedWorkOrders.some((u) => u.id === wo.id) &&
          !tickets.some((t) => t.id === wo.ticket_id && t.status !== "resolved")
      )
      .map((wo) => ({
        id: `wo-overdue-${wo.id}`,
        type: "overdue_wo" as const,
        siteName: wo.sites?.name || "Unknown Site",
        siteId: wo.site_id,
        title: `Overdue Work Order: ${wo.title}`,
        subtitle: `Was scheduled for ${wo.scheduled_date} · Assigned to ${wo.profiles?.full_name || "Unassigned"}`,
        severity: "high" as const,
        timestamp: wo.created_at,
        actionUrl: `/work-orders?id=${wo.id}`,
        actionLabel: "Reschedule",
        badgeText: "Overdue WO",
        badgeVariant: "warning" as const,
      })),
  ];

  // Apply UI Filters
  const filteredIncidents = incidents.filter((item) => {
    if (filter === "p1") return item.severity === "critical";
    if (filter === "unassigned") return item.type === "unassigned_wo";
    if (filter === "offline") return item.type === "site_offline";
    return true;
  });

  return (
    <Card className="border shadow-sm" data-testid="needs-attention-queue">
      <CardHeader className="p-6 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg font-bold">Needs Attention Queue</CardTitle>
              <Badge variant={incidents.length > 0 ? "destructive" : "secondary"} className="font-mono">
                {incidents.length} Actionable {incidents.length === 1 ? "Item" : "Items"}
              </Badge>
            </div>
            <CardDescription className="text-sm">
              Deduplicated stream of open tickets, unassigned work orders, and offline site alerts requiring O&M action.
            </CardDescription>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg text-xs font-medium">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                filter === "all" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({incidents.length})
            </button>
            <button
              onClick={() => setFilter("p1")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                filter === "p1" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              P1 Critical ({p1Tickets.length + offlineSites.length})
            </button>
            <button
              onClick={() => setFilter("unassigned")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                filter === "unassigned" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Unassigned ({unassignedWorkOrders.length})
            </button>
            <button
              onClick={() => setFilter("offline")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                filter === "offline" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Offline ({offlineSites.length})
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 pt-0">
        {filteredIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-xl bg-muted/20">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-foreground">Zero Critical Incidents</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              All 35 operational sites and inverter equipment are communicating normally with no unassigned or overdue work orders.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredIncidents.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      item.severity === "critical"
                        ? "bg-destructive/15 text-destructive"
                        : item.severity === "high"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {item.type === "site_offline" ? (
                      <AlertCircle className="h-5 w-5" />
                    ) : item.type === "unassigned_wo" ? (
                      <UserX className="h-5 w-5" />
                    ) : item.type === "overdue_wo" ? (
                      <Clock className="h-5 w-5" />
                    ) : (
                      <Wrench className="h-5 w-5" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {item.siteName}
                      </span>
                      <Badge variant={item.badgeVariant} className="text-[10px] px-2 py-0">
                        {item.badgeText}
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-sm text-foreground leading-tight">{item.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className="text-[11px] font-mono text-muted-foreground hidden lg:inline">
                    {new Date(item.timestamp).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <Button asChild size="sm" variant="outline" className="text-xs h-8 gap-1">
                    <Link href={item.actionUrl}>
                      <span>{item.actionLabel}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
