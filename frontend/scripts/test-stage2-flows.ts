import { createClient } from "@supabase/supabase-js";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";
import { SEED_IDS } from "./seed";
import { generateMonthlyCleaningPlan } from "../lib/cleaning-scheduler";

async function main() {
  const targetUrl = process.env.TEST_SUPABASE_URL || "";
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY || "";
  verifyTestEnvironmentSafety(targetUrl, true);

  const sbAdmin = createClient(targetUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log("========================================================================");
  console.log("STAGE 2 & 3: APPLICATION WORKFLOWS & DB-LEVEL RLS TENANT ISOLATION TEST");
  console.log(`Target Supabase URL: ${targetUrl}`);
  console.log(`Verified Staging Ref: ${STAGING_PROJECT_REF}`);
  console.log("========================================================================\n");

  // ---------------------------------------------------------------------------
  // 1. APPLICATION WORKFLOW VALIDATION (Command Center, Telemetry, Alert->Ticket)
  // ---------------------------------------------------------------------------
  console.log("--- 1. Testing Command Center Fleet Query ---");
  const { data: fleetSites, error: fleetErr } = await sbAdmin
    .from("sites")
    .select("id, name, capacity_kwp, inverters(id, status, telemetry(ac_power_kw, energy_kwh))")
    .eq("org_id", SEED_IDS.orgs.solarassist);

  if (fleetErr) throw new Error(`Command Center Fleet Query failed: ${fleetErr.message}`);
  console.log(`✓ Command Center fetched ${fleetSites.length} sites under SolarAssist with linked inverters & telemetry.`);

  console.log("\n--- 2. Testing Alert-to-Ticket Triage Workflow ---");
  const { data: openAlerts, error: alertErr } = await sbAdmin
    .from("alerts")
    .select("id, code, title, severity, tickets(id, title, status, priority, assignee_id)")
    .eq("status", "open");

  if (alertErr) throw new Error(`Alert triage query failed: ${alertErr.message}`);
  console.log(`✓ Retrieved ${openAlerts.length} open alert(s) linked to tickets.`);
  openAlerts.forEach((a: any) => {
    console.log(`   • Alert [${a.code}] -> Linked Ticket: ${a.tickets?.[0]?.title || "None"} (Priority: ${a.tickets?.[0]?.priority})`);
  });

  console.log("\n--- 3. Testing Cleaning Scheduler Execution with Seeded Data ---");
  const { data: dbSites } = await sbAdmin.from("sites").select("*").eq("org_id", SEED_IDS.orgs.solarassist);
  const { data: dbRules } = await sbAdmin.from("site_cleaning_rules").select("*");
  const { data: dbTeams } = await sbAdmin.from("technician_teams").select("*").eq("org_id", SEED_IDS.orgs.solarassist);

  const planResult = generateMonthlyCleaningPlan({
    year: 2026,
    month: 11, // November 2026
    sites: (dbSites || []) as any,
    rules: (dbRules || []) as any,
    teams: (dbTeams || []) as any,
  });

  console.log(`✓ Cleaning Scheduler Plan generated:`);
  console.log(`   • Scheduled Visits: ${planResult.assignments.length}`);
  console.log(`   • Proposed Canonical Visits: ${planResult.proposedVisits.length}`);
  console.log(`   • Unscheduled Sites: ${planResult.unscheduledSites.length}`);
  console.log(`   • Geographic Clusters: ${planResult.clusters.length}`);

  // ---------------------------------------------------------------------------
  // 2. AUTHENTICATED DATABASE RLS TENANT ISOLATION TESTS
  // ---------------------------------------------------------------------------
  console.log("\n========================================================================");
  console.log("--- 4. Authenticated Database RLS Tenant Isolation (Actual Token) --- ");
  console.log("========================================================================");

  // Authenticate as SolarAssist Admin (Org 1)
  const sbAdminClient = createClient(targetUrl, anonKey);
  const { data: authData1, error: loginErr1 } = await sbAdminClient.auth.signInWithPassword({
    email: "admin@solarassist.dev",
    password: "Solar@12345",
  });
  if (loginErr1) throw new Error(`Failed to login as admin@solarassist.dev: ${loginErr1.message}`);
  console.log(`✓ Authenticated as admin@solarassist.dev (Org: ${SEED_IDS.orgs.solarassist})`);

  // Attempt 1: Query sites with SolarAssist admin token
  const { data: visibleSitesOrg1, error: visErr } = await sbAdminClient.from("sites").select("id, name, org_id");
  if (visErr) throw new Error(`RLS query failed: ${visErr.message}`);
  console.log(`   • Visible sites to SolarAssist admin: ${visibleSitesOrg1.length}`);
  visibleSitesOrg1.forEach((s) => console.log(`     - ${s.name} (org: ${s.org_id})`));

  // Verify that ZERO sites from SunWave (bc763745...) are visible
  const leakedSites = visibleSitesOrg1.filter((s) => s.org_id === SEED_IDS.orgs.sunwave);
  console.log(`   • Cross-tenant leaked sites from SunWave: ${leakedSites.length}`);
  if (leakedSites.length > 0) {
    throw new Error(`CRITICAL SECURITY FAILURE: SolarAssist admin was able to view SunWave sites via RLS!`);
  }
  console.log(`✓ Database RLS Isolation PASSED: SolarAssist admin cannot view SunWave sites.`);

  // Attempt 2: Direct cross-tenant read by specific ID (Nevada Sunbelt owned by SunWave)
  const { data: directRead, error: directErr } = await sbAdminClient
    .from("sites")
    .select("id, name")
    .eq("id", SEED_IDS.sites.nevada);

  if (directErr) {
    console.log(`✓ Direct cross-tenant read rejected with error: ${directErr.message}`);
  } else if (!directRead || directRead.length === 0) {
    console.log(`✓ Direct cross-tenant read returned 0 rows (RLS policy denied access to foreign org site).`);
  } else {
    throw new Error(`CRITICAL SECURITY FAILURE: Direct read leaked foreign site: ${JSON.stringify(directRead)}`);
  }

  // Attempt 3: Cross-tenant ticket read
  const { data: leakedTickets } = await sbAdminClient
    .from("tickets")
    .select("id, org_id")
    .eq("org_id", SEED_IDS.orgs.sunwave);

  console.log(`   • Cross-tenant tickets returned for SunWave: ${leakedTickets?.length || 0}`);
  if (leakedTickets && leakedTickets.length > 0) {
    throw new Error(`CRITICAL SECURITY FAILURE: Leaked tickets across tenant boundary!`);
  }
  console.log(`✓ Database RLS Isolation PASSED: Cross-tenant ticket access denied by RLS policy.`);

  // ---------------------------------------------------------------------------
  // 3. SEPARATION OF WAN LATENCY VS SERVER EXECUTION (HTTP Headers & Timings)
  // ---------------------------------------------------------------------------
  console.log("\n========================================================================");
  console.log("--- 5. Performance Evidence: Client WAN Latency vs Server Execution ---");
  console.log("========================================================================");

  // We issue a direct REST request and inspect HTTP response headers ('cf-ray', 'server-timing', 'x-request-id')
  const startTime = performance.now();
  const rawResponse = await fetch(`${targetUrl}/rest/v1/sites?select=id,name,org_id&limit=10`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "count=exact",
    },
  });
  const totalClientWanMs = Math.round(performance.now() - startTime);

  console.log(`• HTTP Status: ${rawResponse.status} ${rawResponse.statusText}`);
  console.log(`• Total Client HTTPS Round-Trip (WAN): ${totalClientWanMs} ms`);
  console.log(`• Server-Timing Header: ${rawResponse.headers.get("server-timing") || "Not exposed by PostgREST gateway"}`);
  console.log(`• CF-Cache-Status / Edge Ray: ${rawResponse.headers.get("cf-ray") || "none"}`);
  console.log(`• Content-Range: ${rawResponse.headers.get("content-range")}`);

  console.log("\n========================================================================");
  console.log("ALL STAGE 2 & STAGE 3 TESTS PASSED SUCCESSFULLY!");
  console.log("========================================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR in test execution:", err);
  process.exit(1);
});
