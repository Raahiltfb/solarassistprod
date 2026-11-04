/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SolarAssist Phase 8: Stage 3 Operational Workflows & Multi-OEM Simulation
 * 
 * Objectives:
 * 1. Test Unified Decision Engine across 3 OEMs (Solis, Growatt, Sungrow)
 *    - Equivalent faults produce consistent normalized outputs
 *    - Distinct faults are not incorrectly grouped
 *    - Unknown codes produce graceful fallback
 * 2. Multi-Tenant Fault Injections across SolarAssist, EPC A, and EPC B
 * 3. Operational Workflows:
 *    - Alert generation & ingestion
 *    - Automated ticket creation & priority mapping (p1/p2/p3)
 *    - Ticket deduplication on recurrent/duplicate alerts
 *    - Technician dispatch & tenant-scoped assignment
 *    - Field guidance embedding
 *    - Successful repair workflow (telemetry recovery, evidence remarks, ticket closure)
 *    - Unsuccessful repair scenario (persistent fault, on-hold escalation, remarks)
 * 4. Multi-Tenant Isolation verification during live operations
 * 5. Full Manifest tracking (appended to sim_manifest_stage3.json + backup)
 * 6. Baseline integrity verification (zero baseline mutations)
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";
import { SEED_IDS } from "./seed";
import { getAlarmIntelligence } from "../lib/automation/alarm-intelligence";
import { evaluateActionDecision } from "../lib/automation/decision-engine";
import { processAlertAutomation } from "../lib/automation/engine";

const TARGET_URL = process.env.TEST_SUPABASE_URL || "";
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || "";

verifyTestEnvironmentSafety(TARGET_URL, true);

if (!TARGET_URL.includes(STAGING_PROJECT_REF)) {
  console.error(`FATAL: URL does not match staging ref: ${STAGING_PROJECT_REF}`);
  process.exit(1);
}

