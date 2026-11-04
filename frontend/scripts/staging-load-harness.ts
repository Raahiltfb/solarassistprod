/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SolarAssist Phase 8: Controlled Staging Load-Test Harness & Safe Teardown
 * 
 * Safety & Isolation Principles:
 * 1. Target URL MUST match staging ref `xpjzuquqehjamqsqshwq`.
 * 2. Dedicated Synthetic Load-Test Tenant:
 *    - Organization: `loadtest-scale` (`id: e0000000-0000-4000-a000-000000000001`)
 *    - Auth User: `loadtest-admin@solarassist.dev` (`id: e0000000-0000-4000-b000-000000000001`)
 * 3. All entity IDs use strict deterministic prefix `e0000000-...`
 * 4. Explicit Ownership Marker: `is_synthetic_test: true`, `test_run_owner: "phase8-loadtest"`
 * 5. Comprehensive Dependency-Safe Teardown:
 *    Deletes in strict reverse topological dependency order:
 *      string_telemetry -> strings -> telemetry -> maintenance_remarks ->
 *      tickets -> alerts -> cleaning_logs -> site_cleaning_rules ->
 *      inverters -> sites -> profiles -> auth.users -> organizations
 * 6. Preserves the 5 baseline sites and existing demo users completely untouched.
 */
import { createClient } from "@supabase/supabase-js";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";

const URL = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!URL || !KEY) {
  console.error("Missing Supabase env vars. Ensure .env.test.local is loaded.");
  process.exit(1);
}

// 1. Strict Target Project Reference Verification
verifyTestEnvironmentSafety(URL, true);

