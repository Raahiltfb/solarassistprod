import { createClient } from "@/lib/supabase/server";
import { getAlarmIntelligence } from "./alarm-intelligence";

export interface AutomationResult {
  alert_id: string;
  ticket_id: string | null;
  work_order_id: string | null;
  action: "created" | "reused" | "skipped";
  reason?: string;
}

const severityToPriority: Record<string, "p1" | "p2" | "p3" | "p4"> = {
  critical: "p1",
  high: "p2",
  medium: "p3",
  low: "p4",
};

/**
 * Idempotent OEM-agnostic automation engine:
 * Evaluates Alert -> Creates/Reuses Active Ticket -> Creates/Reuses Draft Unassigned Work Order
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
      action: "skipped",
      reason: `Alert not found: ${alertErr?.message || "Unknown error"}`,
    };
  }

  // 2. Actionability Gate: Check requires_technician
  if (!alert.requires_technician || alert.status !== "open") {
    return {
      alert_id: alertId,
      ticket_id: null,
      work_order_id: null,
      action: "skipped",
      reason: `Alert requires_technician is false or status is not open (${alert.status})`,
    };
  }

  const priority = severityToPriority[alert.severity] || "p3";
  const intelligence = getAlarmIntelligence(alert.alarm_code || alert.code, alert.oem || "solis");

  // 3. Idempotent Ticket Lookup / Creation
  // Search for active ticket linked to this alert_id
  let activeTicket: any = null;

  const { data: existingTicketByAlert } = await sb
    .from("tickets")
    .select("*")
    .eq("alert_id", alert.id)
    .in("status", ["open", "in_progress", "on_hold"])
    .maybeSingle();

  if (existingTicketByAlert) {
    activeTicket = existingTicketByAlert;
  } else {
    // Search for active ticket on same site & inverter for an open alert
    let query = sb
      .from("tickets")
      .select("*, alerts!inner(*)")
      .eq("site_id", alert.site_id)
      .eq("alerts.code", alert.code)
      .eq("alerts.status", "open")
      .in("status", ["open", "in_progress", "on_hold"]);

    if (alert.inverter_id) {
      query = query.eq("alerts.inverter_id", alert.inverter_id);
    }

    const { data: existingTicketByCode } = await query.maybeSingle();
    if (existingTicketByCode) {
      activeTicket = existingTicketByCode;
    }
  }

  let ticketId = activeTicket?.id || null;
  let isNewTicket = false;

  if (!activeTicket) {
    // Create new Ticket
    const { data: newTicket, error: ticketErr } = await sb
      .from("tickets")
      .insert({
        org_id: alert.org_id,
        site_id: alert.site_id,
        alert_id: alert.id,
        title: `[ALARM] ${alert.title}`,
        description: intelligence
          ? `OEM Event: ${intelligence.oem_definition}\nRecommended Action: ${intelligence.recommended_action}`
          : `Automated ticket created for alert code ${alert.code}. ${alert.description || ""}`,
        status: "open",
        priority,
        sla_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      .select()
      .single();

    if (ticketErr || !newTicket) {
      return {
        alert_id: alertId,
        ticket_id: null,
        work_order_id: null,
        action: "skipped",
        reason: `Failed to create ticket: ${ticketErr?.message}`,
      };
    }

    ticketId = newTicket.id;
    isNewTicket = true;
  }

  // 4. Idempotent Draft Work Order Lookup / Creation
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
    // Create Draft Unassigned Work Order (scheduled_date = NULL, technician_id = NULL)
    const woDesc = intelligence
      ? `Field investigation task for alarm code ${alert.alarm_code || alert.code} (${alert.title}).\n\n` +
        `OEM Definition: ${intelligence.oem_definition}\n\n` +
        `Recommended Action: ${intelligence.recommended_action}`
      : `Field investigation task for alert code ${alert.code}. ${alert.description || ""}\nRecommended Action: ${alert.recommended_action || "Perform manual inspection."}`;

    const { data: newWO, error: woErr } = await sb
      .from("work_orders")
      .insert({
        org_id: alert.org_id,
        site_id: alert.site_id,
        ticket_id: ticketId,
        technician_id: null, // Unassigned
        title: `Alarm Investigation: ${alert.title}`,
        description: woDesc,
        type: "alarm_investigation",
        status: "draft",
        scheduled_date: null, // NULL until coordinator schedules
        estimated_duration_mins: 60,
      })
      .select()
      .single();

    if (woErr || !newWO) {
      return {
        alert_id: alertId,
        ticket_id: ticketId,
        work_order_id: null,
        action: isNewTicket ? "created" : "reused",
        reason: `Failed to create draft work order: ${woErr?.message}`,
      };
    }

    workOrderId = newWO.id;
    isNewWO = true;
  }

  return {
    alert_id: alertId,
    ticket_id: ticketId,
    work_order_id: workOrderId,
    action: isNewTicket || isNewWO ? "created" : "reused",
  };
}
