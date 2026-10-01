import { createClient } from "@/lib/supabase/server";
import { evaluateActionDecision } from "./decision-engine";
import { getAlarmIntelligence } from "./alarm-intelligence";
import { ActionDecisionClass } from "@/lib/types";

export interface AutomationResult {
  alert_id: string;
  ticket_id: string | null;
  work_order_id: string | null;
  decision_class: ActionDecisionClass;
  confidence_pct: number;
  reasoning: string;
  action: "created" | "reused" | "skipped" | "monitored" | "notified";
  reason?: string;
}

const severityToPriority: Record<string, "p1" | "p2" | "p3" | "p4"> = {
  critical: "p1",
  high: "p2",
  medium: "p3",
  low: "p4",
};

/**
 * Idempotent Action Decision Automation Engine:
 * Evaluates Alert -> Runs Decision Classification (MONITOR/NOTIFY/INVESTIGATE/SCHEDULE/DISPATCH/ESCALATE)
 * -> Creates Ticket/Job & assigns nearest technician where pre-authorized.
 */
export async function processAlertAutomation(
  alertId: string,
  clientOverride?: any
): Promise<AutomationResult> {
  const sb = clientOverride || (await createClient());

  // 1. Fetch Alert
  const { data: alert, error: alertErr } = await sb
    .from("alerts")
    .select("*")
    .eq("id", alertId)
    .single();

  if (alertErr || !alert) {
    return {
      alert_id: alertId,
      ticket_id: null,
      work_order_id: null,
      decision_class: "MONITOR",
      confidence_pct: 0,
      reasoning: `Alert not found: ${alertErr?.message || "Unknown error"}`,
      action: "skipped",
      reason: "Alert record not found",
    };
  }

  // 2. Fetch Context: Site, Recent Alerts Count (Recurrence), Available Technicians, and Open Work Orders
  const [siteRes, recentAlertsRes, techsRes, openWOsRes] = await Promise.all([
    sb.from("sites").select("*").eq("id", alert.site_id).maybeSingle(),
    sb
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("site_id", alert.site_id)
      .eq("code", alert.code)
      .gte("triggered_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
    sb.from("profiles").select("*").eq("role", "technician").eq("org_id", alert.org_id),
    sb
      .from("work_orders")
      .select("technician_id")
      .not("technician_id", "is", null)
      .in("status", ["scheduled", "en_route", "in_progress"]),
  ]);

  const site = siteRes.data || null;
  const recentAlertsCount = recentAlertsRes.count || 1;
  const technicians = techsRes.data || [];
  const openWOs = openWOsRes.data || [];

  const techWorkloads: Record<string, number> = {};
  for (const wo of openWOs) {
    if (wo.technician_id) {
      techWorkloads[wo.technician_id] = (techWorkloads[wo.technician_id] || 0) + 1;
    }
  }

  // 3. Evaluate Decision Engine Logic with Workload Balancing
  const decision = evaluateActionDecision({
    alert,
    site,
    recentAlertsCount,
    availableTechnicians: technicians,
    techWorkloads,
  });

  // Update alert record with decision classification
  await sb
    .from("alerts")
    .update({
      action_decision_class: decision.decision_class,
      decision_confidence_pct: decision.confidence_pct,
      decision_reasoning: decision.reasoning,
    })
    .eq("id", alert.id);

  // If MONITOR or NOTIFY, return early without creating physical tickets/jobs
  if (decision.decision_class === "MONITOR") {
    return {
      alert_id: alertId,
      ticket_id: null,
      work_order_id: null,
      decision_class: decision.decision_class,
      confidence_pct: decision.confidence_pct,
      reasoning: decision.reasoning,
      action: "monitored",
    };
  }

  if (decision.decision_class === "NOTIFY") {
    return {
      alert_id: alertId,
      ticket_id: null,
      work_order_id: null,
      decision_class: decision.decision_class,
      confidence_pct: decision.confidence_pct,
      reasoning: decision.reasoning,
      action: "notified",
    };
  }

  const priority = severityToPriority[alert.severity] || "p3";
  const intelligence = getAlarmIntelligence(alert.alarm_code || alert.code, alert.oem || "solis");

  // 4. Idempotent Ticket Lookup / Creation
  let activeTicket: any = null;
  const { data: existingTicketByAlert } = await sb
    .from("tickets")
    .select("*")
    .eq("alert_id", alert.id)
    .in("status", ["open", "in_progress", "on_hold"])
    .maybeSingle();

  if (existingTicketByAlert) {
    activeTicket = existingTicketByAlert;
  }

  let ticketId = activeTicket?.id || null;
  let isNewTicket = false;

  if (!activeTicket) {
    const { data: newTicket, error: ticketErr } = await sb
      .from("tickets")
      .insert({
        org_id: alert.org_id,
        site_id: alert.site_id,
        alert_id: alert.id,
        title: `[${decision.decision_class}] ${alert.title}`,
        description: `Action Decision: ${decision.decision_class} (${decision.confidence_pct}% Confidence)\nReasoning: ${decision.reasoning}\n\n` +
          (intelligence
            ? `OEM Event: ${intelligence.oem_definition}\nRecommended Action: ${intelligence.recommended_action}`
            : `Automated ticket created for alert code ${alert.code}. ${alert.description || ""}`),
        status: "open",
        priority,
        sla_due_at: new Date(Date.now() + (priority === "p1" ? 4 : priority === "p2" ? 12 : 24) * 3600 * 1000).toISOString(),
      })
      .select()
      .single();

    if (ticketErr || !newTicket) {
      return {
        alert_id: alertId,
        ticket_id: null,
        work_order_id: null,
        decision_class: decision.decision_class,
        confidence_pct: decision.confidence_pct,
        reasoning: decision.reasoning,
        action: "skipped",
        reason: `Failed to create ticket: ${ticketErr?.message}`,
      };
    }

    ticketId = newTicket.id;
    isNewTicket = true;

    // Link ticket to alert
    await sb.from("alerts").update({ ticket_id: ticketId }).eq("id", alert.id);
  }

  // If automated job creation is not enabled for this decision class (e.g. INVESTIGATE or ESCALATE), return
  if (!decision.automated_job_created) {
    return {
      alert_id: alertId,
      ticket_id: ticketId,
      work_order_id: null,
      decision_class: decision.decision_class,
      confidence_pct: decision.confidence_pct,
      reasoning: decision.reasoning,
      action: isNewTicket ? "created" : "reused",
    };
  }

  // 5. Idempotent Work Order Lookup / Creation
  let activeWO: any = null;
  const { data: existingWO } = await sb
    .from("work_orders")
    .select("*")
    .eq("ticket_id", ticketId)
    .in("status", ["draft", "scheduled", "en_route", "in_progress"])
    .maybeSingle();

  if (existingWO) {
    activeWO = existingWO;
  }

  let workOrderId = activeWO?.id || null;
  let isNewWO = false;

  if (!activeWO) {
    const todayStr = new Date().toISOString().split("T")[0];
    const woStatus = decision.decision_class === "DISPATCH_IMMEDIATELY" ? "scheduled" : "scheduled";

    const woDesc =
      `Automated Job Dispatch [${decision.decision_class}]\n` +
      `Decision Reasoning: ${decision.reasoning}\n` +
      `Recommended Tech: ${decision.recommended_technician_name || "Unassigned"}\n\n` +
      (intelligence
        ? `OEM Definition: ${intelligence.oem_definition}\nRecommended Action: ${intelligence.recommended_action}`
        : `Field task for alert code ${alert.code}. ${alert.description || ""}`);

    const { data: newWO, error: woErr } = await sb
      .from("work_orders")
      .insert({
        org_id: alert.org_id,
        site_id: alert.site_id,
        ticket_id: ticketId,
        technician_id: decision.recommended_technician_id || null,
        title: `[${decision.decision_class}] ${alert.title}`,
        description: woDesc,
        type: "alarm_investigation",
        status: woStatus,
        scheduled_date: todayStr,
        estimated_duration_mins: priority === "p1" ? 120 : 60,
      })
      .select()
      .single();

    if (woErr || !newWO) {
      return {
        alert_id: alertId,
        ticket_id: ticketId,
        work_order_id: null,
        decision_class: decision.decision_class,
        confidence_pct: decision.confidence_pct,
        reasoning: decision.reasoning,
        action: isNewTicket ? "created" : "reused",
        reason: `Failed to create service request: ${woErr?.message}`,
      };
    }

    workOrderId = newWO.id;
    isNewWO = true;
  }

  return {
    alert_id: alertId,
    ticket_id: ticketId,
    work_order_id: workOrderId,
    decision_class: decision.decision_class,
    confidence_pct: decision.confidence_pct,
    reasoning: decision.reasoning,
    action: isNewTicket || isNewWO ? "created" : "reused",
  };
}
