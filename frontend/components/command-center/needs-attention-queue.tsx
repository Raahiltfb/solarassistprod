"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, Wrench, Building2, Clock, ArrowRight, ShieldAlert, CheckCircle2, UserX, AlertTriangle, RefreshCw, Globe, Plus, Wifi } from "lucide-react";
import { Ticket, WorkOrder, Site, Alert } from "@/lib/types";
import { parseUtcDate } from "@/lib/status-utils";
import { AutomationSandboxModal } from "./automation-sandbox-modal";

export interface ExtendedTicket extends Ticket {
  sites?: { name: string } | null;
  alerts?: { id: string; code: string; title: string } | null;
  ticket_type?: string | null;
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

const INTERNET_ALARM_RE = /internet|network|communicat|wi-?fi|datalogger|gprs|lan\b|1D4C2/i;

function isConnectivityTicket(t: ExtendedTicket) {
  return (
    t.ticket_type === "connectivity" ||
    !!t.title?.includes("[Internet/WiFi Down]") ||
    !!t.description?.includes("[Root Cause Classification]: INTERNET OUTAGE")
  );
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function NeedsAttentionQueue({
  tickets,
  workOrders,
  offlineSites,
  alerts,
  latestSyncRun,
}: NeedsAttentionQueueProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "p1" | "unassigned" | "offline">("all");
  const [acknowledgedInternetSites, setAcknowledgedInternetSites] = useState<Set<string>>(new Set());
  const [submittingSiteId, setSubmittingSiteId] = useState<string | null>(null);
  const [undoneSites, setUndoneSites] = useState<Set<string>>(new Set());

  // A sync run only counts as "failing" if it genuinely errored (skipped overlap runs are filtered server-side)
  const isSyncFailing = latestSyncRun?.status === "failed";
  const istHour = (new Date().getUTCHours() + 5 + (new Date().getUTCMinutes() + 30 >= 60 ? 1 : 0)) % 24;
  const isNightIST = istHour < 6 || istHour >= 19;

  async function handleUndoInternet(siteId: string, siteName: string, ticketId: string | null) {
    setSubmittingSiteId(siteId);
    try {
      const res = await fetch("/api/tickets/internet-ack", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, ticket_id: ticketId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to undo");
      } else {
        setAcknowledgedInternetSites((prev) => {
          const n = new Set(prev);
          n.delete(siteId);
          return n;
        });
        setUndoneSites((prev) => new Set([...prev, siteId]));
        toast.success(`${siteName}: internet label removed. Site will be re-evaluated.`);
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err?.message || "Server error");
    } finally {
      setSubmittingSiteId(null);
    }
  }

  // Ticket creation modal states
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [targetSite, setTargetSite] = useState<{ id: string; name: string } | null>(null);
  const [ticketForm, setTicketForm] = useState({
    title: "",
    rootCause: "internet_outage",
    priority: "p4",
    description: "",
    dispatchTechnician: false,
  });
  const [savingTicket, setSavingTicket] = useState(false);

  function openCreateTicketModal(siteId: string, siteName: string, defaultCause = "internet_outage") {
    setTargetSite({ id: siteId, name: siteName });
    setTicketForm({
      title: defaultCause === "internet_outage"
        ? `[Internet/WiFi Down] ${siteName} Datalogger Disconnected`
        : `[Inverter Disconnection] ${siteName}`,
      rootCause: defaultCause,
      priority: defaultCause === "internet_outage" ? "p4" : "p1",
      description: defaultCause === "internet_outage"
        ? `Local WiFi/router disconnection observed. Inverter operating locally without internet gateway. Customer scope.`
        : `Inverter telemetry heartbeat ceased. Potential hardware trip, DC isolation, or grid disconnect.`,
      dispatchTechnician: defaultCause !== "internet_outage",
    });
    setCreateTicketOpen(true);
  }

  async function handleQuickMarkInternet(siteId: string, siteName: string) {
    setSubmittingSiteId(siteId);
    try {
      const res = await fetch("/api/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          title: `[Internet/WiFi Down] ${siteName} Gateway Disconnected`,
          description: `Customer router/datalogger disconnection. Classified as internet issue (Client Scope). Non-emergency inverter operational scope.`,
          priority: "p4",
          root_cause: "internet_outage",
          dispatch_technician: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to mark internet issue");
      } else {
        setAcknowledgedInternetSites((prev) => new Set([...prev, siteId]));
        setUndoneSites((prev) => {
          const n = new Set(prev);
          n.delete(siteId);
          return n;
        });
        toast.success(`Marked ${siteName} as Internet Issue (Client Scope). P1 alerts suppressed.`);
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err?.message || "Server error");
    } finally {
      setSubmittingSiteId(null);
    }
  }

  async function handleCreateTicketSubmit() {
    if (!targetSite || !ticketForm.title) {
      return toast.error("Please enter a ticket title");
    }

    setSavingTicket(true);
    try {
      const res = await fetch("/api/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: targetSite.id,
          title: ticketForm.title,
          description: ticketForm.description,
          priority: ticketForm.priority,
          root_cause: ticketForm.rootCause,
          dispatch_technician: ticketForm.dispatchTechnician,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create ticket");
      } else {
        toast.success(data.message || "Ticket successfully created!");
        if (ticketForm.rootCause === "internet_outage") {
          setAcknowledgedInternetSites((prev) => new Set([...prev, targetSite.id]));
          setUndoneSites((prev) => {
            const n = new Set(prev);
            n.delete(targetSite.id);
            return n;
          });
        }
        setCreateTicketOpen(false);
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err?.message || "Server error creating ticket");
    } finally {
      setSavingTicket(false);
    }
  }

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
    // Verification Failed Tickets (Reopened post-repair)
    ...tickets
      .filter((t) => (t as any).verification_status === "verification_failed" || (t as any).reopened_count > 0)
      .map((t) => ({
        id: `failed-verification-${t.id}`,
        type: "verification_failed" as const,
        siteName: t.sites?.name || "Site",
        siteId: t.site_id,
        title: `REPAIR VERIFICATION FAILED: ${t.title}`,
        subtitle: `Technician marked repair completed but post-repair telemetry shows fault persists · Reopened ${(t as any).reopened_count || 1}x`,
        actionExplanation: `TELEMETRY VERIFICATION FAILED — Post-repair string telemetry measured below peer baseline. Ticket reopened & escalated to ${t.priority.toUpperCase()}.`,
        severity: "critical" as const,
        timestamp: (t as any).reopened_at || (t as any).updated_at || t.created_at,
        actionUrl: `/tickets/${t.id}`,
        actionLabel: "Inspect Verification Failure",
        badgeText: "VERIFICATION FAILED",
        badgeVariant: "destructive" as const,
      })),

    // OEM Polling / Sync Failure alert (only genuine API failures — skipped overlap runs are ignored upstream)
    ...(isSyncFailing
      ? [
        {
          id: "sync-failure",
          type: "sync_failure" as const,
          siteName: "OEM API Daemon",
          siteId: "system",
          title: "OEM Telemetry Synchronization Failure",
          subtitle: `Polling failed: ${latestSyncRun?.error_message || "API connection timeout"}`,
          actionExplanation: "TELEMETRY POLLING FAILURE — Solis Cloud API did not respond. Next scheduled poll retries automatically (every 15 min). Offline sites below are NOT escalated while sync is failing.",
          severity: "high" as const,
          timestamp: latestSyncRun?.completed_at || new Date().toISOString(),
          actionUrl: "",
          actionLabel: "",
          badgeText: "OEM Poll Failed",
          badgeVariant: "warning" as const,
          hideAction: true,
        },
      ]
      : []),

    // Offline & Partially Disconnected Sites/Inverters — auto-classified root cause
    ...offlineSites.map((site) => {
      const isPartial = (site as any).isPartialOutage;
      const offlineCount = (site as any).offlineInvertersCount || 1;
      const totalCount = (site as any).totalInvertersCount || 1;

      const openSiteTickets = tickets.filter(
        (t) => t.site_id === site.id && t.status !== "resolved" && t.status !== "closed"
      );
      const connectivityTicket = openSiteTickets.find(isConnectivityTicket);
      const otherTicket = openSiteTickets.find((t) => !isConnectivityTicket(t));
      const linkedWo = otherTicket ? workOrders.find((wo) => wo.ticket_id === otherTicket.id) : undefined;

      // OEM-reported internet/communication alarm for this site
      const internetAlarm = alerts.find(
        (a) =>
          a.site_id === site.id &&
          (a.status === "open" || a.status === "acknowledged") &&
          INTERNET_ALARM_RE.test(`${a.code} ${a.title} ${a.alarm_code || ""}`)
      );

      const ticketStatus = otherTicket
        ? `Ticket ${otherTicket.priority.toUpperCase()} open${linkedWo ? ` · Job ${linkedWo.status}${linkedWo.profiles?.full_name ? ` → ${linkedWo.profiles.full_name}` : " (unassigned)"}` : " · no technician dispatched"}`
        : "No ticket raised (site-offline events are not auto-ticketed)";

      const base = {
        id: `site-${site.id}`,
        type: "site_offline" as const,
        siteName: site.name,
        siteId: site.id,
        timestamp: site.created_at,
        actionUrl: otherTicket ? `/tickets/${otherTicket.id}` : `/sites/${site.id}`,
        actionLabel: otherTicket ? "View Ticket" : "View Site",
        ticketStatus,
        hasTicket: !!otherTicket,
        connectivityTicketId: connectivityTicket?.id || null,
      };

      // 1. Human-confirmed internet outage (persisted as a connectivity ticket in DB)
      if ((connectivityTicket && !undoneSites.has(site.id)) || acknowledgedInternetSites.has(site.id)) {
        return {
          ...base,
          rootCause: "internet_confirmed" as const,
          title: `${site.name} — Internet / Datalogger Offline`,
          subtitle: `Marked as client-side connectivity issue · Out of O&M scope · No alerts or dispatch will be raised`,
          actionExplanation: `SUPPRESSED — Root cause confirmed as router/WiFi outage. Auto-clears when the datalogger reconnects. Use "Undo" if this was wrong.`,
          severity: "low" as const,
          timestamp: connectivityTicket?.created_at || site.created_at,
          badgeText: "INTERNET (CONFIRMED)",
          badgeVariant: "secondary" as const,
        };
      }

      // 2. Our polling is failing — data is stale for everyone, not a site problem
      if (isSyncFailing) {
        return {
          ...base,
          rootCause: "sync" as const,
          title: `${site.name} — Data stale (OEM sync failing)`,
          subtitle: `Solis Cloud API not responding. Inverters may be generating normally. Will re-evaluate after next successful poll.`,
          actionExplanation: `AUTO-CLASSIFIED: API SYNC — no action needed, no ticket raised.`,
          severity: "low" as const,
          badgeText: "API SYNC",
          badgeVariant: "secondary" as const,
        };
      }

      // 3. Inverter itself reported an internet / communication loss alarm
      if (internetAlarm) {
        return {
          ...base,
          rootCause: "internet_auto" as const,
          title: `${site.name} — Internet / Datalogger Offline`,
          subtitle: `OEM alarm "${internetAlarm.title}" (${internetAlarm.code}) · Client-side connectivity`,
          actionExplanation: `AUTO-CLASSIFIED: INTERNET — inverter reported loss of network. No P1 escalation. Notify client to restore router/WiFi.`,
          severity: "low" as const,
          badgeText: "INTERNET (AUTO)",
          badgeVariant: "secondary" as const,
        };
      }

      // 4. Night-time: inverters sleep after sunset — not a fault
      if (isNightIST) {
        return {
          ...base,
          rootCause: "night" as const,
          title: `${site.name} — Offline (night standby)`,
          subtitle: `No irradiance — inverters power down after sunset. Will re-evaluate after sunrise.`,
          actionExplanation: `AUTO-CLASSIFIED: NIGHT STANDBY — not escalated.`,
          severity: "low" as const,
          badgeText: "NIGHT",
          badgeVariant: "secondary" as const,
        };
      }

      // 5. Partial outage: other inverters on the same site/network are reporting → internet is fine → genuine inverter fault
      if (isPartial) {
        return {
          ...base,
          rootCause: "hardware" as const,
          title: `${site.name} — Inverter Fault (${offlineCount} of ${totalCount} offline)`,
          subtitle: `Other inverters on this site are reporting, so the site internet is up — this is an inverter / AC breaker / DC isolator issue.`,
          actionExplanation: otherTicket
            ? `AUTO-CLASSIFIED: HARDWARE (high confidence). ${ticketStatus}.`
            : `AUTO-CLASSIFIED: HARDWARE (high confidence). Raise a P1 ticket & dispatch.`,
          severity: "critical" as const,
          badgeText: "INVERTER FAULT",
          badgeVariant: "destructive" as const,
        };
      }

      // 6. Whole site silent, no alarm, daytime — ambiguous; most often internet
      return {
        ...base,
        rootCause: "unconfirmed" as const,
        title: `${site.name} — All inverters silent (cause unconfirmed)`,
        subtitle: `All ${totalCount} inverter(s) stopped reporting with no OEM alarm. Usually router/WiFi; could be a grid trip or main breaker. Call client to confirm.`,
        actionExplanation: `NEEDS CONFIRMATION — mark as Internet Down (suppresses alerts) or raise a ticket if the client confirms no generation.`,
        severity: "medium" as const,
        badgeText: "UNCONFIRMED",
        badgeVariant: "warning" as const,
      };
    }),

    // Open Tickets (connectivity tickets are folded into their site card above)
    ...tickets
      .filter((t) => t.status !== "resolved" && t.status !== "closed" && !isConnectivityTicket(t))
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
          severity: ticket.priority === "p1" ? ("critical" as const) : ticket.priority === "p2" ? ("high" as const) : ticket.priority === "p3" ? ("medium" as const) : ("low" as const),
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

  // Highest severity first; suppressed/auto-classified low items sink to the bottom
  incidents.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));

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
                    {item.type === "site_offline" && (item as any).ticketStatus && (item as any).rootCause !== "internet_confirmed" && (
                      <div className={`text-[11px] font-medium ${(item as any).hasTicket ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {(item as any).hasTicket ? "✓ " : "○ "}{(item as any).ticketStatus}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <span className="text-[11px] font-mono text-muted-foreground hidden lg:inline mr-1">
                    {parseUtcDate(item.timestamp)?.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    }) || item.timestamp}
                  </span>

                  {(item as any).hideAction ? null : item.type === "site_offline" && (item as any).rootCause === "internet_confirmed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 gap-1.5"
                      onClick={() => handleUndoInternet(item.siteId, item.siteName, (item as any).connectivityTicketId)}
                      disabled={submittingSiteId === item.siteId}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>{submittingSiteId === item.siteId ? "Undoing..." : "Undo Internet Label"}</span>
                    </Button>
                  ) : item.type === "site_offline" && ((item as any).rootCause === "sync" || (item as any).rootCause === "night") ? null : item.type === "site_offline" && !(item as any).hasTicket ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(item as any).rootCause !== "hardware" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 gap-1.5 font-medium"
                          onClick={() => handleQuickMarkInternet(item.siteId, item.siteName)}
                          disabled={submittingSiteId === item.siteId}
                          title="Confirm client internet/router issue — suppresses alerts until datalogger reconnects"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          <span>{submittingSiteId === item.siteId ? "Marking..." : (item as any).rootCause === "internet_auto" ? "Confirm Internet" : "Mark Internet Down"}</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={item.severity === "critical" ? "destructive" : "default"}
                        className="text-xs h-8 gap-1.5 font-semibold shadow-sm"
                        onClick={() => openCreateTicketModal(item.siteId, item.siteName, "inverter_fault")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Create Ticket</span>
                      </Button>
                    </div>
                  ) : (
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
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create Ticket & Self-Labeling Dialog */}
      <Dialog open={createTicketOpen} onOpenChange={setCreateTicketOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Plus className="h-4 w-4 text-primary" /> Create Incident Ticket — {targetSite?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Classify the genuine root cause to avoid false emergency alarms and dispatch field technicians when in scope.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs py-2">
            <div className="space-y-1.5">
              <Label className="font-semibold text-xs">Root Cause Classification</Label>
              <Select
                value={ticketForm.rootCause}
                onValueChange={(val) => {
                  setTicketForm((prev) => ({
                    ...prev,
                    rootCause: val,
                    priority: val === "internet_outage" || val === "api_sync_error" ? "p4" : "p1",
                    dispatchTechnician: val !== "internet_outage" && val !== "api_sync_error",
                    description: val === "internet_outage"
                      ? "Customer WiFi/datalogger disconnection. Classified as Internet Issue (Client Scope). Non-emergency inverter operational status."
                      : val === "api_sync_error"
                      ? "OEM Solis Cloud API sync timeout. Telemetry delayed. Waiting for API polling retry."
                      : val === "grid_outage"
                      ? "External grid power failure from utility provider. Inverters idle awaiting grid supply."
                      : "Inverter hardware fault or DC trip observed. Field inspection dispatch required.",
                  }));
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internet_outage">
                    🌐 Internet / WiFi / Datalogger Down (Client Scope - Non-Critical)
                  </SelectItem>
                  <SelectItem value="inverter_fault">
                    ⚡ Inverter Hardware Fault / DC Trip (Solar Assist Scope - Critical)
                  </SelectItem>
                  <SelectItem value="api_sync_error">
                    🔄 OEM Cloud API Polling Delay (Cloud Daemon Retry)
                  </SelectItem>
                  <SelectItem value="grid_outage">
                    🔌 External Grid Outage (DISCOM Supply Interruption)
                  </SelectItem>
                  <SelectItem value="other">
                    🔍 Other / Under Investigation
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold text-xs">Priority</Label>
              <Select
                value={ticketForm.priority}
                onValueChange={(val) => setTicketForm((prev) => ({ ...prev, priority: val }))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="p1">P1 — Emergency (Immediate Outage)</SelectItem>
                  <SelectItem value="p2">P2 — High (Significant Generation Loss)</SelectItem>
                  <SelectItem value="p3">P3 — Medium (Standard)</SelectItem>
                  <SelectItem value="p4">P4 — Low / Informational (Out of Scope)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold text-xs">Ticket Title</Label>
              <Input
                value={ticketForm.title}
                onChange={(e) => setTicketForm((prev) => ({ ...prev, title: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold text-xs">Description & Technical Context</Label>
              <textarea
                value={ticketForm.description}
                onChange={(e) => setTicketForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border bg-muted/30 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ticketForm.dispatchTechnician}
                onChange={(e) => setTicketForm((prev) => ({ ...prev, dispatchTechnician: e.target.checked }))}
                className="rounded text-primary mt-0.5"
              />
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground text-xs">Schedule Field Dispatch (Create Work Order)</span>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  If checked, generates an active field job in Operations Queue for today's daily route dispatch. Uncheck if issue is client-side internet or cloud API delay.
                </p>
              </div>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setCreateTicketOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={handleCreateTicketSubmit}
              disabled={savingTicket}
              className="gap-1.5 font-semibold"
            >
              {savingTicket ? "Creating..." : "Confirm & Create Ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
