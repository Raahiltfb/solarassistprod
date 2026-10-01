"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Wrench, Building2, Clock, ArrowRight, ShieldAlert, CheckCircle2, UserX, AlertTriangle, RefreshCw } from "lucide-react";
import { Ticket, WorkOrder, Site, Alert } from "@/lib/types";
import { parseUtcDate } from "@/lib/status-utils";
import { AutomationSandboxModal } from "./automation-sandbox-modal";

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

export interface ExtendedAlert extends Alert {
  sites?: { name: string } | null;
}

interface NeedsAttentionQueueProps {
  tickets: ExtendedTicket[];
  workOrders: ExtendedWorkOrder[];
  offlineSites: ExtendedSite[];
  alerts: ExtendedAlert[];
  latestSyncRun?: { status?: string; error_message?: string; completed_at?: string } | null;
}

function formatUnresolvedDuration(timestampStr?: string | null): string {
  if (!timestampStr) return "duration unknown";
  const date = parseUtcDate(timestampStr);
  if (!date) return "duration unknown";
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) {
    return `${diffMins}m unresolved`;
  }
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    const remMins = diffMins % 60;
    return `${diffHours}h ${remMins}m unresolved`;
  }
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  return `${diffDays}d ${remHours}h unresolved`;
}

export function NeedsAttentionQueue({
  tickets,
  workOrders,
  offlineSites,
  alerts,
  latestSyncRun,
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

  // 2. Identify open / acknowledged alerts that don't have an open ticket linked yet
  const unresolvedAlertsWithoutTicket = alerts.filter(
    (a) =>
      (a.status === "open" || a.status === "acknowledged") &&
      !tickets.some((t) => t.alert_id === a.id && t.status !== "resolved" && t.status !== "closed")
  );

  // Deduplicated incidents array
  const incidents = [
    // OEM Polling / Sync Failure alert
    ...(latestSyncRun?.status === "failed"
      ? [
        {
          id: "sync-failure",
          type: "sync_failure" as const,
          siteName: "OEM API Daemon",
          siteId: "system",
          title: "OEM Telemetry Synchronization Failure",
          subtitle: `Polling failed: ${latestSyncRun.error_message || "API connection timeout"}`,
          actionExplanation: "TELEMETRY POLLING FAILURE — OEM API connection timeout. Automatic daemon retry active.",
          severity: "critical" as const,
          timestamp: latestSyncRun.completed_at || new Date().toISOString(),
          actionUrl: "/alerts",
          actionLabel: "Inspect Sync Logs",
          badgeText: "OEM Poll Failed",
          badgeVariant: "destructive" as const,
        },
      ]
      : []),

    // Offline & Partially Disconnected Sites/Inverters
    ...offlineSites.map((site) => {
      const isPartial = (site as any).isPartialOutage;
      const offlineCount = (site as any).offlineInvertersCount || 1;
      const totalCount = (site as any).totalInvertersCount || 1;

      return {
        id: `site-${site.id}`,
        type: "site_offline" as const,
        siteName: site.name,
        siteId: site.id,
        title: isPartial
          ? `${site.name} — Partial Outage (${offlineCount} of ${totalCount} Inverters Offline)`
          : `${site.name} — Total Site Telemetry Disconnected`,
        subtitle: isPartial
          ? `${offlineCount} inverter unit(s) offline · Immediate partial power generation loss`
          : `All ${totalCount} inverters offline or non-responsive · Total site power outage`,
        actionExplanation: isPartial
          ? `PARTIAL INVERTER DISCONNECTION DETECTED — Telemetry confirmed ${offlineCount} of ${totalCount} inverters offline. P1 Emergency Ticket & Urgent Dispatch initialized.`
          : `TOTAL SITE OUTAGE — All ${totalCount} inverters non-responsive. Telemetry disconnection alert & site inspection dispatch queued.`,
        severity: "critical" as const,
        timestamp: site.created_at,
        actionUrl: `/sites/${site.id}`,
        actionLabel: isPartial ? "Inspect Disconnected Inverters" : "Inspect Offline Site",
        badgeText: isPartial ? "PARTIAL OUTAGE" : "SITE OFFLINE",
        badgeVariant: "destructive" as const,
      };
    }),

    // High Severity Open Tickets (P1 / P2)
    ...tickets
      .filter((t) => t.status !== "resolved" && t.status !== "closed")
      .map((ticket) => {
        const linkedWo = workOrders.find((wo) => wo.ticket_id === ticket.id);
        const linkedAlert = alerts.find((a) => a.id === ticket.alert_id);

        let subtitle = linkedAlert
          ? `Alert: ${linkedAlert.code} · ${linkedAlert.title}`
          : ticket.description || "Operational incident requires technician dispatch";
        subtitle += ` · ${formatUnresolvedDuration(ticket.created_at)}`;
        if (linkedWo) {
          subtitle += ` · Job #${linkedWo.id.slice(0, 8)} (${linkedWo.status})`;
        }

        const decisionClass = (ticket as any).action_decision_class || (ticket.priority === "p1" ? "DISPATCH_IMMEDIATELY" : ticket.priority === "p2" ? "SCHEDULE" : "INVESTIGATE");

        let actionExplanation = "Automated ticket created. Awaiting coordinator review.";
        if (decisionClass === "DISPATCH_IMMEDIATELY") {
          actionExplanation = linkedWo?.profiles?.full_name
            ? `DISPATCH IMMEDIATELY (95% Confidence) — Created P1 Urgent Ticket & assigned field job to ${linkedWo.profiles.full_name}.`
            : "DISPATCH IMMEDIATELY (95% Confidence) — Created P1 Urgent Ticket & field job dispatch initialized.";
        } else if (decisionClass === "SCHEDULE") {
          actionExplanation = linkedWo?.profiles?.full_name
            ? `SCHEDULED DISPATCH (85% Confidence) — Created P2 Ticket & scheduled field job for ${linkedWo.profiles.full_name}.`
            : "SCHEDULED DISPATCH (85% Confidence) — Created P2 Ticket & queued maintenance job into routine daily route window.";
        } else if (decisionClass === "INVESTIGATE") {
          actionExplanation = "HUMAN REVIEW REQUIRED (70% Confidence) — Telemetry ambiguity detected. Ticket created; awaiting admin review before technician dispatch.";
        } else if (decisionClass === "ESCALATE") {
          actionExplanation = "RECURRING FAULT - ESCALATED — 3+ repeat faults in 7 days. Mandatory senior engineering review required.";
        }

        return {
          id: `ticket-${ticket.id}`,
          type: "ticket" as const,
          siteName: ticket.sites?.name || "Unknown Site",
          siteId: ticket.site_id,
          title: ticket.title,
          subtitle,
          actionExplanation,
          severity: ticket.priority === "p1" ? ("critical" as const) : ("high" as const),
          priority: ticket.priority,
          timestamp: ticket.created_at,
          actionUrl: `/tickets/${ticket.id}`,
          actionLabel: linkedWo ? "View Incident" : "Create Service Request",
          badgeText: `${decisionClass.replace("_", " ")}`,
          badgeVariant: decisionClass === "DISPATCH_IMMEDIATELY" ? ("destructive" as const) : decisionClass === "SCHEDULE" ? ("warning" as const) : ("secondary" as const),
        };
      }),

    // Unresolved OEM Alerts not yet linked to an open ticket
    ...unresolvedAlertsWithoutTicket.map((alert) => {
      let subtitle = `Code: ${alert.code} · ${formatUnresolvedDuration(alert.triggered_at)}`;
      if (alert.requires_technician) {
        subtitle += " · Tech Action Required";
      }

      const actionExplanation = alert.severity === "critical"
        ? "DISPATCH IMMEDIATELY — Critical fault code detected. Automated P1 ticket & job creation queued."
        : "HUMAN REVIEW REQUIRED — Telemetry anomaly detected. System awaiting admin review.";

      return {
        id: `alert-${alert.id}`,
        type: "alert" as const,
        siteName: alert.sites?.name || "Unknown Site",
        siteId: alert.site_id,
        title: alert.title,
        subtitle,
        actionExplanation,
        severity: alert.severity === "critical" ? ("critical" as const) : alert.severity === "high" ? ("high" as const) : ("medium" as const),
        timestamp: alert.triggered_at,
        actionUrl: alert.ticket_id ? `/tickets/${alert.ticket_id}` : "/alerts",
        actionLabel: alert.ticket_id ? "View Ticket" : "View Alert",
        badgeText: `Alert ${alert.severity.toUpperCase()}`,
        badgeVariant: alert.severity === "critical" ? ("destructive" as const) : alert.severity === "high" ? ("warning" as const) : ("secondary" as const),
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
        title: `Unassigned Task: ${wo.title}`,
        subtitle: `Scheduled for ${wo.scheduled_date || "TBD"} · Duration ~${wo.estimated_duration_mins}m · ${formatUnresolvedDuration(wo.created_at)}`,
        actionExplanation: "FIELD TASK UNASSIGNED — Service request created. Technician assignment pending.",
        severity: "medium" as const,
        timestamp: wo.created_at,
        actionUrl: `/service-requests/${wo.id}`,
        actionLabel: "Assign Technician",
        badgeText: "Unassigned Task",
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
        title: `Overdue Task: ${wo.title}`,
        subtitle: `Was scheduled for ${wo.scheduled_date} · Assigned to ${wo.profiles?.full_name || "Unassigned"} · ${formatUnresolvedDuration(wo.created_at)}`,
        actionExplanation: "OVERDUE FIELD TASK — Task past scheduled target date. Reschedule or reassign technician.",
        severity: "high" as const,
        timestamp: wo.created_at,
        actionUrl: `/service-requests/${wo.id}`,
        actionLabel: "Reschedule",
        badgeText: "Overdue Task",
        badgeVariant: "warning" as const,
      })),
  ];

  const criticalCount = incidents.filter((i) => i.severity === "critical").length;

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
              Deduplicated operational queue surfacing unresolved alerts, offline sites, unassigned jobs, and polling errors.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <AutomationSandboxModal sites={offlineSites.map((s) => ({ id: s.id, name: s.name }))} />

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg text-xs font-medium">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 rounded-md transition-colors ${filter === "all" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                All ({incidents.length})
              </button>
              <button
                onClick={() => setFilter("p1")}
                className={`px-3 py-1.5 rounded-md transition-colors ${filter === "p1" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Critical ({criticalCount})
              </button>
              <button
                onClick={() => setFilter("unassigned")}
                className={`px-3 py-1.5 rounded-md transition-colors ${filter === "unassigned" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Unassigned ({unassignedWorkOrders.length})
              </button>
              <button
                onClick={() => setFilter("offline")}
                className={`px-3 py-1.5 rounded-md transition-colors ${filter === "offline" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Offline ({offlineSites.length})
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 pt-0">
        {filteredIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-xl bg-muted/20">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-foreground">Zero Critical Operational Issues</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              All fleet sites are communicating normally with no unhandled alerts, unassigned jobs, or overdue service requests.
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
                    className={`mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${item.severity === "critical"
                        ? "bg-destructive/15 text-destructive"
                        : item.severity === "high"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-primary/10 text-primary"
                      }`}
                  >
                    {item.type === "site_offline" ? (
                      <AlertCircle className="h-5 w-5" />
                    ) : item.type === "sync_failure" ? (
                      <RefreshCw className="h-5 w-5" />
                    ) : item.type === "alert" ? (
                      <AlertTriangle className="h-5 w-5" />
                    ) : item.type === "unassigned_wo" ? (
                      <UserX className="h-5 w-5" />
                    ) : item.type === "overdue_wo" ? (
                      <Clock className="h-5 w-5" />
                    ) : (
                      <Wrench className="h-5 w-5" />
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {item.siteName}
                      </span>
                      <Badge variant={item.badgeVariant} className="text-[10px] px-2 py-0 font-bold uppercase">
                        {item.badgeText}
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-sm text-foreground leading-tight">{item.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.subtitle}</p>

                    {/* System Action Explanation Box */}
                    {item.actionExplanation && (
                      <div className="mt-2 text-[11px] bg-muted/40 border rounded-md px-2.5 py-1.5 flex items-start gap-1.5 font-medium text-foreground/90">
                        <span className="text-primary font-bold shrink-0">System Action:</span>
                        <span className="leading-snug">{item.actionExplanation}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className="text-[11px] font-mono text-muted-foreground hidden lg:inline">
                    {parseUtcDate(item.timestamp)?.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    }) || item.timestamp}
                  </span>
                  <Button
                    asChild
                    size="sm"
                    variant={item.severity === "critical" ? "destructive" : item.severity === "high" ? "default" : "outline"}
                    className="text-xs h-8 gap-1.5 font-semibold shadow-sm"
                  >
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
