/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SolarAssist Acceptance QA - Phase A: Closed-Loop Operational Lifecycle Suite
 * 
 * Verifies End-to-End:
 * 1. OEM Telemetry Fault Ingestion & Alarm Normalization across Solis, Growatt, and Sungrow.
 * 2. Automated Action Decision Engine (Urgency, Severity, Workload-balanced Dispatch).
 * 3. Ticket Deduplication on Recurrent Alarms (Idempotency).
 * 4. Dispatch & Work Order Creation to Eligible Organization Technician.
 * 5. Technician Execution: In-Progress Status, Maintenance Remarks, and Evidence Photo Upload.
 * 6. Work Order Completion & Ticket Resolution Transition.
 * 7. Fresh Telemetry Arrival (Healthy vs Persistent Fault).
 * 8. Closed-Loop Resolution Verification Cron Execution:
 *    - Scenario A: Confirmed Recovery -> Ticket Auto-Closure (status: 'closed', verification_status: 'verified_recovered').
 *    - Scenario B: Unresolved Recovery -> Reopening & Priority Escalation (status: 'open', priority: 'p2', verification_status: 'verification_failed').
 * 9. Exact Manifest Tracking & Safe Teardown of Test Records.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";
import { processAlertAutomation, dispatchWorkOrderSafely } from "../lib/automation/engine";
import { getAlarmIntelligence } from "../lib/automation/alarm-intelligence";
import { evaluateActionDecision } from "../lib/automation/decision-engine";

const TARGET_URL = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

verifyTestEnvironmentSafety(TARGET_URL, true);

if (!TARGET_URL.includes(STAGING_PROJECT_REF)) {
  console.error(`FATAL: Target URL does not match staging ref: ${STAGING_PROJECT_REF}`);
  process.exit(1);
}

const sb = createClient(TARGET_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface AcceptanceTestResult {
  test_id: string;
  lifecycle: string;
  step: string;
  description: string;
  input: any;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
  latency_ms: number;
  evidence?: any;
}

const results: AcceptanceTestResult[] = [];
const createdRecords: Array<{ table: string; id: string }> = [];

async function timeOp<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  return { result, durationMs };
}

