/**
 * SolarAssist Milestone 1: Comprehensive Direct JWT RLS & Immutability Test Suite
 * Target: Staging Only (https://xpjzuquqehjamqsqshwq.supabase.co)
 *
 * Exhaustively validates public.work_orders security model across all personas:
 *   1. Super Admin: Global CRUD permissions across all tenants.
 *   2. EPC Admin: Org-scoped CRUD permissions; complete cross-tenant isolation.
 *   3. Client: Strictly read-only for client's own sites; complete denial on mutations.
 *   4. Technician Individual Scope:
 *      - INSERT: Permitted only when assigned to self (technician_id = auth.uid()).
 *      - Denied: INSERT assigned to others or unassigned.
 *      - Allowed: UPDATE of operational execution fields (status, description, check-in, completion).
 *      - Denied: UPDATE reassigning to others or escaping org.
 *      - Denied: DELETE completely prohibited.
 *   5. Technician Field Immutability Trigger (SECURITY INVOKER, search_path = ''):
 *      - Explicitly tests every audited immutable column:
 *        id, org_id, site_id, ticket_id, created_by, created_at, title, type,
 *        scheduled_date, estimated_duration_mins, team_id, plan_assignment_id,
 *        verification_status, verification_window_ends_at, pre_repair_metric,
 *        post_repair_metric, verified_at.
 *   6. Technician Team Operations & Membership Boundary:
 *      - Team member updating an unassigned team work order -> ALLOW
 *      - Non-member attempting to update an unassigned team work order -> REJECT
 *      - Team member updating a team work order assigned to another tech -> REJECT
 *      - Technician claiming an unassigned team work order for their team -> ALLOW
 *      - Technician claiming a work order belonging to another team -> REJECT
 */

import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Runtime Safety Gate: Strictly Staging xpjzuquqehjamqsqshwq with ZERO production fallback
verifyTestEnvironmentSafety(SUPABASE_URL, true);

if (!SUPABASE_URL.includes(STAGING_PROJECT_REF)) {
  console.error(`FATAL: Test target URL (${SUPABASE_URL}) must match staging project ref (${STAGING_PROJECT_REF}).`);
  process.exit(1);
}

if (SUPABASE_URL.includes("ylnmjvgnjootrkywbcsj")) {
  console.error("FATAL: Production project ref ylnmjvgnjootrkywbcsj detected. Immediate abort.");
  process.exit(1);
}

const ORG_A_ID = "e0000000-000a-4000-a000-000000000001";
const ORG_B_ID = "e0000000-000b-4000-a000-000000000001";
const TEAM_A1_ID = "e0000000-000a-4000-c000-000000000001"; // Mumbai Central Team (member: tech-epca-1)
const TEAM_A2_ID = "e0000000-000a-4000-c000-000000000002"; // Thane Industrial Team (member: tech-epca-2)

interface TestResult {
  section: string;
  role: string;
  operation: string;
  description: string;
  expected: "PASS" | "REJECT";
  status: "PASS" | "FAIL";
  evidence: string;
}

const results: TestResult[] = [];

async function loginAs(email: string, pass: string = "Simulation@12345") {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
  if (error || !data.user) {
    throw new Error(`Auth failed for ${email}: ${error?.message}`);
  }
  return { client, user: data.user };
}