const sbAdmin = createClient(TARGET_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log("========================================================================");
  console.log("SOLARASSIST STAGE 3: OPERATIONAL WORKFLOWS & MULTI-OEM SIMULATION");
  console.log(`Target: ${TARGET_URL} (Staging: ${STAGING_PROJECT_REF})`);
  console.log("========================================================================\n");

  const stage3Report: {
    section: string;
    status: "PASS" | "FAIL";
    evidence: any;
    issues: string[];
  }[] = [];

  // ---------------------------------------------------------------------------
  // STEP 0: INITIALIZE MANIFEST TRACKING & RESOLVE MEMBERSHIP DISCREPANCY
  // ---------------------------------------------------------------------------
  console.log("--- 0. MANIFEST PREPARATION & MEMBERSHIP TRACKING ---");
  const stage2ManifestPath = path.resolve(__dirname, "../../test_reports/sim_manifest_stage2.json");
  const stage2Raw = fs.readFileSync(stage2ManifestPath, "utf-8");
  const manifest = JSON.parse(stage2Raw);

  const newRecords: any[] = [];
  const ownershipTag = "phase8-sim-1400";

  // Discrepancy 2 Resolution: Explicitly track the 4 simulation technician_team_members
  const simTeamMemberIds = [
    { id: "5ea4c6e8-86c4-4040-8345-37b007fddbaa", org_id: "e0000000-000a-4000-a000-000000000001", team: "EPC A Team Alpha" },
    { id: "e2348602-cc54-4413-a7f8-4f7a91429eff", org_id: "e0000000-000a-4000-a000-000000000001", team: "EPC A Team Beta" },
    { id: "2e3269ff-b4dd-4b63-90cd-2341cff4e1a5", org_id: "e0000000-000b-4000-a000-000000000001", team: "EPC B Team Alpha" },
    { id: "3ce138e0-d9cd-4656-b480-c99488944b91", org_id: "e0000000-000b-4000-a000-000000000001", team: "EPC B Team Beta" },
  ];

  for (const tm of simTeamMemberIds) {
    newRecords.push({
      table: "technician_team_members",
      id: tm.id,
      org_id: tm.org_id,
      tag: ownershipTag,
    });
  }
  console.log(`• Added ${simTeamMemberIds.length} simulation technician_team_members records to manifest tracking.`);

  // ---------------------------------------------------------------------------
  // STEP 1: MULTI-OEM NORMALISATION & SHARED DECISION ENGINE TESTS
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. MULTI-OEM NORMALISATION & UNIFIED DECISION ENGINE ---");
  const sec1Issues: string[] = [];

  // 1A. Equivalent Faults Test across Solis, Growatt, Sungrow
  const solisIso = getAlarmIntelligence("1045", "solis");
  const growattIso = getAlarmIntelligence("ERROR_102", "growatt");
  const sungrowIso = getAlarmIntelligence("FAULT_39", "sungrow");

  console.log("• Equivalent Fault Normalisation (PV Isolation Low):");
  console.log(`   - Solis (1045)     : Title="${solisIso.title}", Cat=${solisIso.category}, Sev=${solisIso.severity}, TechReq=${solisIso.requires_technician}`);
  console.log(`   - Growatt (ERR_102): Title="${growattIso.title}", Cat=${growattIso.category}, Sev=${growattIso.severity}, TechReq=${growattIso.requires_technician}`);
  console.log(`   - Sungrow (FLT_39) : Title="${sungrowIso.title}", Cat=${sungrowIso.category}, Sev=${sungrowIso.severity}, TechReq=${sungrowIso.requires_technician}`);

  if (solisIso.title !== "Isolation Fault (ISO-F)" || growattIso.title !== "Isolation Fault (ISO-F)" || sungrowIso.title !== "Isolation Fault (ISO-F)") {
    sec1Issues.push("Titles across equivalent OEM isolation faults do not match normalized standard");
  }
  if (solisIso.severity !== "critical" || growattIso.severity !== "critical" || sungrowIso.severity !== "critical") {
    sec1Issues.push("Severities across equivalent OEM isolation faults are not consistent (expected critical)");
  }
  if (solisIso.category !== "pv" || growattIso.category !== "pv" || sungrowIso.category !== "pv") {
    sec1Issues.push("Categories across equivalent OEM isolation faults are not consistent (expected pv)");
  }

  // Evaluate Decision Engine Action for all 3
  const dummySite = { id: "test-site", name: "Sim Site", capacity_kwp: 200, latitude: 19.076, longitude: 72.877 };
  const dSolis = evaluateActionDecision({
    alert: { code: "1045", alarm_code: "1045", title: solisIso.title, severity: solisIso.severity, oem: "solis", requires_technician: true } as any,
    site: dummySite as any,
  });
  const dGrowatt = evaluateActionDecision({
    alert: { code: "ERROR_102", alarm_code: "ERROR_102", title: growattIso.title, severity: growattIso.severity, oem: "growatt", requires_technician: true } as any,
    site: dummySite as any,
  });
  const dSungrow = evaluateActionDecision({
    alert: { code: "FAULT_39", alarm_code: "FAULT_39", title: sungrowIso.title, severity: sungrowIso.severity, oem: "sungrow", requires_technician: true } as any,
    site: dummySite as any,
  });

  console.log(`   - Decision Solis   : ${dSolis.decision_class} (Confidence: ${dSolis.confidence_pct}%)`);
  console.log(`   - Decision Growatt : ${dGrowatt.decision_class} (Confidence: ${dGrowatt.confidence_pct}%)`);
  console.log(`   - Decision Sungrow : ${dSungrow.decision_class} (Confidence: ${dSungrow.confidence_pct}%)`);

  if (dSolis.decision_class !== "DISPATCH_IMMEDIATELY" || dGrowatt.decision_class !== "DISPATCH_IMMEDIATELY" || dSungrow.decision_class !== "DISPATCH_IMMEDIATELY") {
    sec1Issues.push("Decision engine produced inconsistent action for equivalent isolation faults across OEMs");
  }

  // 1B. Distinct Faults Test (Ensure distinct codes are not grouped together)
  const solisOvertemp = getAlarmIntelligence("1021", "solis");
  const growattFreq = getAlarmIntelligence("ERROR_101", "growatt");
  const sungrowRev = getAlarmIntelligence("FAULT_43", "sungrow");

  console.log("• Distinct Faults Differentiation:");
  console.log(`   - Solis (1021)     : Title="${solisOvertemp.title}", Cat=${solisOvertemp.category}, Sev=${solisOvertemp.severity}`);
  console.log(`   - Growatt (ERR_101): Title="${growattFreq.title}", Cat=${growattFreq.category}, Sev=${growattFreq.severity}`);
  console.log(`   - Sungrow (FLT_43) : Title="${sungrowRev.title}", Cat=${sungrowRev.category}, Sev=${sungrowRev.severity}`);

  if (solisOvertemp.title === growattFreq.title || growattFreq.title === sungrowRev.title) {
    sec1Issues.push("Distinct faults were incorrectly grouped into the same title");
  }

  // 1C. Unknown Codes & Graceful Fallback Test
  const unkSolis = getAlarmIntelligence("UNKNOWN_9999", "solis");
  const unkGrowatt = getAlarmIntelligence("ERR_UNKNOWN_999", "growatt");
  const unkSungrow = getAlarmIntelligence("FAULT_999", "sungrow");

  console.log("• Unknown OEM Code Graceful Fallback:");
  console.log(`   - Unknown Solis   : Title="${unkSolis.title}", SyntheticFallback=${unkSolis.is_synthetic_fallback}, Steps=${unkSolis.general_field_guidance.length}`);
  console.log(`   - Unknown Growatt : Title="${unkGrowatt.title}", SyntheticFallback=${unkGrowatt.is_synthetic_fallback}, Steps=${unkGrowatt.general_field_guidance.length}`);
  console.log(`   - Unknown Sungrow : Title="${unkSungrow.title}", SyntheticFallback=${unkSungrow.is_synthetic_fallback}, Steps=${unkSungrow.general_field_guidance.length}`);

  if (!unkSolis.is_synthetic_fallback || !unkGrowatt.is_synthetic_fallback || !unkSungrow.is_synthetic_fallback) {
    sec1Issues.push("Unknown codes did not flag is_synthetic_fallback: true");
  }
  if (unkSolis.general_field_guidance.length !== 4) {
    sec1Issues.push("Unknown code fallback missing 4-phase field guidance");
  }

  stage3Report.push({
    section: "1. MULTI-OEM NORMALISATION & UNIFIED DECISION ENGINE",
    status: sec1Issues.length === 0 ? "PASS" : "FAIL",
    evidence: {
      equivalent_faults: {
        solis: { code: "1045", title: solisIso.title, decision: dSolis.decision_class },
        growatt: { code: "ERROR_102", title: growattIso.title, decision: dGrowatt.decision_class },
        sungrow: { code: "FAULT_39", title: sungrowIso.title, decision: dSungrow.decision_class },
      },
      distinct_faults: {
        solis_overtemp: solisOvertemp.title,
        growatt_freq: growattFreq.title,
        sungrow_reverse_polarity: sungrowRev.title,
      },
      unknown_fallback: {
        solis_unknown: unkSolis.title,
        growatt_unknown: unkGrowatt.title,
        sungrow_unknown: unkSungrow.title,
      },
    },
    issues: sec1Issues,
  });

  // ---------------------------------------------------------------------------
  // STEP 2: MULTI-TENANT OPERATIONAL FAULT INJECTIONS
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. MULTI-TENANT FAULT INJECTIONS ACROSS ORGANISATIONS ---");
  const sec2Issues: string[] = [];

  const saOrgId = SEED_IDS.orgs.solarassist;
  const epcaOrgId = "e0000000-000a-4000-a000-000000000001";
  const epcbOrgId = "e0000000-000b-4000-a000-000000000001";

  // Select simulation sites and inverters per tenant and OEM
  const { data: saSites } = await sbAdmin.from("sites").select("id, name, org_id").eq("org_id", saOrgId).not("id", "in", `(${Object.values(SEED_IDS.sites).join(",")})`).limit(10);
  const { data: epcaSites } = await sbAdmin.from("sites").select("id, name, org_id").eq("org_id", epcaOrgId).limit(10);
  const { data: epcbSites } = await sbAdmin.from("sites").select("id, name, org_id").eq("org_id", epcbOrgId).limit(10);

  const saSiteIds = saSites!.map((s) => s.id);
  const epcaSiteIds = epcaSites!.map((s) => s.id);
  const epcbSiteIds = epcbSites!.map((s) => s.id);

  const { data: saInv } = await sbAdmin
    .from("inverters")
    .select("id, site_id, oem, model")
    .in("site_id", saSiteIds)
    .eq("oem", "solis")
    .limit(1)
    .single();

  const { data: epcaInv } = await sbAdmin
    .from("inverters")
    .select("id, site_id, oem, model")
    .in("site_id", epcaSiteIds)
    .eq("oem", "growatt")
    .limit(1)
    .single();

  const { data: epcbInv } = await sbAdmin
    .from("inverters")
    .select("id, site_id, oem, model")
    .in("site_id", epcbSiteIds)
    .eq("oem", "sungrow")
    .limit(1)
    .single();

  const saSite = saSites!.find((s) => s.id === saInv!.site_id);
  const epcaSite = epcaSites!.find((s) => s.id === epcaInv!.site_id);
  const epcbSite = epcbSites!.find((s) => s.id === epcbInv!.site_id);

  console.log(`• SolarAssist Inverter : ${saInv?.id} (OEM: ${saInv?.oem}, Site: ${saSite?.name})`);
  console.log(`• EPC A Inverter       : ${epcaInv?.id} (OEM: ${epcaInv?.oem}, Site: ${epcaSite?.name})`);
  console.log(`• EPC B Inverter       : ${epcbInv?.id} (OEM: ${epcbInv?.oem}, Site: ${epcbSite?.name})`);

  // Inject Alerts
  // Alert 1: SolarAssist Solis Isolation Fault
  const alert1Payload = {
    org_id: saOrgId,
    site_id: saSite!.id,
    inverter_id: saInv?.id,
    code: "1045",
    title: solisIso.title,
    description: solisIso.description,
    severity: "critical" as const,
    status: "open" as const,
  };
  const { data: alert1, error: a1Err } = await sbAdmin.from("alerts").insert(alert1Payload).select().single();
  if (a1Err) sec2Issues.push(`Failed to insert Alert 1: ${a1Err.message}`);
  else newRecords.push({ table: "alerts", id: alert1.id, org_id: saOrgId, tag: ownershipTag });

  // Alert 2: EPC A Growatt Isolation Fault
  const alert2Payload = {
    org_id: epcaOrgId,
    site_id: epcaSite!.id,
    inverter_id: epcaInv?.id,
    code: "ERROR_102",
    title: growattIso.title,
    description: growattIso.description,
    severity: "critical" as const,
    status: "open" as const,
  };
  const { data: alert2, error: a2Err } = await sbAdmin.from("alerts").insert(alert2Payload).select().single();
  if (a2Err) sec2Issues.push(`Failed to insert Alert 2: ${a2Err.message}`);
  else newRecords.push({ table: "alerts", id: alert2.id, org_id: epcaOrgId, tag: ownershipTag });

  // Alert 3: EPC B Sungrow Isolation Fault
  const alert3Payload = {
    org_id: epcbOrgId,
    site_id: epcbSite!.id,
    inverter_id: epcbInv?.id,
    code: "FAULT_39",
    title: sungrowIso.title,
    description: sungrowIso.description,
    severity: "critical" as const,
    status: "open" as const,
  };
  const { data: alert3, error: a3Err } = await sbAdmin.from("alerts").insert(alert3Payload).select().single();
  if (a3Err) sec2Issues.push(`Failed to insert Alert 3: ${a3Err.message}`);
  else newRecords.push({ table: "alerts", id: alert3.id, org_id: epcbOrgId, tag: ownershipTag });

  // Alert 4: EPC A Secondary Overtemperature Alert
  const alert4Payload = {
    org_id: epcaOrgId,
    site_id: epcaSite!.id,
    inverter_id: epcaInv?.id,
    code: "ERROR_108",
    title: "Inverter Overtemperature",
    description: "Inverter internal heatsink temperature exceeded thermal threshold.",
    severity: "high" as const,
    status: "open" as const,
  };
  const { data: alert4, error: a4Err } = await sbAdmin.from("alerts").insert(alert4Payload).select().single();
  if (a4Err) sec2Issues.push(`Failed to insert Alert 4: ${a4Err.message}`);
  else newRecords.push({ table: "alerts", id: alert4.id, org_id: epcaOrgId, tag: ownershipTag });

  // Alert 5: SolarAssist Unknown Code Fallback Alert
  const alert5Payload = {
    org_id: saOrgId,
    site_id: saSite!.id,
    inverter_id: saInv?.id,
    code: "UNKNOWN_9999",
    title: unkSolis.title,
    description: unkSolis.description,
    severity: "medium" as const,
    status: "open" as const,
  };
  const { data: alert5, error: a5Err } = await sbAdmin.from("alerts").insert(alert5Payload).select().single();
  if (a5Err) sec2Issues.push(`Failed to insert Alert 5: ${a5Err.message}`);
  else newRecords.push({ table: "alerts", id: alert5.id, org_id: saOrgId, tag: ownershipTag });

  console.log(`• Seeded 5 Operational Alerts across 3 Tenants:`);
  console.log(`   - Alert 1 (SolarAssist / Solis): ${alert1?.id}`);
  console.log(`   - Alert 2 (EPC A / Growatt)   : ${alert2?.id}`);
  console.log(`   - Alert 3 (EPC B / Sungrow)   : ${alert3?.id}`);
  console.log(`   - Alert 4 (EPC A / Overtemp)  : ${alert4?.id}`);
  console.log(`   - Alert 5 (SolarAssist / Unk) : ${alert5?.id}`);

  stage3Report.push({
    section: "2. MULTI-TENANT FAULT INJECTIONS",
    status: sec2Issues.length === 0 ? "PASS" : "FAIL",
    evidence: {
      alert1_id: alert1?.id,
      alert2_id: alert2?.id,
      alert3_id: alert3?.id,
      alert4_id: alert4?.id,
      alert5_id: alert5?.id,
    },
    issues: sec2Issues,
  });

  // ---------------------------------------------------------------------------
  // STEP 3: AUTOMATED DECISION ENGINE PROCESSING & DEDUPLICATION
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. AUTOMATION ENGINE: TICKET GENERATION & DEDUPLICATION ---");
  const sec3Issues: string[] = [];

  // Fetch tenant technicians for dispatch testing
  const { data: saTechs } = await sbAdmin.from("profiles").select("id, full_name, email").eq("org_id", saOrgId).eq("role", "technician");
  const { data: epcaTechs } = await sbAdmin.from("profiles").select("id, full_name, email").eq("org_id", epcaOrgId).eq("role", "technician");
  const { data: epcbTechs } = await sbAdmin.from("profiles").select("id, full_name, email").eq("org_id", epcbOrgId).eq("role", "technician");

  console.log(`• Available Technicians: SolarAssist=${saTechs?.length}, EPC A=${epcaTechs?.length}, EPC B=${epcbTechs?.length}`);

  // Process Alert 1 (SolarAssist)
  const res1 = await processAlertAutomation(alert1.id, sbAdmin);
  console.log(`• Automation Alert 1 -> Ticket: ${res1.ticket_id}, Decision: ${res1.decision_class}, Action: ${res1.action}`);
  if (res1.ticket_id) newRecords.push({ table: "tickets", id: res1.ticket_id, org_id: saOrgId, tag: ownershipTag });
  else sec3Issues.push("Alert 1 failed to generate ticket");

  // Process Alert 2 (EPC A)
  const res2 = await processAlertAutomation(alert2.id, sbAdmin);
  console.log(`• Automation Alert 2 -> Ticket: ${res2.ticket_id}, Decision: ${res2.decision_class}, Action: ${res2.action}`);
  if (res2.ticket_id) newRecords.push({ table: "tickets", id: res2.ticket_id, org_id: epcaOrgId, tag: ownershipTag });
  else sec3Issues.push("Alert 2 failed to generate ticket");

  // Process Alert 3 (EPC B)
  const res3 = await processAlertAutomation(alert3.id, sbAdmin);
  console.log(`• Automation Alert 3 -> Ticket: ${res3.ticket_id}, Decision: ${res3.decision_class}, Action: ${res3.action}`);
  if (res3.ticket_id) newRecords.push({ table: "tickets", id: res3.ticket_id, org_id: epcbOrgId, tag: ownershipTag });
  else sec3Issues.push("Alert 3 failed to generate ticket");

  // Process Alert 4 (EPC A Overtemp)
  const res4 = await processAlertAutomation(alert4.id, sbAdmin);
  console.log(`• Automation Alert 4 -> Ticket: ${res4.ticket_id}, Decision: ${res4.decision_class}, Action: ${res4.action}`);
  if (res4.ticket_id) newRecords.push({ table: "tickets", id: res4.ticket_id, org_id: epcaOrgId, tag: ownershipTag });

  // Process Alert 5 (SolarAssist Unknown Code)
  const res5 = await processAlertAutomation(alert5.id, sbAdmin);
  console.log(`• Automation Alert 5 -> Ticket: ${res5.ticket_id}, Decision: ${res5.decision_class}, Action: ${res5.action}`);
  if (res5.ticket_id) newRecords.push({ table: "tickets", id: res5.ticket_id, org_id: saOrgId, tag: ownershipTag });

  // Verify Priorities
  const { data: t1 } = await sbAdmin.from("tickets").select("priority, title, description").eq("id", res1.ticket_id).single();
  const { data: t4 } = await sbAdmin.from("tickets").select("priority, title, description").eq("id", res4.ticket_id).single();
  const { data: t5 } = await sbAdmin.from("tickets").select("priority, title, description").eq("id", res5.ticket_id).single();

  console.log(`• Priority Verification: Critical Alert -> ${t1?.priority} (Expected: p1), High -> ${t4?.priority} (Expected: p2), Medium -> ${t5?.priority} (Expected: p3)`);
  if (t1?.priority !== "p1") sec3Issues.push(`Ticket 1 priority is ${t1?.priority}, expected p1`);
  if (t4?.priority !== "p2") sec3Issues.push(`Ticket 4 priority is ${t4?.priority}, expected p2`);
  if (t5?.priority !== "p3") sec3Issues.push(`Ticket 5 priority is ${t5?.priority}, expected p3`);

  // Verify Technician Guidance in Ticket Description
  const hasGuidance = t1?.description?.includes("Recommended Action") || t1?.description?.includes("OEM Event");
  console.log(`• Field Guidance embedded in ticket description: ${hasGuidance ? "YES" : "NO"}`);
  if (!hasGuidance) sec3Issues.push("Ticket description lacks OEM field guidance / recommended action");

  // Test Ticket Deduplication: Re-process Alert 2
  console.log("• Testing Ticket Deduplication (re-processing Alert 2 while ticket is open)...");
  const countBefore = (await sbAdmin.from("tickets").select("id", { count: "exact", head: true }).eq("alert_id", alert2.id)).count;
  const res2Dup = await processAlertAutomation(alert2.id, sbAdmin);
  const countAfter = (await sbAdmin.from("tickets").select("id", { count: "exact", head: true }).eq("alert_id", alert2.id)).count;

  console.log(`   - Deduplication Result: Ticket ID returned = ${res2Dup.ticket_id} (Matches original: ${res2Dup.ticket_id === res2.ticket_id})`);
  console.log(`   - Tickets count before: ${countBefore}, count after: ${countAfter} (Delta = ${(countAfter || 0) - (countBefore || 0)})`);
  if (res2Dup.ticket_id !== res2.ticket_id || countAfter !== countBefore) {
    sec3Issues.push("Ticket deduplication failed! Duplicate ticket created for same active alert.");
  }

  stage3Report.push({
    section: "3. AUTOMATION ENGINE: TICKET GENERATION & DEDUPLICATION",
    status: sec3Issues.length === 0 ? "PASS" : "FAIL",
    evidence: {
      tickets_created: [res1.ticket_id, res2.ticket_id, res3.ticket_id, res4.ticket_id, res5.ticket_id],
      priorities: { t1: t1?.priority, t4: t4?.priority, t5: t5?.priority },
      guidance_embedded: hasGuidance,
      deduplication_passed: res2Dup.ticket_id === res2.ticket_id && countAfter === countBefore,
    },
    issues: sec3Issues,
  });

  // ---------------------------------------------------------------------------
  // STEP 4: TECHNICIAN DISPATCH & REPAIR WORKFLOWS (SUCCESS & FAILURE)
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. OPERATIONAL REPAIR WORKFLOWS (SUCCESS & FAILURE) ---");
  const sec4Issues: string[] = [];

  // Assign tickets to tenant-specific technicians
  const epcaTech = epcaTechs![0];
  const epcbTech = epcbTechs![0];

  // 4A. Successful Repair Scenario (EPC A Growatt Inverter - Ticket 2)
  console.log(`• SCENARIO A (SUCCESSFUL REPAIR): EPC A Ticket ${res2.ticket_id}`);
  
  // Step 1: Assign ticket to EPC A technician & set in_progress
  await sbAdmin.from("tickets").update({
    assignee_id: epcaTech.id,
    status: "in_progress",
  }).eq("id", res2.ticket_id);

  // Step 2: Create corresponding Work Order for technician
  const { data: woEpca } = await sbAdmin.from("work_orders").insert({
    org_id: epcaOrgId,
    site_id: epcaSite.id,
    ticket_id: res2.ticket_id,
    technician_id: epcaTech.id,
    title: `[Emergency Repair] ${growattIso.title}`,
    description: `Inspect PV array strings and clear ground isolation fault per Growatt manual.`,
    status: "in_progress",
    scheduled_date: new Date().toISOString().split("T")[0],
    estimated_duration_mins: 90,
  }).select().single();
  if (woEpca) newRecords.push({ table: "work_orders", id: woEpca.id, org_id: epcaOrgId, tag: ownershipTag });

  // Step 3: Technician logs evidence remarks
  const { data: remark1 } = await sbAdmin.from("maintenance_remarks").insert({
    ticket_id: res2.ticket_id,
    author_id: epcaTech.id,
    body: "Inspected DC array cable trays. Discovered moisture ingress inside MC4 connector on String 3. Replaced connector, verified isolation resistance > 150 MΩ with 1000V megger.",
  }).select().single();
  if (remark1) newRecords.push({ table: "maintenance_remarks", id: remark1.id, org_id: epcaOrgId, tag: ownershipTag });

  // Step 4: Post healthy telemetry recovery
  const { data: recovTelem } = await sbAdmin.from("telemetry").insert({
    inverter_id: epcaInv?.id,
    timestamp: new Date().toISOString(),
    ac_power_kw: 94.8,
    dc_power_kw: 97.2,
    energy_kwh: 520.4,
    daily_generation_kwh: 480.2,
    total_generation_kwh: 12500.0,
    efficiency_pct: 97.5,
    temperature_c: 48.2,
    online_status: true,
  }).select().single();
  if (recovTelem) newRecords.push({ table: "telemetry", id: recovTelem.id, org_id: epcaOrgId, tag: ownershipTag });

  // Step 5: Close work order & resolve ticket/alert
  await sbAdmin.from("work_orders").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", woEpca.id);
  await sbAdmin.from("tickets").update({ status: "closed", resolved_at: new Date().toISOString() }).eq("id", res2.ticket_id);
  await sbAdmin.from("alerts").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", alert2.id);

  const { data: closedTicket } = await sbAdmin.from("tickets").select("status, resolved_at").eq("id", res2.ticket_id).single();
  const { data: resolvedAlert } = await sbAdmin.from("alerts").select("status, resolved_at").eq("id", alert2.id).single();

  console.log(`   ✓ Work Order completed: ${woEpca?.id}`);
  console.log(`   ✓ Ticket status updated to: ${closedTicket?.status}`);
  console.log(`   ✓ Alert status updated to : ${resolvedAlert?.status}`);
  if (closedTicket?.status !== "closed" || resolvedAlert?.status !== "resolved") {
    sec4Issues.push("Successful repair scenario failed to close ticket or resolve alert");
  }

  // 4B. Unsuccessful Repair / Escalation Scenario (EPC B Sungrow Inverter - Ticket 3)
  console.log(`\n• SCENARIO B (UNSUCCESSFUL REPAIR / ESCALATION): EPC B Ticket ${res3.ticket_id}`);

  // Step 1: Assign ticket to EPC B technician & set in_progress
  await sbAdmin.from("tickets").update({
    assignee_id: epcbTech.id,
    status: "in_progress",
  }).eq("id", res3.ticket_id);

  // Step 2: Create Work Order
  const { data: woEpcb } = await sbAdmin.from("work_orders").insert({
    org_id: epcbOrgId,
    site_id: epcbSite.id,
    ticket_id: res3.ticket_id,
    technician_id: epcbTech.id,
    title: `[Field Inspection] ${sungrowIso.title}`,
    description: `Diagnose Fault 39 (Low Insulation Resistance) on Sungrow inverter.`,
    status: "in_progress",
    scheduled_date: new Date().toISOString().split("T")[0],
    estimated_duration_mins: 120,
  }).select().single();
  if (woEpcb) newRecords.push({ table: "work_orders", id: woEpcb.id, org_id: epcbOrgId, tag: ownershipTag });

  // Step 3: Technician logs failed repair attempt remarks & persistent hardware defect
  const { data: remark2 } = await sbAdmin.from("maintenance_remarks").insert({
    ticket_id: res3.ticket_id,
    author_id: epcbTech.id,
    body: "DISPATCH FAILURE / HARDWARE DEFECT: Isolated all external DC strings; all strings measured > 50 MΩ to earth ground. Fault 39 persists internally when DC isolator is engaged. Internal DC input board varistor/GFCI relay breakdown diagnosed. Parts required. Escalated to Sungrow warranty service.",
  }).select().single();
  if (remark2) newRecords.push({ table: "maintenance_remarks", id: remark2.id, org_id: epcbOrgId, tag: ownershipTag });

  // Step 4: Update Ticket status to 'on_hold' and preserve open alert
  await sbAdmin.from("tickets").update({ status: "on_hold" }).eq("id", res3.ticket_id);
  await sbAdmin.from("work_orders").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", woEpcb.id);

  const { data: onHoldTicket } = await sbAdmin.from("tickets").select("status").eq("id", res3.ticket_id).single();
  const { data: persistentAlert } = await sbAdmin.from("alerts").select("status").eq("id", alert3.id).single();

  console.log(`   ✓ Ticket status updated to: ${onHoldTicket?.status} (Expected: on_hold)`);
  console.log(`   ✓ Alert remains active   : ${persistentAlert?.status} (Expected: open)`);
  if (onHoldTicket?.status !== "on_hold" || persistentAlert?.status !== "open") {
    sec4Issues.push("Unsuccessful repair scenario failed to place ticket on hold or left alert unresolved");
  }

  stage3Report.push({
    section: "4. OPERATIONAL REPAIR WORKFLOWS (SUCCESS & FAILURE)",
    status: sec4Issues.length === 0 ? "PASS" : "FAIL",
    evidence: {
      successful_scenario: {
        ticket_id: res2.ticket_id,
        work_order_id: woEpca?.id,
        ticket_status: closedTicket?.status,
        alert_status: resolvedAlert?.status,
        telemetry_recovered: true,
      },
      unsuccessful_scenario: {
        ticket_id: res3.ticket_id,
        work_order_id: woEpcb?.id,
        ticket_status: onHoldTicket?.status,
        alert_status: persistentAlert?.status,
        escalation_reason: "Internal inverter board failure; placed on hold for OEM warranty",
      },
    },
    issues: sec4Issues,
  });

  // ---------------------------------------------------------------------------
  // STEP 5: MULTI-TENANT ISOLATION OF OPERATIONAL TICKETS & ALERTS
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. MULTI-TENANT ISOLATION ON OPERATIONAL RECORDS ---");
  const sec5Issues: string[] = [];

  // Log in as EPC A Admin
  const sbEpca = createClient(TARGET_URL, ANON_KEY);
  await sbEpca.auth.signInWithPassword({
    email: "admin@epca-solar.dev",
    password: "Simulation@12345",
  });

  // Log in as EPC B Admin
  const sbEpcb = createClient(TARGET_URL, ANON_KEY);
  await sbEpcb.auth.signInWithPassword({
    email: "admin@epcb-solar.dev",
    password: "Simulation@12345",
  });

  // EPC A attempts to read tickets & alerts
  const { data: epcaTickets } = await sbEpca.from("tickets").select("id, org_id, title");
  const { data: epcaAlerts } = await sbEpca.from("alerts").select("id, org_id, title");

  const epcaForeignTickets = epcaTickets?.filter((t) => t.org_id !== epcaOrgId) || [];
  const epcaForeignAlerts = epcaAlerts?.filter((a) => a.org_id !== epcaOrgId) || [];

  console.log(`• EPC A Admin: Visible Tickets=${epcaTickets?.length || 0} (Foreign: ${epcaForeignTickets.length}), Visible Alerts=${epcaAlerts?.length || 0} (Foreign: ${epcaForeignAlerts.length})`);
  if (epcaForeignTickets.length > 0) sec5Issues.push(`EPC A Admin leaked ${epcaForeignTickets.length} foreign tickets!`);
  if (epcaForeignAlerts.length > 0) sec5Issues.push(`EPC A Admin leaked ${epcaForeignAlerts.length} foreign alerts!`);

  // EPC B attempts to read tickets & alerts
  const { data: epcbTickets } = await sbEpcb.from("tickets").select("id, org_id, title");
  const { data: epcbAlerts } = await sbEpcb.from("alerts").select("id, org_id, title");

  const epcbForeignTickets = epcbTickets?.filter((t) => t.org_id !== epcbOrgId) || [];
  const epcbForeignAlerts = epcbAlerts?.filter((a) => a.org_id !== epcbOrgId) || [];

  console.log(`• EPC B Admin: Visible Tickets=${epcbTickets?.length || 0} (Foreign: ${epcbForeignTickets.length}), Visible Alerts=${epcbAlerts?.length || 0} (Foreign: ${epcbForeignAlerts.length})`);
  if (epcbForeignTickets.length > 0) sec5Issues.push(`EPC B Admin leaked ${epcbForeignTickets.length} foreign tickets!`);
  if (epcbForeignAlerts.length > 0) sec5Issues.push(`EPC B Admin leaked ${epcbForeignAlerts.length} foreign alerts!`);

  stage3Report.push({
    section: "5. MULTI-TENANT ISOLATION OF OPERATIONAL RECORDS",
    status: sec5Issues.length === 0 ? "PASS" : "FAIL",
    evidence: {
      epca_visible_tickets: epcaTickets?.length || 0,
      epca_foreign_tickets: epcaForeignTickets.length,
      epcb_visible_tickets: epcbTickets?.length || 0,
      epcb_foreign_tickets: epcbForeignTickets.length,
    },
    issues: sec5Issues,
  });

  // ---------------------------------------------------------------------------
  // STEP 6: MANIFEST UPDATE & ATOMIC BACKUP
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. STAGE 3 MANIFEST UPDATE & BACKUP ---");
  const sec6Issues: string[] = [];

  const combinedRecords = [...manifest.records, ...newRecords];
  const combinedCountsByTable: Record<string, number> = { ...manifest.counts_by_table };

  for (const nr of newRecords) {
    combinedCountsByTable[nr.table] = (combinedCountsByTable[nr.table] || 0) + 1;
  }

  const stage3Manifest = {
    version: "3.0",
    created_at: new Date().toISOString(),
    staging_project_ref: STAGING_PROJECT_REF,
    target_url: TARGET_URL,
    ownership_tag: ownershipTag,
    total_records: combinedRecords.length,
    counts_by_table: combinedCountsByTable,
    stage3_new_records_count: newRecords.length,
    records: combinedRecords,
  };

  const stage3ManifestPath = path.resolve(__dirname, "../../test_reports/sim_manifest_stage3.json");
  const stage3BackupPath = path.resolve(__dirname, "../../test_reports/sim_manifest_stage3.backup.json");

  const manifestStr = JSON.stringify(stage3Manifest, null, 2);
  fs.writeFileSync(stage3ManifestPath, manifestStr, "utf-8");
  fs.writeFileSync(stage3BackupPath, manifestStr, "utf-8");

  const hPrimary = crypto.createHash("sha256").update(manifestStr).digest("hex");
  const hBackup = crypto.createHash("sha256").update(fs.readFileSync(stage3BackupPath, "utf-8")).digest("hex");

  console.log(`• Stage 3 Total Records Tracked : ${stage3Manifest.total_records} (New in Stage 3: ${newRecords.length})`);
  console.log(`• Manifest Table Breakdown:`, stage3Manifest.counts_by_table);
  console.log(`• Primary SHA-256 : ${hPrimary.slice(0, 16)}...`);
  console.log(`• Backup SHA-256  : ${hBackup.slice(0, 16)}...`);
  console.log(`• Hashes Identical: ${hPrimary === hBackup ? "YES" : "NO"}`);
  if (hPrimary !== hBackup) sec6Issues.push("Primary and backup manifest hashes mismatch");

  stage3Report.push({
    section: "6. STAGE 3 MANIFEST UPDATE & BACKUP",
    status: sec6Issues.length === 0 ? "PASS" : "FAIL",
    evidence: {
      total_records: stage3Manifest.total_records,
      new_records: newRecords.length,
      counts_by_table: stage3Manifest.counts_by_table,
      sha256: hPrimary,
      is_identical: hPrimary === hBackup,
    },
    issues: sec6Issues,
  });

  // ---------------------------------------------------------------------------
  // STEP 7: BASELINE INTEGRITY POST-SIMULATION AUDIT
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. POST-SIMULATION BASELINE INTEGRITY AUDIT ---");
  const sec7Issues: string[] = [];

  const baseSiteIds = Object.values(SEED_IDS.sites);

  // Orgs (2)
  const { data: bOrgs } = await sbAdmin.from("organizations").select("id").in("id", [SEED_IDS.orgs.solarassist, SEED_IDS.orgs.sunwave]);
  if (bOrgs?.length !== 2) sec7Issues.push(`Baseline organizations count changed: ${bOrgs?.length}`);

  // Profiles (3)
  const { data: bProfs } = await sbAdmin.from("profiles").select("id").in("id", [SEED_IDS.users.super, SEED_IDS.users.admin, SEED_IDS.users.tech1]);
  if (bProfs?.length !== 3) sec7Issues.push(`Baseline profiles count changed: ${bProfs?.length}`);

  // Sites (5)
  const { data: bSites } = await sbAdmin.from("sites").select("id").in("id", baseSiteIds);
  if (bSites?.length !== 5) sec7Issues.push(`Baseline sites count changed: ${bSites?.length}`);

  // Baseline Alert (1) & Ticket (1)
  const { data: bAlert } = await sbAdmin.from("alerts").select("id, status").eq("id", SEED_IDS.alert1).single();
  const { data: bTicket } = await sbAdmin.from("tickets").select("id, status").eq("id", SEED_IDS.ticket1).single();
  if (!bAlert || bAlert.status !== "open") sec7Issues.push("Baseline alert was modified or closed");
  if (!bTicket || bTicket.status !== "open") sec7Issues.push("Baseline ticket was modified or closed");

  // Inverters (20) & Strings (80)
  const { count: bInvs } = await sbAdmin.from("inverters").select("*", { count: "exact", head: true }).in("site_id", baseSiteIds);
  const { data: bInvsRows } = await sbAdmin.from("inverters").select("id").in("site_id", baseSiteIds);
  const bInvIds = bInvsRows?.map((i) => i.id) || [];
  const { count: bStrs } = await sbAdmin.from("strings").select("*", { count: "exact", head: true }).in("inverter_id", bInvIds);

  if (bInvs !== 20) sec7Issues.push(`Baseline inverter count changed from 20 to ${bInvs}`);
  if (bStrs !== 80) sec7Issues.push(`Baseline string count changed from 80 to ${bStrs}`);

  // Baseline Telemetry (7,200)
  const { count: bTelem } = await sbAdmin.from("telemetry").select("*", { count: "exact", head: true }).in("inverter_id", bInvIds);
  if (bTelem !== 7200) sec7Issues.push(`Baseline telemetry count changed from 7,200 to ${bTelem}`);

  console.log(`• Post-Simulation Baseline State:`);
  console.log(`   - Organizations : ${bOrgs?.length}/2`);
  console.log(`   - Profiles      : ${bProfs?.length}/3`);
  console.log(`   - Sites         : ${bSites?.length}/5`);
  console.log(`   - Inverters     : ${bInvs}/20`);
  console.log(`   - Strings       : ${bStrs}/80`);
  console.log(`   - Telemetry     : ${bTelem}/7200`);
  console.log(`   - Baseline Alert : ${bAlert?.id} (Status: ${bAlert?.status})`);
  console.log(`   - Baseline Ticket: ${bTicket?.id} (Status: ${bTicket?.status})`);

  stage3Report.push({
    section: "7. POST-SIMULATION BASELINE INTEGRITY AUDIT",
    status: sec7Issues.length === 0 ? "PASS" : "FAIL",
    evidence: {
      organizations: bOrgs?.length,
      profiles: bProfs?.length,
      sites: bSites?.length,
      inverters: bInvs,
      strings: bStrs,
      telemetry: bTelem,
      baseline_alert_status: bAlert?.status,
      baseline_ticket_status: bTicket?.status,
    },
    issues: sec7Issues,
  });

  // ---------------------------------------------------------------------------
  // SUMMARY & OUTPUT
  // ---------------------------------------------------------------------------
  console.log("\n========================================================================");
  console.log("FINAL STAGE 3 SIMULATION SUMMARY & VERDICTS");
  console.log("========================================================================");
  for (const rep of stage3Report) {
    console.log(`[${rep.status}] ${rep.section}`);
    if (rep.issues.length > 0) {
      rep.issues.forEach((iss) => console.log(`       ⚠️  Issue: ${iss}`));
    }
  }

  const allPassed = stage3Report.every((r) => r.status === "PASS");
  console.log(`\nOVERALL STAGE 3 VERDICT: ${allPassed ? "✅ ALL 7 STAGE 3 SECTIONS PASSED" : "❌ STAGE 3 SIMULATION HAD ISSUES"}`);
  console.log("========================================================================");

  const reportOutPath = path.resolve(__dirname, "../../test_reports/stage3_operational_simulation_report.json");
  fs.writeFileSync(reportOutPath, JSON.stringify(stage3Report, null, 2), "utf-8");
  console.log(`Detailed Stage 3 report written to: ${reportOutPath}`);
}

main().catch((err) => {
  console.error("FATAL ERROR during Stage 3 simulation:", err);
  process.exit(1);
});
