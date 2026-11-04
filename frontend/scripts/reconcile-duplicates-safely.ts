import { createClient } from "@supabase/supabase-js";
import { verifyTestEnvironmentSafety } from "./scale-test-guard";

async function reconcileDuplicatesSafely() {
  const targetUrl = process.env.TEST_SUPABASE_URL || "";
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
  verifyTestEnvironmentSafety(targetUrl);

  const sb = createClient(targetUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("==================================================================");
  console.log("   STEP 1: SAFELY RECONCILING DUPLICATE TICKETS & WORK ORDERS    ");
  console.log("==================================================================");

  // Group 1: Alert 5def7dcb-9711-4792-b480-5c1daa0bc9a0
  const CANONICAL_TICKET_1 = "3ac018fa-5d88-435b-b934-18614670a099";
  const DUPLICATE_TICKETS_1 = [
    "2d48f483-5737-497a-aab4-50f47e89ec78",
    "f027c65f-c26d-4c8b-b8a7-a5657a1b7ec0",
  ];
  const CANONICAL_WO_1 = "9c9e8d1d-0b68-4dd1-b0e8-afdb88ca659c";

  // Group 2: Alert 2fe567fc-4cf5-4158-87bd-ae98abb9e116
  const CANONICAL_TICKET_2 = "34cfc102-f44e-40fc-a56b-e8b2095712f1";
  const DUPLICATE_TICKETS_2 = [
    "1a44d7a5-f102-4263-93d6-cafa7cfec0ac",
    "ceb884a2-e0f8-497d-9f22-81fea703c41b",
    "f300b00b-d663-4288-9e15-e552b491e9ca",
    "d4445555-27ce-45cb-ac68-e53a1ef48f17",
    "74f63ce3-bd64-4a9b-b494-236b829f6b8d",
  ];
  const CANONICAL_WO_2 = "54916ea8-697d-467d-9d7c-01fd95cb638f";

  // 1. Repoint work orders referencing duplicate tickets of Group 1
  console.log("\n1. Repointing work orders to Canonical Ticket 1...");
  const { data: woRepoint1, error: woRepointErr1 } = await sb
    .from("work_orders")
    .update({ ticket_id: CANONICAL_TICKET_1 })
    .in("ticket_id", DUPLICATE_TICKETS_1)
    .select("id");
  console.log(`   ✓ Repointed ${woRepoint1?.length || 0} work orders to ${CANONICAL_TICKET_1} (Error: ${woRepointErr1?.message || "none"})`);

  // 2. Repoint work orders referencing duplicate tickets of Group 2
  console.log("\n2. Repointing work orders to Canonical Ticket 2...");
  const { data: woRepoint2, error: woRepointErr2 } = await sb
    .from("work_orders")
    .update({ ticket_id: CANONICAL_TICKET_2 })
    .in("ticket_id", DUPLICATE_TICKETS_2)
    .select("id");
  console.log(`   ✓ Repointed ${woRepoint2?.length || 0} work orders to ${CANONICAL_TICKET_2} (Error: ${woRepointErr2?.message || "none"})`);

  // 3. Close duplicate tickets for Group 1 safely
  console.log("\n3. Closing duplicate tickets for Group 1...");
  for (const tid of DUPLICATE_TICKETS_1) {
    const { data: cur } = await sb.from("tickets").select("description").eq("id", tid).single();
    const newDesc = `[Closed Duplicate - Deduplication Remediation] Merged into canonical ticket ${CANONICAL_TICKET_1}\n\n${cur?.description || ""}`;
    const { error } = await sb.from("tickets").update({ status: "closed", description: newDesc }).eq("id", tid);
    if (error) console.error(`   ✗ Failed to close ticket ${tid}:`, error.message);
    else console.log(`   ✓ Safely closed duplicate ticket ${tid}`);
  }

  // 4. Close duplicate tickets for Group 2 safely
  console.log("\n4. Closing duplicate tickets for Group 2...");
  for (const tid of DUPLICATE_TICKETS_2) {
    const { data: cur } = await sb.from("tickets").select("description").eq("id", tid).single();
    const newDesc = `[Closed Duplicate - Deduplication Remediation] Merged into canonical ticket ${CANONICAL_TICKET_2}\n\n${cur?.description || ""}`;
    const { error } = await sb.from("tickets").update({ status: "closed", description: newDesc }).eq("id", tid);
    if (error) console.error(`   ✗ Failed to close ticket ${tid}:`, error.message);
    else console.log(`   ✓ Safely closed duplicate ticket ${tid}`);
  }

  // 5. Cancel redundant work orders for Ticket 1 (keep only CANONICAL_WO_1 active)
  console.log(`\n5. Cancelling redundant work orders for Ticket 1 (Preserving canonical active: ${CANONICAL_WO_1})...`);
  const { data: allWOs1 } = await sb
    .from("work_orders")
    .select("id, status, description")
    .eq("ticket_id", CANONICAL_TICKET_1)
    .neq("id", CANONICAL_WO_1)
    .in("status", ["draft", "scheduled", "en_route", "in_progress"]);

  for (const wo of allWOs1 || []) {
    const newDesc = `[Cancelled Duplicate - Over-Allocation Remediation] Superseded by canonical work order ${CANONICAL_WO_1}\n\n${wo.description || ""}`;
    const { error } = await sb.from("work_orders").update({ status: "cancelled", description: newDesc }).eq("id", wo.id);
    if (error) console.error(`   ✗ Failed to cancel WO ${wo.id}:`, error.message);
    else console.log(`   ✓ Safely cancelled competing WO ${wo.id}`);
  }

  // 6. Cancel redundant work orders for Ticket 2 (keep only CANONICAL_WO_2 active)
  console.log(`\n6. Cancelling redundant work orders for Ticket 2 (Preserving canonical active: ${CANONICAL_WO_2})...`);
  const { data: allWOs2 } = await sb
    .from("work_orders")
    .select("id, status, description")
    .eq("ticket_id", CANONICAL_TICKET_2)
    .neq("id", CANONICAL_WO_2)
    .in("status", ["draft", "scheduled", "en_route", "in_progress"]);

  for (const wo of allWOs2 || []) {
    const newDesc = `[Cancelled Duplicate - Over-Allocation Remediation] Superseded by canonical work order ${CANONICAL_WO_2}\n\n${wo.description || ""}`;
    const { error } = await sb.from("work_orders").update({ status: "cancelled", description: newDesc }).eq("id", wo.id);
    if (error) console.error(`   ✗ Failed to cancel WO ${wo.id}:`, error.message);
    else console.log(`   ✓ Safely cancelled competing WO ${wo.id}`);
  }

  // 7. Verify post-reconciliation duplicate counts
  console.log("\n==================================================================");
  console.log("   STEP 2: POST-RECONCILIATION VERIFICATION                       ");
  console.log("==================================================================");

  const { data: postActiveTickets } = await sb
    .from("tickets")
    .select("id, alert_id, status")
    .in("status", ["open", "in_progress", "on_hold"])
    .not("alert_id", "is", null);

  const tCounts = new Map<string, number>();
  for (const t of postActiveTickets || []) {
    tCounts.set(t.alert_id, (tCounts.get(t.alert_id) || 0) + 1);
  }
  let activeTicketDups = 0;
  for (const count of tCounts.values()) {
    if (count > 1) activeTicketDups += (count - 1);
  }

  const { data: postActiveWOs } = await sb
    .from("work_orders")
    .select("id, ticket_id, status")
    .in("status", ["draft", "scheduled", "en_route", "in_progress"])
    .not("ticket_id", "is", null);

  const woCounts = new Map<string, number>();
  for (const wo of postActiveWOs || []) {
    woCounts.set(wo.ticket_id, (woCounts.get(wo.ticket_id) || 0) + 1);
  }
  let activeWODups = 0;
  for (const count of woCounts.values()) {
    if (count > 1) activeWODups += (count - 1);
  }

  console.log(`• Active Duplicate Tickets Remaining     : ${activeTicketDups}`);
  console.log(`• Active Duplicate Work Orders Remaining : ${activeWODups}`);

  if (activeTicketDups === 0 && activeWODups === 0) {
    console.log("\n✅ RECONCILIATION COMPLETE: Zero duplicate active tickets or work orders exist!");
  } else {
    console.error("\n❌ DISCREPANCY: Active duplicates still detected.");
    process.exit(1);
  }
}

reconcileDuplicatesSafely().catch(console.error);