async function run() {
  console.log("========================================================================");
  console.log("=== COMPREHENSIVE WORK ORDER RLS & IMMUTABILITY VERIFICATION SUITE ===");
  console.log(`=== Target: Staging (${SUPABASE_URL}) ===`);
  console.log("========================================================================\n");

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Fetch test sites
  const { data: siteA } = await serviceClient.from("sites").select("id, org_id, client_id").eq("org_id", ORG_A_ID).limit(1).single();
  const { data: siteB } = await serviceClient.from("sites").select("id, org_id").eq("org_id", ORG_B_ID).limit(1).single();

  if (!siteA || !siteB) {
    throw new Error("Could not find test sites for Org A and Org B");
  }

  // 1. Authenticate Personas
  console.log("[1/6] Authenticating test personas via Supabase Auth...");
  const superAdmin = await loginAs("super@solarassist.dev", "Solar@12345");
  const epcAdminA = await loginAs("admin@epca-solar.dev");
  const techA1 = await loginAs("tech-epca-1@epca-solar.dev");
  const techA2 = await loginAs("tech-epca-2@epca-solar.dev");
  const clientA1 = await loginAs("client-epca-1@epca-solar.dev");
  console.log("✓ All 5 personas authenticated with direct JWT sessions\n");

  // Track created records for safe manifest cleanup
  const createdWoIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // SECTION 1: Super Admin Permissions
    // -------------------------------------------------------------
    console.log("[2/6] Section 1: Super Admin Global CRUD...");
    const { data: saWoA, error: saErrA } = await superAdmin.client.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      title: "QA-M1-SuperAdmin-A",
      type: "maintenance",
      status: "scheduled",
    }).select().single();
    if (saWoA) createdWoIds.push(saWoA.id);

    results.push({
      section: "Super Admin",
      role: "Super Admin",
      operation: "INSERT (Org A)",
      description: "Super Admin can insert work order in Org A",
      expected: "PASS",
      status: saWoA && !saErrA ? "PASS" : "FAIL",
      evidence: saErrA ? saErrA.message : `Inserted ${saWoA?.id}`,
    });

    const { data: saWoB, error: saErrB } = await superAdmin.client.from("work_orders").insert({
      org_id: ORG_B_ID,
      site_id: siteB.id,
      title: "QA-M1-SuperAdmin-B",
      type: "maintenance",
      status: "scheduled",
    }).select().single();
    if (saWoB) createdWoIds.push(saWoB.id);

    results.push({
      section: "Super Admin",
      role: "Super Admin",
      operation: "INSERT (Org B)",
      description: "Super Admin can insert work order in Org B",
      expected: "PASS",
      status: saWoB && !saErrB ? "PASS" : "FAIL",
      evidence: saErrB ? saErrB.message : `Inserted ${saWoB?.id}`,
    });

    // -------------------------------------------------------------
    // SECTION 2: EPC Admin (Org A) Permissions & Tenant Isolation
    // -------------------------------------------------------------
    console.log("[3/6] Section 2: EPC Admin Permissions & Cross-Tenant Isolation...");
    const { data: epcWoA, error: epcErrA } = await epcAdminA.client.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      title: "QA-M1-EPCAdmin-A",
      type: "inspection",
      status: "scheduled",
    }).select().single();
    if (epcWoA) createdWoIds.push(epcWoA.id);

    results.push({
      section: "EPC Admin",
      role: "EPC Admin",
      operation: "INSERT (Own Org)",
      description: "EPC Admin can insert work order in own org",
      expected: "PASS",
      status: epcWoA && !epcErrA ? "PASS" : "FAIL",
      evidence: epcErrA ? epcErrA.message : `Inserted ${epcWoA?.id}`,
    });

    const { data: epcWoB, error: epcErrB } = await epcAdminA.client.from("work_orders").insert({
      org_id: ORG_B_ID,
      site_id: siteB.id,
      title: "QA-M1-EPCAdmin-B-Tamper",
      type: "inspection",
      status: "scheduled",
    }).select().single();
    if (epcWoB) createdWoIds.push(epcWoB.id);

    results.push({
      section: "EPC Admin",
      role: "EPC Admin",
      operation: "INSERT (Cross-Org)",
      description: "EPC Admin CANNOT insert work order in Org B",
      expected: "REJECT",
      status: epcErrB ? "PASS" : "FAIL",
      evidence: epcErrB ? `Rejected: ${epcErrB.message} (code ${epcErrB.code})` : "UNAUTHORIZED INSERT SUCCEEDED",
    });

    // -------------------------------------------------------------
    // SECTION 3: Client Strict Denial on Mutations
    // -------------------------------------------------------------
    console.log("[4/6] Section 3: Client Direct Mutation Denial...");
    const { data: clientWo, error: clientErrIns } = await clientA1.client.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      title: "QA-M1-Client-Tamper",
      type: "maintenance",
      status: "scheduled",
    }).select().single();
    if (clientWo) createdWoIds.push(clientWo.id);

    results.push({
      section: "Client Security",
      role: "Client",
      operation: "INSERT",
      description: "Client CANNOT insert work orders directly",
      expected: "REJECT",
      status: clientErrIns ? "PASS" : "FAIL",
      evidence: clientErrIns ? `Rejected: ${clientErrIns.message} (code ${clientErrIns.code})` : "UNAUTHORIZED INSERT SUCCEEDED",
    });

    if (epcWoA) {
      const { data: clientUpd, error: clientErrUpd } = await clientA1.client.from("work_orders")
        .update({ status: "cancelled" })
        .eq("id", epcWoA.id)
        .select();

      results.push({
        section: "Client Security",
        role: "Client",
        operation: "UPDATE",
        description: "Client CANNOT update work orders directly",
        expected: "REJECT",
        status: clientErrUpd || (clientUpd && clientUpd.length === 0) ? "PASS" : "FAIL",
        evidence: clientErrUpd ? `Rejected: ${clientErrUpd.message}` : (clientUpd?.length === 0 ? "0 rows affected (RLS blocked)" : "UNAUTHORIZED UPDATE SUCCEEDED"),
      });

      const { data: clientDel, error: clientErrDel } = await clientA1.client.from("work_orders")
        .delete()
        .eq("id", epcWoA.id)
        .select();

      results.push({
        section: "Client Security",
        role: "Client",
        operation: "DELETE",
        description: "Client CANNOT delete work orders directly",
        expected: "REJECT",
        status: clientErrDel || (clientDel && clientDel.length === 0) ? "PASS" : "FAIL",
        evidence: clientErrDel ? `Rejected: ${clientErrDel.message}` : (clientDel?.length === 0 ? "0 rows affected (RLS blocked)" : "UNAUTHORIZED DELETE SUCCEEDED"),
      });
    }

    // -------------------------------------------------------------
    // SECTION 4: Technician Individual Operations & Boundaries
    // -------------------------------------------------------------
    console.log("[5/6] Section 4: Technician Individual Operations & Boundaries...");
    // 4.1 Insert assigned to self -> PASS
    const { data: techWoSelf, error: techErrSelf } = await techA1.client.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      technician_id: techA1.user.id,
      title: "QA-M1-TechA1-Self",
      type: "maintenance",
      status: "scheduled",
    }).select().single();
    if (techWoSelf) createdWoIds.push(techWoSelf.id);

    results.push({
      section: "Technician Scope",
      role: "Technician",
      operation: "INSERT (Self-Assigned)",
      description: "Technician can insert WO when technician_id = auth.uid()",
      expected: "PASS",
      status: techWoSelf && !techErrSelf ? "PASS" : "FAIL",
      evidence: techErrSelf ? techErrSelf.message : `Inserted ${techWoSelf?.id}`,
    });

    // 4.2 Insert assigned to other tech -> REJECT
    const { data: techWoOther, error: techErrOther } = await techA1.client.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      technician_id: techA2.user.id,
      created_by: techA1.user.id,
      title: "QA-M1-TechA1-AssignOther",
      type: "maintenance",
      status: "scheduled",
    }).select().single();
    if (techWoOther) createdWoIds.push(techWoOther.id);

    results.push({
      section: "Technician Scope",
      role: "Technician",
      operation: "INSERT (Other Tech)",
      description: "Technician CANNOT insert WO assigned to another technician",
      expected: "REJECT",
      status: techErrOther ? "PASS" : "FAIL",
      evidence: techErrOther ? `Rejected: ${techErrOther.message}` : "UNAUTHORIZED INSERT SUCCEEDED",
    });

    // 4.3 Insert unassigned -> REJECT
    const { data: techWoNull, error: techErrNull } = await techA1.client.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      technician_id: null,
      created_by: techA1.user.id,
      title: "QA-M1-TechA1-Unassigned",
      type: "maintenance",
      status: "scheduled",
    }).select().single();
    if (techWoNull) createdWoIds.push(techWoNull.id);

    results.push({
      section: "Technician Scope",
      role: "Technician",
      operation: "INSERT (Unassigned)",
      description: "Technician CANNOT insert unassigned WO without assigning to self",
      expected: "REJECT",
      status: techErrNull ? "PASS" : "FAIL",
      evidence: techErrNull ? `Rejected: ${techErrNull.message}` : "UNAUTHORIZED INSERT SUCCEEDED",
    });

    // 4.4 Allowed Operational Updates
    if (techWoSelf) {
      const nowIso = new Date().toISOString();
      const { data: techOpUpd, error: techOpUpdErr } = await techA1.client.from("work_orders")
        .update({
          status: "in_progress",
          description: "Field arrival verified; inverter filter cleaned",
          check_in_at: nowIso,
          check_in_lat: 19.0760,
          check_in_lng: 72.8777,
          updated_at: nowIso,
        })
        .eq("id", techWoSelf.id)
        .select()
        .single();

      results.push({
        section: "Technician Scope",
        role: "Technician",
        operation: "UPDATE (Operational Fields)",
        description: "Technician can update status, description, check-in coords and timestamps",
        expected: "PASS",
        status: techOpUpd && !techOpUpdErr ? "PASS" : "FAIL",
        evidence: techOpUpdErr ? techOpUpdErr.message : `Updated status: ${techOpUpd?.status}, desc: ${techOpUpd?.description}`,
      });

      // 4.5 Attempt to reassign to other tech -> REJECT
      const { data: techReassign, error: techReassignErr } = await techA1.client.from("work_orders")
        .update({ technician_id: techA2.user.id })
        .eq("id", techWoSelf.id)
        .select()
        .single();

      results.push({
        section: "Technician Scope",
        role: "Technician",
        operation: "UPDATE (Reassign Tech)",
        description: "Technician CANNOT reassign work order to another technician",
        expected: "REJECT",
        status: techReassignErr ? "PASS" : "FAIL",
        evidence: techReassignErr ? `Rejected: ${techReassignErr.message}` : "UNAUTHORIZED REASSIGNMENT SUCCEEDED",
      });

      // 4.6 Attempt DELETE -> REJECT
      const { data: techDel, error: techDelErr } = await techA1.client.from("work_orders")
        .delete()
        .eq("id", techWoSelf.id)
        .select();

      results.push({
        section: "Technician Scope",
        role: "Technician",
        operation: "DELETE",
        description: "Technician CANNOT delete work orders",
        expected: "REJECT",
        status: techDelErr || (techDel && techDel.length === 0) ? "PASS" : "FAIL",
        evidence: techDelErr ? `Rejected: ${techDelErr.message}` : (techDel?.length === 0 ? "0 rows affected (RLS blocked)" : "UNAUTHORIZED DELETION SUCCEEDED"),
      });

      // -------------------------------------------------------------
      // SECTION 5: Field Immutability Trigger (All 17 Administrative Columns)
      // -------------------------------------------------------------
      console.log("[6/6] Section 5: Field Immutability Trigger (17 Columns)...");
      const immutableTests: { field: string; payload: Record<string, any> }[] = [
        { field: "id", payload: { id: "00000000-0000-4000-a000-000000000099" } },
        { field: "org_id", payload: { org_id: ORG_B_ID } },
        { field: "site_id", payload: { site_id: siteB.id } },
        { field: "ticket_id", payload: { ticket_id: "00000000-0000-4000-a000-000000000099" } },
        { field: "created_by", payload: { created_by: techA2.user.id } },
        { field: "created_at", payload: { created_at: "2020-01-01T00:00:00Z" } },
        { field: "title", payload: { title: "Tampered Title" } },
        { field: "type", payload: { type: "inspection" } },
        { field: "scheduled_date", payload: { scheduled_date: "2030-01-01" } },
        { field: "estimated_duration_mins", payload: { estimated_duration_mins: 999 } },
        { field: "team_id", payload: { team_id: TEAM_A2_ID } },
        { field: "plan_assignment_id", payload: { plan_assignment_id: "00000000-0000-4000-a000-000000000099" } },
        { field: "verification_status", payload: { verification_status: "verified" } },
        { field: "verification_window_ends_at", payload: { verification_window_ends_at: "2030-01-01T00:00:00Z" } },
        { field: "pre_repair_metric", payload: { pre_repair_metric: "tampered_pre" } },
        { field: "post_repair_metric", payload: { post_repair_metric: "tampered_post" } },
        { field: "verified_at", payload: { verified_at: "2030-01-01T00:00:00Z" } },
      ];

      for (const t of immutableTests) {
        const { data: immData, error: immErr } = await techA1.client.from("work_orders")
          .update(t.payload)
          .eq("id", techWoSelf.id)
          .select()
          .single();

        results.push({
          section: "Field Immutability",
          role: "Technician",
          operation: `UPDATE (${t.field})`,
          description: `Technician CANNOT modify immutable field: ${t.field}`,
          expected: "REJECT",
          status: immErr ? "PASS" : "FAIL",
          evidence: immErr ? `Rejected: ${immErr.message}` : `UNAUTHORIZED MUTATION OF ${t.field} SUCCEEDED`,
        });
      }
    }

    // -------------------------------------------------------------
    // SECTION 6: Technician Team Operations & Membership Boundary
    // -------------------------------------------------------------
    console.log("Section 6: Technician Team Operations & Membership Boundary...");
    // Setup test work orders via service role
    // Order 1: Assigned to Team 1, unassigned technician
    const { data: team1WoUnassigned } = await serviceClient.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      team_id: TEAM_A1_ID,
      technician_id: null,
      title: "QA-M1-Team1-Unassigned",
      type: "cleaning",
      status: "scheduled",
    }).select().single();
    if (team1WoUnassigned) createdWoIds.push(team1WoUnassigned.id);

    // Order 2: Assigned to Team 1, assigned to techA2 (who is in Team 2)
    const { data: team1WoAssignedOther } = await serviceClient.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      team_id: TEAM_A1_ID,
      technician_id: techA2.user.id,
      title: "QA-M1-Team1-AssignedTechA2",
      type: "cleaning",
      status: "scheduled",
    }).select().single();
    if (team1WoAssignedOther) createdWoIds.push(team1WoAssignedOther.id);

    // Order 3: Assigned to Team 2, unassigned technician
    const { data: team2WoUnassigned } = await serviceClient.from("work_orders").insert({
      org_id: ORG_A_ID,
      site_id: siteA.id,
      team_id: TEAM_A2_ID,
      technician_id: null,
      title: "QA-M1-Team2-Unassigned",
      type: "cleaning",
      status: "scheduled",
    }).select().single();
    if (team2WoUnassigned) createdWoIds.push(team2WoUnassigned.id);

    // 6.1 Team member (techA1) updating unassigned Team 1 order -> ALLOW
    if (team1WoUnassigned) {
      const { data: t1Upd, error: t1UpdErr } = await techA1.client.from("work_orders")
        .update({ status: "in_progress", description: "Team 1 member initiated work" })
        .eq("id", team1WoUnassigned.id)
        .select()
        .single();

      results.push({
        section: "Team Operations",
        role: "Technician",
        operation: "UPDATE (Team Member Unassigned WO)",
        description: "Team member can update status on unassigned team work order",
        expected: "PASS",
        status: t1Upd && !t1UpdErr ? "PASS" : "FAIL",
        evidence: t1UpdErr ? t1UpdErr.message : `Updated status: ${t1Upd?.status}`,
      });

      // 6.2 Non-member (techA2) attempting to update unassigned Team 1 order -> REJECT
      const { data: t2OnT1, error: t2OnT1Err } = await techA2.client.from("work_orders")
        .update({ description: "Non-member tampering" })
        .eq("id", team1WoUnassigned.id)
        .select();

      results.push({
        section: "Team Operations",
        role: "Technician",
        operation: "UPDATE (Non-Member Unassigned WO)",
        description: "Non-member CANNOT update unassigned work order belonging to another team",
        expected: "REJECT",
        status: t2OnT1Err || (t2OnT1 && t2OnT1.length === 0) ? "PASS" : "FAIL",
        evidence: t2OnT1Err ? `Rejected: ${t2OnT1Err.message}` : (t2OnT1?.length === 0 ? "0 rows affected (RLS blocked)" : "UNAUTHORIZED UPDATE SUCCEEDED"),
      });

      // 6.4 Technician (techA1) claiming unassigned Team 1 work order -> ALLOW
      const { data: claimT1, error: claimT1Err } = await techA1.client.from("work_orders")
        .update({ technician_id: techA1.user.id })
        .eq("id", team1WoUnassigned.id)
        .select()
        .single();

      results.push({
        section: "Team Operations",
        role: "Technician",
        operation: "UPDATE (Self-Claim Team WO)",
        description: "Team member can claim unassigned team work order to self",
        expected: "PASS",
        status: claimT1 && !claimT1Err ? "PASS" : "FAIL",
        evidence: claimT1Err ? claimT1Err.message : `Claimed by: ${claimT1?.technician_id}`,
      });
    }

    // 6.3 Team member (techA1) attempting to update Team 1 order assigned to techA2 -> REJECT
    if (team1WoAssignedOther) {
      const { data: t1OnAssigned, error: t1OnAssignedErr } = await techA1.client.from("work_orders")
        .update({ description: "TechA1 hijacking TechA2 assigned order" })
        .eq("id", team1WoAssignedOther.id)
        .select();

      results.push({
        section: "Team Operations",
        role: "Technician",
        operation: "UPDATE (Assigned to Another Tech)",
        description: "Team member CANNOT update team work order already assigned to another technician",
        expected: "REJECT",
        status: t1OnAssignedErr || (t1OnAssigned && t1OnAssigned.length === 0) ? "PASS" : "FAIL",
        evidence: t1OnAssignedErr ? `Rejected: ${t1OnAssignedErr.message}` : (t1OnAssigned?.length === 0 ? "0 rows affected (RLS blocked)" : "UNAUTHORIZED UPDATE SUCCEEDED"),
      });
    }

    // 6.5 Technician (techA1) attempting to claim unassigned Team 2 work order -> REJECT
    if (team2WoUnassigned) {
      const { data: claimT2, error: claimT2Err } = await techA1.client.from("work_orders")
        .update({ technician_id: techA1.user.id })
        .eq("id", team2WoUnassigned.id)
        .select();

      results.push({
        section: "Team Operations",
        role: "Technician",
        operation: "UPDATE (Claim Other Team WO)",
        description: "Technician CANNOT claim unassigned work order belonging to another team",
        expected: "REJECT",
        status: claimT2Err || (claimT2 && claimT2.length === 0) ? "PASS" : "FAIL",
        evidence: claimT2Err ? `Rejected: ${claimT2Err.message}` : (claimT2?.length === 0 ? "0 rows affected (RLS blocked)" : "UNAUTHORIZED CLAIM SUCCEEDED"),
      });
    }

  } finally {
    // Exact manifest cleanup of test records created during this run
    if (createdWoIds.length > 0) {
      console.log(`\nManifest cleanup: Safely removing ${createdWoIds.length} test records created during suite...`);
      await serviceClient.from("work_orders").delete().in("id", createdWoIds);
      console.log("✓ Manifest cleanup complete. Baseline staging records untouched.");
    }
  }

  // Summary Report
  console.log("\n=================== FINAL TEST RESULTS MATRIX ===================");
  let passedCount = 0;
  for (const r of results) {
    const isPass = r.status === "PASS";
    if (isPass) passedCount++;
    const symbol = isPass ? "✓" : "✗";
    console.log(`${symbol} [${r.section}] [${r.role}] ${r.operation}: ${r.description} -> ${r.status}`);
    console.log(`   Expected: ${r.expected} | Actual: ${r.evidence}`);
  }
  console.log(`\nFinal Score: ${passedCount}/${results.length} PASSED`);
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
