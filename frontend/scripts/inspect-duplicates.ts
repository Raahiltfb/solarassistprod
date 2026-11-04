import { createClient } from "@supabase/supabase-js";
import { verifyTestEnvironmentSafety } from "./scale-test-guard";

async function inspectDuplicates() {
  const targetUrl = process.env.TEST_SUPABASE_URL || "";
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
  verifyTestEnvironmentSafety(targetUrl);

  const sb = createClient(targetUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("=== INSPECTING ACTIVE TICKETS FOR DUPLICATES ON alert_id ===");
  const { data: activeTickets, error: tErr } = await sb
    .from("tickets")
    .select("id, org_id, site_id, alert_id, title, status, priority, created_at")
    .in("status", ["open", "in_progress", "on_hold"])
    .not("alert_id", "is", null);

  if (tErr) {
    console.error("Error querying tickets:", tErr);
    return;
  }

  const ticketsByAlert = new Map<string, any[]>();
  for (const t of activeTickets || []) {
    if (!ticketsByAlert.has(t.alert_id)) {
      ticketsByAlert.set(t.alert_id, []);
    }
    ticketsByAlert.get(t.alert_id)!.push(t);
  }

  let dupTicketCount = 0;
  for (const [alertId, tList] of ticketsByAlert.entries()) {
    if (tList.length > 1) {
      dupTicketCount += (tList.length - 1);
      console.log(`\n• Duplicate Active Tickets for Alert ${alertId} (${tList.length} tickets):`);
      for (const t of tList) {
        console.log(`   - Ticket ID: ${t.id} | Status: ${t.status} | Priority: ${t.priority} | Created: ${t.created_at} | Title: ${t.title}`);
      }
    }
  }
  console.log(`\nTotal duplicate active ticket records: ${dupTicketCount}`);

  console.log("\n=== INSPECTING ACTIVE WORK ORDERS FOR DUPLICATES ON ticket_id ===");
  const { data: activeWOs, error: woErr } = await sb
    .from("work_orders")
    .select("id, org_id, site_id, ticket_id, technician_id, title, status, created_at")
    .in("status", ["draft", "scheduled", "en_route", "in_progress"])
    .not("ticket_id", "is", null);

  if (woErr) {
    console.error("Error querying work orders:", woErr);
    return;
  }

  const wosByTicket = new Map<string, any[]>();
  for (const wo of activeWOs || []) {
    if (!wosByTicket.has(wo.ticket_id)) {
      wosByTicket.set(wo.ticket_id, []);
    }
    wosByTicket.get(wo.ticket_id)!.push(wo);
  }

  let dupWOCount = 0;
  for (const [ticketId, woList] of wosByTicket.entries()) {
    if (woList.length > 1) {
      dupWOCount += (woList.length - 1);
      console.log(`\n• Duplicate Active Work Orders for Ticket ${ticketId} (${woList.length} work orders):`);
      for (const wo of woList) {
        console.log(`   - WO ID: ${wo.id} | Tech: ${wo.technician_id} | Status: ${wo.status} | Created: ${wo.created_at} | Title: ${wo.title}`);
      }
    }
  }
  console.log(`\nTotal duplicate active work order records: ${dupWOCount}`);

  // Also check if any work orders reference the duplicate tickets
  console.log("\n=== CHECKING WORK ORDER REFERENCES TO DUPLICATE TICKETS ===");
  for (const [alertId, tList] of ticketsByAlert.entries()) {
    if (tList.length > 1) {
      const ticketIds = tList.map(t => t.id);
      const { data: referencingWOs } = await sb
        .from("work_orders")
        .select("id, ticket_id, technician_id, status")
        .in("ticket_id", ticketIds);
      console.log(`Alert ${alertId} tickets ${ticketIds.join(", ")} have ${referencingWOs?.length || 0} referencing work orders.`);
      for (const r of referencingWOs || []) {
        console.log(`   - Work Order ${r.id} -> references Ticket ${r.ticket_id} (Status: ${r.status}, Tech: ${r.technician_id})`);
      }
    }
  }
}

inspectDuplicates().catch(console.error);
