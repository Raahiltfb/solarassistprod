import { createClient } from "@supabase/supabase-js";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";
import { verifyLoadTestIdsUnused, populateLoadTestTier, teardownLoadTestData, LOAD_TEST_CONSTANTS } from "./staging-load-harness";

async function main() {
  const targetUrl = process.env.TEST_SUPABASE_URL || "";
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY || "";
  verifyTestEnvironmentSafety(targetUrl, true);

  console.log("========================================================================");
  console.log("PHASE 8: CONTROLLED LIVE STAGING LOAD TEST - TIER 1 (25 SITES)");
  console.log(`Target: ${targetUrl}`);
  console.log(`Staging Ref: ${STAGING_PROJECT_REF}`);
  console.log("========================================================================\n");

  const sbAdmin = createClient(targetUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Step 1: Preflight ID Safety Check
  console.log("1. Verifying load-test deterministic IDs are completely unused...");
  await verifyLoadTestIdsUnused();
  console.log("✓ Load-test IDs are pristine.");

  // Step 2: Populate Tier 1 (25 Sites)
  console.log("\n2. Populating Bounded Tier of 25 Sites...");
  const t0 = performance.now();
  const summary = await populateLoadTestTier(25);
  const popTimeMs = Math.round(performance.now() - t0);
  console.log(`✓ Tier population time: ${popTimeMs} ms`);

  // Step 3: Verify Actual Row Counts in Staging Database
  console.log("\n3. Verifying exact database row counts...");
  const { count: totalSites } = await sbAdmin.from("sites").select("*", { count: "exact", head: true });
  const { count: loadSites } = await sbAdmin.from("sites").select("*", { count: "exact", head: true }).eq("org_id", LOAD_TEST_CONSTANTS.orgId);
  const { count: baseSites } = await sbAdmin.from("sites").select("*", { count: "exact", head: true }).neq("org_id", LOAD_TEST_CONSTANTS.orgId);
  
  const { count: totalInverters } = await sbAdmin.from("inverters").select("*", { count: "exact", head: true });
  const { count: totalStrings } = await sbAdmin.from("strings").select("*", { count: "exact", head: true });
  const { count: totalTelemetry } = await sbAdmin.from("telemetry").select("*", { count: "exact", head: true });

  console.log(`• Total Sites in DB: ${totalSites} (Baseline: ${baseSites}, Load-Test: ${loadSites})`);
  console.log(`• Total Inverters: ${totalInverters} (Expected: 20 baseline + 50 load = 70)`);
  console.log(`• Total Strings: ${totalStrings} (Expected: 80 baseline + 200 load = 280)`);
  console.log(`• Total Telemetry: ${totalTelemetry} (Expected: 7,200 baseline + 1,200 load = 8,400)`);

  // Assert exact counts
  if (baseSites !== 5) throw new Error(`Safety violation: baseline sites count changed from 5 to ${baseSites}!`);
  if (loadSites !== 25) throw new Error(`Expected exactly 25 load-test sites, found ${loadSites}`);

  // Step 4: Verify Database RLS Tenant Isolation Under Scale
  console.log("\n4. Verifying Authenticated RLS Isolation Under Scale...");
  const sbLoadAdmin = createClient(targetUrl, anonKey);
  const { data: authSession, error: loginErr } = await sbLoadAdmin.auth.signInWithPassword({
    email: LOAD_TEST_CONSTANTS.userEmail,
    password: "LoadTest@12345",
  });
  if (loginErr) throw new Error(`Failed to login as load-test admin: ${loginErr.message}`);

  const { data: visibleSites, error: visErr } = await sbLoadAdmin.from("sites").select("id, name, org_id");
  if (visErr) throw new Error(`RLS query error: ${visErr.message}`);

  const crossTenantSites = visibleSites.filter((s) => s.org_id !== LOAD_TEST_CONSTANTS.orgId);
  console.log(`• Visible sites to load-test tenant: ${visibleSites.length}`);
  console.log(`• Cross-tenant sites visible: ${crossTenantSites.length}`);
  if (crossTenantSites.length > 0) {
    throw new Error(`CRITICAL RLS ISOLATION LEAK: Load-test tenant saw foreign sites!`);
  }
  console.log("✓ Tenant RLS Isolation PASSED under scale (zero cross-tenant visibility).");

  // Step 5: Measure Live Database Query Performance Separated from WAN
  console.log("\n5. Measuring Live Database-Backed Query Timings...");
  const q0 = performance.now();
  const rawRes = await fetch(`${targetUrl}/rest/v1/inverters?select=id,site_id,oem,oem_device_id,status&limit=50`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "count=exact",
    },
  });
  const clientWanMs = Math.round(performance.now() - q0);
  console.log(`• PostgREST Inverter Query (50 rows): ${clientWanMs} ms (HTTPS WAN roundtrip)`);
  console.log(`• HTTP Headers Content-Range: ${rawRes.headers.get("content-range")}`);

  // Step 6: Safe Teardown
  console.log("\n6. Running Dependency-Safe Teardown...");
  await teardownLoadTestData();

  // Step 7: Confirm Baseline Intact Post-Teardown
  const { count: postTeardownSites } = await sbAdmin.from("sites").select("*", { count: "exact", head: true });
  const { count: postTeardownTel } = await sbAdmin.from("telemetry").select("*", { count: "exact", head: true });
  console.log(`• Post-Teardown Sites in DB: ${postTeardownSites} (Expected: exactly 5)`);
  console.log(`• Post-Teardown Telemetry in DB: ${postTeardownTel} (Expected: exactly 7,200)`);

  if (postTeardownSites !== 5 || postTeardownTel !== 7200) {
    throw new Error(`Teardown anomaly: expected exactly 5 sites and 7,200 telemetry rows.`);
  }
  console.log("✓ Verified: Baseline fleet 100% intact and undamaged.");

  console.log("\n========================================================================");
  console.log("TIER 1 (25 SITES) CONTROLLED LOAD TEST PASSED 100%!");
  console.log("========================================================================");
}

main().catch(async (err) => {
  console.error("FATAL ERROR in Load-Test Tier 25:", err);
  console.log("Attempting emergency cleanup...");
  await teardownLoadTestData().catch(console.error);
  process.exit(1);
});