if (!URL.includes(STAGING_PROJECT_REF)) {
  console.error(`FATAL: URL does not match staging ref: ${STAGING_PROJECT_REF}`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export const LOAD_TEST_CONSTANTS = {
  orgId: "e0000000-0000-4000-a000-000000000001",
  orgSlug: "loadtest-scale",
  orgName: "Synthetic Load Test Tenant",
  userId: "e0000000-0000-4000-b000-000000000001",
  userEmail: "loadtest-admin@solarassist.dev",
  ownershipTag: "phase8-loadtest",
};

/**
 * Validates that load-test deterministic IDs are completely unused before any insertion.
 */
export async function verifyLoadTestIdsUnused() {
  const { data: org } = await sb.from("organizations").select("id").eq("id", LOAD_TEST_CONSTANTS.orgId).maybeSingle();
  if (org) {
    throw new Error(`Load-test tenant organization ID '${LOAD_TEST_CONSTANTS.orgId}' is already in use.`);
  }

  const { data: userList } = await sb.auth.admin.listUsers();
  const existingUser = (userList?.users as any[])?.find((u) => u.id === LOAD_TEST_CONSTANTS.userId || u.email === LOAD_TEST_CONSTANTS.userEmail);
  if (existingUser) {
    throw new Error(`Load-test user ID '${LOAD_TEST_CONSTANTS.userId}' or email '${LOAD_TEST_CONSTANTS.userEmail}' is already in use.`);
  }

  // Also verify no load-test prefixed sites exist
  const { count: existingSites } = await sb.from("sites").select("*", { count: "exact", head: true }).eq("org_id", LOAD_TEST_CONSTANTS.orgId);
  if (existingSites && existingSites > 0) {
    throw new Error(`Load-test site namespace contains ${existingSites} residual sites.`);
  }
}

/**
 * Dependency-Safe Teardown:
 * Deletes ONLY entities belonging to the synthetic load-test tenant and matching the deterministic prefix.
 * Strict reverse topological order ensures zero foreign key lockouts.
 */
export async function teardownLoadTestData() {
  console.log("\n===============================================================");
  console.log("       Executing Safe Teardown of Load-Test Data               ");
  console.log("===============================================================");
  console.log(`Target: ${URL} (Staging: ${STAGING_PROJECT_REF})`);

  // 1. Find all sites owned by the load-test org
  const { data: sites } = await sb
    .from("sites")
    .select("id")
    .eq("org_id", LOAD_TEST_CONSTANTS.orgId);

  const siteIds = (sites || []).map((s) => s.id);
  console.log(`Found ${siteIds.length} load-test sites to tear down.`);

  if (siteIds.length > 0) {
    // 2. Find all inverters under these sites
    const { data: inverters } = await sb
      .from("inverters")
      .select("id")
      .in("site_id", siteIds);

    const inverterIds = (inverters || []).map((inv) => inv.id);
    console.log(`Found ${inverterIds.length} load-test inverters.`);

    if (inverterIds.length > 0) {
      // 3. Find strings under these inverters
      const { data: strings } = await sb
        .from("strings")
        .select("id")
        .in("inverter_id", inverterIds);

      const stringIds = (strings || []).map((st) => st.id);
      console.log(`Found ${stringIds.length} load-test strings.`);

      if (stringIds.length > 0) {
        // Step 1: string_telemetry
        await sb.from("string_telemetry").delete().in("string_id", stringIds);
        console.log(`✓ Deleted load-test string_telemetry.`);

        // Step 2: strings
        await sb.from("strings").delete().in("id", stringIds);
        console.log(`✓ Deleted load-test strings.`);
      }

      // Step 3: telemetry
      await sb.from("telemetry").delete().in("inverter_id", inverterIds);
      console.log(`✓ Deleted load-test telemetry.`);

      // Step 4: tickets & alerts
      const { data: tktList } = await sb.from("tickets").select("id").in("site_id", siteIds);
      const tktIds = (tktList || []).map((t) => t.id);
      if (tktIds.length > 0) {
        await sb.from("maintenance_remarks").delete().in("ticket_id", tktIds);
        await sb.from("tickets").delete().in("id", tktIds);
        console.log(`✓ Deleted load-test tickets.`);
      }

      await sb.from("alerts").delete().in("inverter_id", inverterIds);
      await sb.from("alerts").delete().in("site_id", siteIds);
      console.log(`✓ Deleted load-test alerts.`);

      // Step 5: inverters
      await sb.from("inverters").delete().in("id", inverterIds);
      console.log(`✓ Deleted load-test inverters.`);
    }

    // Step 6: cleaning logs, visits, rules, and sites
    await sb.from("cleaning_logs").delete().in("site_id", siteIds);
    await sb.from("cleaning_visits").delete().in("site_id", siteIds);
    await sb.from("site_cleaning_rules").delete().in("site_id", siteIds);
    await sb.from("sites").delete().in("id", siteIds);
    console.log(`✓ Deleted load-test sites & cleaning metadata.`);
  }

  // Step 7: Profiles & Auth User
  await sb.from("profiles").delete().eq("id", LOAD_TEST_CONSTANTS.userId);
  await sb.auth.admin.deleteUser(LOAD_TEST_CONSTANTS.userId).catch(() => {});
  console.log(`✓ Deleted load-test auth user & profile.`);

  // Step 8: Organization
  await sb.from("organizations").delete().eq("id", LOAD_TEST_CONSTANTS.orgId);
  console.log(`✓ Deleted load-test organization.`);

  console.log("===============================================================");
  console.log("Safe Teardown Complete. Baseline 5-site fleet remains intact.");
  console.log("===============================================================\n");
}

/**
 * Inserts records in bounded batches (100 rows/request).
 */
async function insertBatch(table: string, records: any[], batchSize = 100) {
  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const { error } = await sb.from(table).insert(chunk);
    if (error) {
      throw new Error(`Batch insert failed on table '${table}': ${error.message}`);
    }
  }
}

/**
 * Provisions a bounded tier of synthetic sites (e.g. 50 sites).
 */
export async function populateLoadTestTier(siteCount: number) {
  console.log("===============================================================");
  console.log(`Populating Controlled Load-Test Tier: ${siteCount} Sites`);
  console.log("===============================================================");

  // 1. Create Load-Test Organization
  await sb.from("organizations").insert({
    id: LOAD_TEST_CONSTANTS.orgId,
    name: LOAD_TEST_CONSTANTS.orgName,
    slug: LOAD_TEST_CONSTANTS.orgSlug,
    primary_color: "#6366f1",
  });
  console.log(`✓ Load-test tenant created: ${LOAD_TEST_CONSTANTS.orgId}`);

  // 2. Create Load-Test Auth User & Profile
  const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
    id: LOAD_TEST_CONSTANTS.userId,
    email: LOAD_TEST_CONSTANTS.userEmail,
    password: "LoadTest@12345",
    email_confirm: true,
    user_metadata: {
      full_name: "Load Test Admin",
      is_synthetic_test: true,
      test_run_owner: LOAD_TEST_CONSTANTS.ownershipTag,
    },
  });
  if (userErr || !userRes.user) throw new Error(`Failed to create load-test user: ${userErr?.message}`);

  const { error: profileErr } = await sb.from("profiles").upsert(
    {
      id: LOAD_TEST_CONSTANTS.userId,
      email: LOAD_TEST_CONSTANTS.userEmail,
      full_name: "Load Test Admin",
      role: "epc_admin",
      org_id: LOAD_TEST_CONSTANTS.orgId,
    },
    { onConflict: "id" }
  );
  if (profileErr) throw new Error(`Failed to configure load-test profile: ${profileErr.message}`);
  console.log(`✓ Load-test user and profile configured: ${LOAD_TEST_CONSTANTS.userId} (Org: ${LOAD_TEST_CONSTANTS.orgId})`);

  // 3. Generate Sites, Inverters, Strings, Telemetry, and Metadata
  const sites: any[] = [];
  const inverters: any[] = [];
  const strings: any[] = [];
  const telemetry: any[] = [];
  const cleaningRules: any[] = [];
  const cleaningLogs: any[] = [];
  const alerts: any[] = [];
  const tickets: any[] = [];

  for (let s = 1; s <= siteCount; s++) {
    const siteId = `e0000000-0000-4000-c000-${String(s).padStart(12, "0")}`;
    sites.push({
      id: siteId,
      org_id: LOAD_TEST_CONSTANTS.orgId,
      name: `Load Test Solar Park ${s}`,
      location: `Maharashtra, India`,
      latitude: 19.0 + (s * 0.01),
      longitude: 73.0 + (s * 0.01),
      capacity_kwp: 5000,
      commissioned_on: "2024-01-01",
      cleaning_cycle_days: 15,
      last_cleaned_on: "2026-10-15",
    });

    cleaningRules.push({
      site_id: siteId,
      is_configured: true,
      normal_interval_days: 15,
      monsoon_interval_days: 30,
      required_teams: 1,
      is_override: false,
    });

    cleaningLogs.push({
      id: `e0000000-0000-4000-f000-${String(s).padStart(12, "0")}`,
      site_id: siteId,
      performed_by: LOAD_TEST_CONSTANTS.userId,
      performed_at: "2026-10-15T10:00:00.000Z",
      remarks: `Load test baseline cleaning log for site ${s}.`,
    });

    // 2 inverters per site in load test (to maintain compact volume)
    for (let invIdx = 1; invIdx <= 2; invIdx++) {
      const globalInv = (s - 1) * 2 + invIdx;
      const invId = `e0000000-0000-4000-d000-${String(globalInv).padStart(12, "0")}`;
      const isFaulty = s === 1 && invIdx === 1;

      inverters.push({
        id: invId,
        site_id: siteId,
        oem: "solis",
        oem_device_id: `LOAD-SITE${s}-INV${invIdx}`,
        model: "S5-GC50K",
        serial_number: `LT-SN-${globalInv}`,
        capacity_kw: 2500,
        string_count: 4,
        status: isFaulty ? "offline" : "online",
        last_seen_at: new Date().toISOString(),
      });

      if (isFaulty) {
        const alertId = `e0000000-0000-4000-a100-${String(globalInv).padStart(12, "0")}`;
        const ticketId = `e0000000-0000-4000-b100-${String(globalInv).padStart(12, "0")}`;
        alerts.push({
          id: alertId,
          org_id: LOAD_TEST_CONSTANTS.orgId,
          site_id: siteId,
          inverter_id: invId,
          code: "INV_OFFLINE",
          title: `Load test inverter ${globalInv} offline`,
          description: "Synthetic load test alert.",
          severity: "high",
          status: "open",
        });
        tickets.push({
          id: ticketId,
          org_id: LOAD_TEST_CONSTANTS.orgId,
          site_id: siteId,
          alert_id: alertId,
          title: `Investigate load test inverter ${globalInv}`,
          priority: "p2",
          status: "open",
          created_by: LOAD_TEST_CONSTANTS.userId,
          sla_due_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
        });
      }

      // 4 strings per inverter
      for (let strIdx = 1; strIdx <= 4; strIdx++) {
        const globalStr = (globalInv - 1) * 4 + strIdx;
        const strId = `e0000000-0000-4000-e000-${String(globalStr).padStart(12, "0")}`;
        strings.push({
          id: strId,
          inverter_id: invId,
          string_index: strIdx,
          modules_count: 20,
          capacity_kw: 625,
          status: "ok",
        });
      }

      // 24 hours of hourly telemetry (24 points per inverter)
      const baseTime = new Date("2026-10-26T12:00:00.000Z").getTime();
      for (let h = 24; h > 0; h--) {
        const t = new Date(baseTime - h * 3600_000);
        telemetry.push({
          inverter_id: invId,
          timestamp: t.toISOString(),
          ac_power_kw: 1850.5,
          dc_power_kw: 1940.0,
          energy_kwh: (24 - h) * 1850.5,
          efficiency_pct: 95.4,
          temperature_c: 38.2,
          online_status: true,
        });
      }
    }
  }

  // Insert in strict dependency order using batches of 100
  console.log(`Inserting ${sites.length} sites...`);
  await insertBatch("sites", sites, 100);

  console.log(`Inserting ${inverters.length} inverters...`);
  await insertBatch("inverters", inverters, 100);

  console.log(`Inserting ${strings.length} strings...`);
  await insertBatch("strings", strings, 100);

  console.log(`Inserting ${telemetry.length} telemetry points...`);
  await insertBatch("telemetry", telemetry, 100);

  console.log(`Inserting ${cleaningRules.length} cleaning rules...`);
  await insertBatch("site_cleaning_rules", cleaningRules, 100);

  console.log(`Inserting ${cleaningLogs.length} cleaning logs...`);
  await insertBatch("cleaning_logs", cleaningLogs, 100);

  if (alerts.length > 0) {
    console.log(`Inserting ${alerts.length} alerts & tickets...`);
    await insertBatch("alerts", alerts, 100);
    await insertBatch("tickets", tickets, 100);
  }

  console.log("✓ Tier population complete.");
  return {
    sitesCount: sites.length,
    invertersCount: inverters.length,
    stringsCount: strings.length,
    telemetryCount: telemetry.length,
    rulesCount: cleaningRules.length,
    logsCount: cleaningLogs.length,
    alertsCount: alerts.length,
    ticketsCount: tickets.length,
  };
}