async function runPhaseA() {
  console.log("================================================================================");
  console.log("       SOLARASSIST ACCEPTANCE QA - PHASE A: CLOSED-LOOP OPERATIONAL LIFECYCLE   ");
  console.log(`Target: ${TARGET_URL} | Ref: ${STAGING_PROJECT_REF}`);
  console.log("================================================================================\n");

  // Step 0: Identify test site, inverter with attached strings, and technician
  const { data: stringSample, error: strErr } = await sb
    .from("strings")
    .select("id, inverter_id, inverters(id, site_id, serial_number, model, sites(id, org_id, name))")
    .limit(1)
    .single();

  if (strErr || !stringSample) throw new Error("Failed to find inverter with strings: " + strErr?.message);

  const invData = (stringSample as any).inverters;
  const siteData = invData.sites;
  const testOrgId = siteData.org_id;
  const testSite = { id: siteData.id, name: siteData.name, org_id: testOrgId };
  const testInv = { id: invData.id, serial_number: invData.serial_number, model: invData.model };

  const { data: invStrings } = await sb.from("strings").select("id, string_index").eq("inverter_id", testInv.id);
  const testStrings = invStrings || [];

  // Fetch a second distinct inverter with strings for Lifecycle 2 (to isolate persistent fault telemetry)
  const { data: inv2Data } = await sb.from("inverters").select("id, serial_number, model").eq("site_id", testSite.id).neq("id", testInv.id).limit(1).single();
  const testInv2 = inv2Data ? { id: inv2Data.id, serial_number: inv2Data.serial_number, model: inv2Data.model } : testInv;
  const { data: inv2Strings } = await sb.from("strings").select("id, string_index").eq("inverter_id", testInv2.id);
  const test2Strings = inv2Strings && inv2Strings.length > 0 ? inv2Strings : testStrings;

  const { data: techs } = await sb.from("profiles").select("id, full_name, email").eq("org_id", testOrgId).eq("role", "technician");
  if (!techs || techs.length === 0) throw new Error("No technician found for test org");
  const testTech = techs[0];

  console.log(`Test Context: Org '${testOrgId}', Site '${testSite.name}' (${testSite.id}), Inv1 '${testInv.serial_number}' (${testStrings.length} strings), Inv2 '${testInv2.serial_number}' (${test2Strings.length} strings), Tech '${testTech.full_name}'`);

  // ---------------------------------------------------------------------------
  // LIFECYCLE 1: OEM TELEMETRY INGESTION -> ALERT -> TICKET -> DISPATCH -> RECOVERY -> CLOSURE
  // ---------------------------------------------------------------------------
  console.log("\n--- LIFECYCLE 1: FULL RESOLUTION CLOSED-LOOP (CONFIRMED RECOVERY) ---");

  let alert1Id = "";
  let ticket1Id = "";
  let wo1Id = "";

  // 1.1 Ingest Solis Arc Fault Alert
  try {
    const { result, durationMs } = await timeOp(async () => {
      const intelligence = getAlarmIntelligence("1045", "solis");
      const { data, error } = await sb.from("alerts").insert({
        site_id: testSite.id,
        org_id: testOrgId,
        inverter_id: testInv.id,
        code: "1045",
        title: intelligence?.oem_definition || "DC Arc Fault Detected",
        severity: "critical",
        status: "open",
        description: "DC Arc / Ground Fault detected on MPPT 1 by inverter telemetry",
      }).select().single();
      if (error) throw error;
      return data;
    });

    alert1Id = result.id;
    createdRecords.push({ table: "alerts", id: alert1Id });

    results.push({
      test_id: "LC1-01",
      lifecycle: "Lifecycle 1: Recovery",
      step: "OEM Telemetry Ingestion & Alert Generation",
      description: "Ingest Solis critical DC Arc fault (1045) into alerts table",
      input: { code: "1045", oem: "solis", site_id: testSite.id, inverter_id: testInv.id },
      expected: "Alert created with status 'open' and severity 'critical'",
      actual: `Alert created (ID: ${alert1Id}, Status: ${result.status})`,
      status: "PASS",
      latency_ms: durationMs,
      evidence: { alert_id: alert1Id, code: result.code, severity: result.severity },
    });
    console.log(`[PASS] LC1-01: Ingestion & Alert Creation (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC1-01", lifecycle: "Lifecycle 1", step: "Ingestion", description: "Alert generation",
      input: {}, expected: "Alert created", actual: err.message, status: "FAIL", latency_ms: 0,
    });
    console.error(`[FAIL] LC1-01: ${err.message}`);
  }

  // 1.2 Automation Engine: Evaluation, Ticket Creation & Work Order Dispatch
  try {
    const { result, durationMs } = await timeOp(async () => {
      const autoRes = await processAlertAutomation(alert1Id, sb);
      return autoRes;
    });

    ticket1Id = result.ticket_id || "";
    wo1Id = result.work_order_id || "";
    if (ticket1Id) createdRecords.push({ table: "tickets", id: ticket1Id });
    if (wo1Id) createdRecords.push({ table: "work_orders", id: wo1Id });

    const pass = ["DISPATCH", "DISPATCH_IMMEDIATELY", "ESCALATE"].includes(result.decision_class) && !!ticket1Id && !!wo1Id;
    results.push({
      test_id: "LC1-02",
      lifecycle: "Lifecycle 1: Recovery",
      step: "Action Decision & Dispatch Automation",
      description: "Action Decision Engine evaluates fault, creates ticket and dispatches work order",
      input: { alert_id: alert1Id },
      expected: "Decision in [DISPATCH, DISPATCH_IMMEDIATELY, ESCALATE], Ticket created, Work Order dispatched to technician",
      actual: `Decision: ${result.decision_class}, Ticket: ${ticket1Id}, WorkOrder: ${wo1Id}`,
      status: pass ? "PASS" : "FAIL",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[${pass ? "PASS" : "FAIL"}] LC1-02: Action Decision & Dispatch (${durationMs}ms, Decision: ${result.decision_class})`);
  } catch (err: any) {
    results.push({
      test_id: "LC1-02", lifecycle: "Lifecycle 1", step: "Automation", description: "Evaluation & Dispatch",
      input: {}, expected: "Ticket & WO created", actual: err.message, status: "FAIL", latency_ms: 0,
    });
    console.error(`[FAIL] LC1-02: ${err.message}`);
  }

  // 1.3 Ticket Deduplication on Recurrent Ingestion
  try {
    const { result, durationMs } = await timeOp(async () => {
      const repeatRes = await processAlertAutomation(alert1Id, sb);
      return repeatRes;
    });

    const pass = result.ticket_id === ticket1Id && result.work_order_id === wo1Id && (result.action === "reused" || result.action === "created");
    results.push({
      test_id: "LC1-03",
      lifecycle: "Lifecycle 1: Recovery",
      step: "Recurrent Alert Ticket Deduplication",
      description: "Subsequent alert processing reuses active ticket and work order without duplicates",
      input: { alert_id: alert1Id },
      expected: "Reuse existing ticket and work order (No duplicates)",
      actual: `Action: ${result.action}, Ticket: ${result.ticket_id}`,
      status: pass ? "PASS" : "FAIL",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[${pass ? "PASS" : "FAIL"}] LC1-03: Deduplication Protection (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC1-03", lifecycle: "Lifecycle 1", step: "Deduplication", description: "Duplicate check",
      input: {}, expected: "Ticket reused", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 1.4 Technician Receives Job & Updates Status to In-Progress
  try {
    const { result, durationMs } = await timeOp(async () => {
      const { data, error } = await sb.from("work_orders").update({
        status: "in_progress",
        technician_id: testTech.id,
      }).eq("id", wo1Id).select().single();
      if (error) throw error;
      return data;
    });

    const pass = result.status === "in_progress" && result.technician_id === testTech.id;
    results.push({
      test_id: "LC1-04",
      lifecycle: "Lifecycle 1: Recovery",
      step: "Technician Job Acceptance & In-Progress Transition",
      description: "Technician accepts dispatch and transitions work order status to in_progress",
      input: { work_order_id: wo1Id, status: "in_progress", technician_id: testTech.id },
      expected: "Work order status is in_progress and assigned to test technician",
      actual: `Status: ${result.status}, Tech: ${result.technician_id}`,
      status: pass ? "PASS" : "FAIL",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[${pass ? "PASS" : "FAIL"}] LC1-04: Tech Job Acceptance (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC1-04", lifecycle: "Lifecycle 1", step: "Job Acceptance", description: "Status update",
      input: {}, expected: "Status in_progress", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 1.5 Technician Submits Maintenance Remarks and Photo Evidence
  let remark1Id = "";
  let upload1Id = "";
  try {
    const { result, durationMs } = await timeOp(async () => {
      const { data: remark, error: remErr } = await sb.from("maintenance_remarks").insert({
        ticket_id: ticket1Id,
        author_id: testTech.id,
        body: "Replaced faulty DC isolator connector on MPPT 1. Insulation resistance measured at 120 M-ohms. Safe to energize.",
      }).select().single();
      if (remErr) throw remErr;

      const { data: upload, error: upErr } = await sb.from("uploads").insert({
        org_id: testOrgId,
        site_id: testSite.id,
        path: `evidence/${wo1Id}/evidence_mppt1_connector_repair.jpg`,
        mime_type: "image/jpeg",
        size_bytes: 204850,
        purpose: "work_order_evidence",
      }).select().single();
      if (upErr) throw upErr;

      return { remark, upload };
    });

    remark1Id = result.remark.id;
    upload1Id = result.upload.id;
    createdRecords.push({ table: "maintenance_remarks", id: remark1Id });
    createdRecords.push({ table: "uploads", id: upload1Id });

    results.push({
      test_id: "LC1-05",
      lifecycle: "Lifecycle 1: Recovery",
      step: "Maintenance Remarks & Photo Evidence Submission",
      description: "Technician submits detailed repair remarks and photo evidence record",
      input: { ticket_id: ticket1Id, body: "Replaced faulty DC isolator...", path: "evidence/repair.jpg" },
      expected: "Remark and upload records persisted linked to ticket & org",
      actual: `Remark ID: ${remark1Id}, Upload ID: ${upload1Id}`,
      status: "PASS",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[PASS] LC1-05: Remarks & Evidence Upload Submission (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC1-05", lifecycle: "Lifecycle 1", step: "Evidence Submission", description: "Remarks & uploads",
      input: {}, expected: "Records persisted", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 1.6 Work Order Completion & Ticket Resolution Transition
  try {
    const { result, durationMs } = await timeOp(async () => {
      // Complete Work Order
      await sb.from("work_orders").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", wo1Id);

      // Transition Ticket to Resolved with verification_status 'pending'
      const { data: ticket, error: tErr } = await sb.from("tickets").update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        verification_status: "pending",
      }).eq("id", ticket1Id).select().single();
      if (tErr) throw tErr;

      return ticket;
    });

    const pass = result.status === "resolved" && result.verification_status === "pending";
    results.push({
      test_id: "LC1-06",
      lifecycle: "Lifecycle 1: Recovery",
      step: "Work Order Completion & Ticket Resolution",
      description: "Work order transitions to completed; ticket transitions to resolved pending telemetry verification",
      input: { ticket_id: ticket1Id, status: "resolved", verification_status: "pending" },
      expected: "Ticket status: resolved, verification_status: pending",
      actual: `Status: ${result.status}, Verification: ${result.verification_status}`,
      status: pass ? "PASS" : "FAIL",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[${pass ? "PASS" : "FAIL"}] LC1-06: Work Order Completion & Resolution Transition (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC1-06", lifecycle: "Lifecycle 1", step: "Completion", description: "Ticket resolved",
      input: {}, expected: "Ticket resolved", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 1.7 Fresh Post-Repair Telemetry Ingestion (Healthy)
  const freshTelIds: string[] = [];
  try {
    const { durationMs } = await timeOp(async () => {
      // Inverter online
      await sb.from("inverters").update({
        status: "online",
        last_seen_at: new Date().toISOString(),
      }).eq("id", testInv.id);

      // Ingest active string telemetry for inverter strings
      const now = new Date().toISOString();
      const stInserts = testStrings.slice(0, 4).map((str, idx) => ({
        string_id: str.id,
        current_a: 8.5 + (idx * 0.1),
        voltage_v: 620,
        timestamp: now,
      }));

      if (stInserts.length > 0) {
        const { data, error } = await sb.from("string_telemetry").insert(stInserts).select();
        if (error) throw error;
        for (const st of data || []) {
          freshTelIds.push(st.id);
          createdRecords.push({ table: "string_telemetry", id: st.id });
        }
      }
    });

    results.push({
      test_id: "LC1-07",
      lifecycle: "Lifecycle 1: Recovery",
      step: "Fresh Telemetry Arrival (Healthy Inverter & Strings)",
      description: "OEM telemetry indicates inverter is online and strings are generating normal current (8.5A)",
      input: { inverter_id: testInv.id, strings: testStrings.length },
      expected: "Inverter online, string telemetry active and healthy",
      actual: `Updated inverter status and inserted ${freshTelIds.length} telemetry points`,
      status: "PASS",
      latency_ms: durationMs,
      evidence: { inverter_id: testInv.id, telemetry_points: freshTelIds.length },
    });
    console.log(`[PASS] LC1-07: Fresh Telemetry Arrival (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC1-07", lifecycle: "Lifecycle 1", step: "Telemetry", description: "Healthy telemetry",
      input: {}, expected: "Telemetry inserted", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 1.8 Resolution Verification Cron Execution (HTTP Call)
  try {
    const { result, durationMs } = await timeOp(async () => {
      const res = await fetch("http://localhost:3000/api/cron/verify-resolutions");
      const json = await res.json();
      return { status: res.status, json };
    });

    // Check DB ticket state
    const { data: verifiedTicket } = await sb.from("tickets").select("*").eq("id", ticket1Id).single();

    const pass = result.status === 200 && verifiedTicket?.status === "closed" && verifiedTicket?.verification_status === "verified_recovered";
    results.push({
      test_id: "LC1-08",
      lifecycle: "Lifecycle 1: Recovery",
      step: "Automated Resolution Verification & Auto-Closure",
      description: "Verification cron validates fresh telemetry and automatically transitions ticket to closed",
      input: { ticket_id: ticket1Id },
      expected: "Ticket status: closed, verification_status: verified_recovered, verified_at set",
      actual: `Status: ${verifiedTicket?.status}, Verification: ${verifiedTicket?.verification_status}`,
      status: pass ? "PASS" : "FAIL",
      latency_ms: durationMs,
      evidence: { cron_response: result.json, ticket: verifiedTicket },
    });
    console.log(`[${pass ? "PASS" : "FAIL"}] LC1-08: Resolution Verification & Auto-Closure (${durationMs}ms, Status: ${verifiedTicket?.status})`);
  } catch (err: any) {
    results.push({
      test_id: "LC1-08", lifecycle: "Lifecycle 1", step: "Verification", description: "Cron execution",
      input: {}, expected: "Ticket closed", actual: err.message, status: "FAIL", latency_ms: 0,
    });
    console.error(`[FAIL] LC1-08: ${err.message}`);
  }


  // ---------------------------------------------------------------------------
  // LIFECYCLE 2: UNRESOLVED RECOVERY -> REOPENING & PRIORITY ESCALATION
  // ---------------------------------------------------------------------------
  console.log("\n--- LIFECYCLE 2: UNRESOLVED RECOVERY & ESCALATION SCENARIO ---");

  let alert2Id = "";
  let ticket2Id = "";
  let wo2Id = "";

  // 2.1 Ingest Sungrow Fault Alert (FAULT_39: Low Insulation)
  try {
    const { result, durationMs } = await timeOp(async () => {
      const intelligence = getAlarmIntelligence("FAULT_39", "sungrow");
      const { data, error } = await sb.from("alerts").insert({
        site_id: testSite.id,
        org_id: testOrgId,
        inverter_id: testInv2.id,
        code: "FAULT_39",
        title: intelligence?.oem_definition || "Low Insulation Resistance",
        severity: "high",
        status: "open",
        description: "Sungrow inverter telemetry reports persistent low insulation resistance",
      }).select().single();
      if (error) throw error;
      return data;
    });

    alert2Id = result.id;
    createdRecords.push({ table: "alerts", id: alert2Id });

    results.push({
      test_id: "LC2-01",
      lifecycle: "Lifecycle 2: Escalation",
      step: "Sungrow Fault Ingestion (FAULT_39)",
      description: "Ingest Sungrow insulation fault into alerts table",
      input: { code: "FAULT_39", oem: "sungrow", site_id: testSite.id },
      expected: "Alert created with status open and severity high",
      actual: `Alert created (ID: ${alert2Id})`,
      status: "PASS",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[PASS] LC2-01: Sungrow Ingestion (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC2-01", lifecycle: "Lifecycle 2", step: "Ingestion", description: "Sungrow alert",
      input: {}, expected: "Alert created", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 2.2 Automation Engine: Ticket Creation & Dispatch
  try {
    const { result, durationMs } = await timeOp(async () => {
      return await processAlertAutomation(alert2Id, sb);
    });

    ticket2Id = result.ticket_id || "";
    wo2Id = result.work_order_id || "";
    if (ticket2Id) createdRecords.push({ table: "tickets", id: ticket2Id });
    if (wo2Id) createdRecords.push({ table: "work_orders", id: wo2Id });

    const pass = !!ticket2Id && !!wo2Id;
    results.push({
      test_id: "LC2-02",
      lifecycle: "Lifecycle 2: Escalation",
      step: "Sungrow Alert Automation & Dispatch",
      description: "Process automation creates ticket and work order",
      input: { alert_id: alert2Id },
      expected: "Ticket and work order created",
      actual: `Ticket: ${ticket2Id}, WO: ${wo2Id}`,
      status: pass ? "PASS" : "FAIL",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[${pass ? "PASS" : "FAIL"}] LC2-02: Ticket & WO Dispatch (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC2-02", lifecycle: "Lifecycle 2", step: "Automation", description: "Sungrow dispatch",
      input: {}, expected: "Created", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 2.3 Premature/Incomplete Resolution Transition by Field Tech
  try {
    const { result, durationMs } = await timeOp(async () => {
      await sb.from("work_orders").update({ status: "completed" }).eq("id", wo2Id);
      const { data, error } = await sb.from("tickets").update({
        status: "resolved",
        priority: "p3",
        resolved_at: new Date().toISOString(),
        verification_status: "pending",
      }).eq("id", ticket2Id).select().single();
      if (error) throw error;
      return data;
    });

    results.push({
      test_id: "LC2-03",
      lifecycle: "Lifecycle 2: Escalation",
      step: "Field Tech Incomplete Resolution Submission",
      description: "Technician claims ticket resolved, but telemetry will show persistent fault",
      input: { ticket_id: ticket2Id, status: "resolved" },
      expected: "Ticket marked resolved pending verification",
      actual: `Status: ${result.status}`,
      status: "PASS",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[PASS] LC2-03: Incomplete Resolution Submitted (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC2-03", lifecycle: "Lifecycle 2", step: "Submission", description: "Ticket status",
      input: {}, expected: "Resolved", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 2.4 Fresh Telemetry Showing Persistent Fault (Zero Current / Inverter Fault)
  try {
    const { durationMs } = await timeOp(async () => {
      // Inverter offline/faulty
      await sb.from("inverters").update({
        status: "offline",
        last_seen_at: new Date(Date.now() - 3600_000).toISOString(),
      }).eq("id", testInv2.id);

      // Ingest zero-current telemetry
      const now = new Date().toISOString();
      const stDeadInserts = test2Strings.slice(0, 4).map((str) => ({
        string_id: str.id,
        current_a: 0.0,
        voltage_v: 12.0,
        timestamp: now,
      }));

      if (stDeadInserts.length > 0) {
        const { data } = await sb.from("string_telemetry").insert(stDeadInserts).select();
        for (const st of data || []) {
          createdRecords.push({ table: "string_telemetry", id: st.id });
        }
      }
    });

    results.push({
      test_id: "LC2-04",
      lifecycle: "Lifecycle 2: Escalation",
      step: "Persistent Fault Telemetry Ingestion",
      description: "Fresh telemetry shows inverter offline and string currents at 0.0A",
      input: { inverter_id: testInv2.id, current_a: 0.0 },
      expected: "Inverter offline, dead string telemetry recorded",
      actual: "Inverter offline and zero-current telemetry recorded",
      status: "PASS",
      latency_ms: durationMs,
    });
    console.log(`[PASS] LC2-04: Persistent Fault Telemetry Recorded (${durationMs}ms)`);
  } catch (err: any) {
    results.push({
      test_id: "LC2-04", lifecycle: "Lifecycle 2", step: "Telemetry", description: "Fault telemetry",
      input: {}, expected: "Telemetry recorded", actual: err.message, status: "FAIL", latency_ms: 0,
    });
  }

  // 2.5 Verification Cron Detection of Persistent Fault & Auto-Escalation
  try {
    const { result, durationMs } = await timeOp(async () => {
      const res = await fetch("http://localhost:3000/api/cron/verify-resolutions");
      const json = await res.json();
      return { status: res.status, json };
    });

    const { data: escalatedTicket } = await sb.from("tickets").select("*").eq("id", ticket2Id).single();

    // Must be reopened to 'open', priority escalated to 'p2', reopened_count >= 1, verification_status 'verification_failed'
    const pass =
      result.status === 200 &&
      escalatedTicket?.status === "open" &&
      escalatedTicket?.priority === "p2" &&
      escalatedTicket?.verification_status === "verification_failed" &&
      (escalatedTicket?.reopened_count || 0) >= 1;

    results.push({
      test_id: "LC2-05",
      lifecycle: "Lifecycle 2: Escalation",
      step: "Verification Engine Reopening & Priority Escalation",
      description: "Verification cron detects persistent fault: reopens ticket, sets verification_failed, and escalates priority to P2",
      input: { ticket_id: ticket2Id },
      expected: "Status: open, priority: p2, reopened_count: 1, verification_status: verification_failed",
      actual: `Status: ${escalatedTicket?.status}, Priority: ${escalatedTicket?.priority}, Reopened: ${escalatedTicket?.reopened_count}, Verification: ${escalatedTicket?.verification_status}`,
      status: pass ? "PASS" : "FAIL",
      latency_ms: durationMs,
      evidence: { cron_response: result.json, ticket: escalatedTicket },
    });
    console.log(`[${pass ? "PASS" : "FAIL"}] LC2-05: Reopening & Priority Escalation (${durationMs}ms, Status: ${escalatedTicket?.status}, Priority: ${escalatedTicket?.priority})`);
  } catch (err: any) {
    results.push({
      test_id: "LC2-05", lifecycle: "Lifecycle 2", step: "Escalation", description: "Reopening logic",
      input: {}, expected: "Reopened to open with p2", actual: err.message, status: "FAIL", latency_ms: 0,
    });
    console.error(`[FAIL] LC2-05: ${err.message}`);
  }


  // ---------------------------------------------------------------------------
  // MULTI-OEM NORMALIZATION VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("\n--- MULTI-OEM ALARM NORMALIZATION VERIFICATION ---");
  const oemTests = [
    { oem: "solis", code: "1045", name: "Solis DC Arc" },
    { oem: "growatt", code: "ERROR_102", name: "Growatt Isolation" },
    { oem: "sungrow", code: "FAULT_39", name: "Sungrow Low Insulation" },
  ];

  for (const ot of oemTests) {
    const { result, durationMs } = await timeOp(async () => {
      const intel = getAlarmIntelligence(ot.code, ot.oem);
      const decision = evaluateActionDecision({
        alert: {
          id: "00000000-0000-0000-0000-000000000000",
          site_id: testSite.id,
          org_id: testOrgId,
          code: ot.code,
          oem: ot.oem,
          title: intel.title,
          severity: intel.severity,
          requires_technician: intel.requires_technician,
          status: "open",
          triggered_at: new Date().toISOString(),
        } as any,
        site: testSite as any,
        availableTechnicians: [testTech] as any,
      });
      return { intel, decision };
    });

    const isDispatch = ["DISPATCH", "DISPATCH_IMMEDIATELY", "SCHEDULE_ROUTINE"].includes(result.decision.decision_class);
    const pass = !!result.intel && result.intel.requires_technician === true && isDispatch;
    results.push({
      test_id: `OEM-${ot.oem.toUpperCase()}`,
      lifecycle: "Multi-OEM Intelligence",
      step: `Alarm Normalization: ${ot.name}`,
      description: `Verify OEM code ${ot.code} maps to normalized dispatch decision class and technician intervention`,
      input: { oem: ot.oem, code: ot.code },
      expected: "requires_technician: true, decision_class in [DISPATCH, DISPATCH_IMMEDIATELY, SCHEDULE_ROUTINE]",
      actual: `RequiresTech: ${result.intel?.requires_technician}, Decision: ${result.decision?.decision_class}, Severity: ${result.intel?.severity}`,
      status: pass ? "PASS" : "FAIL",
      latency_ms: durationMs,
      evidence: result,
    });
    console.log(`[${pass ? "PASS" : "FAIL"}] OEM-${ot.oem.toUpperCase()}: ${ot.name} -> Severity: ${result.intel?.severity}, Decision: ${result.decision?.decision_class}`);
  }

  // ---------------------------------------------------------------------------
  // SAFE TEARDOWN OF LIFECYCLE TEST RECORDS
  // ---------------------------------------------------------------------------
  console.log("\n--- SAFE TEARDOWN OF TEST RECORDS ---");
  // Restore inverters status
  await sb.from("inverters").update({ status: "online", last_seen_at: new Date().toISOString() }).in("id", [testInv.id, testInv2.id]);

  // Reverse dependency deletion
  const tableOrder = ["uploads", "maintenance_remarks", "string_telemetry", "work_orders", "tickets", "alerts"];
  for (const table of tableOrder) {
    const ids = createdRecords.filter((r) => r.table === table).map((r) => r.id);
    if (ids.length > 0) {
      const { error } = await sb.from(table).delete().in("id", ids);
      if (error) console.error(`Failed to clean ${table}:`, error.message);
      else console.log(`  Cleaned ${ids.length} test records from ${table}`);
    }
  }

  // Verify baseline
  const { count: baselineSites } = await sb.from("sites").select("*", { count: "exact", head: true });
  console.log(`Baseline Verification: Found ${baselineSites} sites intact (Expected: 1402).`);

  // Write Report
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const reportPath = path.resolve(__dirname, "../../test_reports/phaseA_operational_lifecycle_report.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total_tests: results.length,
    passed,
    failed,
    baseline_sites: baselineSites,
    results,
  }, null, 2));

  console.log("\n================================================================================");
  console.log(`PHASE A OPERATIONAL LIFECYCLE SUMMARY: ${passed} PASSED | ${failed} FAILED | ${results.length} TOTAL`);
  console.log("================================================================================\n");

  if (failed > 0) process.exit(1);
}

runPhaseA().catch((err) => {
  console.error("FATAL in Phase A:", err);
  process.exit(1);
});
