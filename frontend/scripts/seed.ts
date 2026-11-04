/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Solar Assist — Isolated Staging Seed Script
 *
 * Scoped, repeatable test dataset seeding for staging project `xpjzuquqehjamqsqshwq`.
 * 
 * Safety & Isolation Principles:
 * 1. Hard target check for staging ref `xpjzuquqehjamqsqshwq`.
 * 2. Deterministic, stable synthetic UUIDs for all seeded records (no random UUID generation).
 * 3. NO cascade deletions of existing organizations, sites, or telemetry.
 * 4. Auth safety: only upserts users if synthetic test ownership is positively verified.
 *    If an unverified account exists, aborts with a conflict error rather than mutating.
 * 5. Idempotent upsert logic: repeat runs update the stable records in place without duplicates.
 * 6. Chunked batch insertions for telemetry with bounded volumes.
 */
import { createClient } from "@supabase/supabase-js";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";

const URL = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!URL || !KEY) {
  console.error("Missing Supabase env vars. Ensure .env.test.local is loaded (try `npx dotenv-cli -e .env.test.local -- npx tsx scripts/seed.ts`).");
  process.exit(1);
}

// 1. Strict Target Project Reference Verification
verifyTestEnvironmentSafety(URL, true);

if (!URL.includes(STAGING_PROJECT_REF)) {
  console.error(`FATAL: URL does not match staging ref: ${STAGING_PROJECT_REF}`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ============================================================================
// STABLE SYNTHETIC TEST UUIDs
// Using deterministic UUIDs ensures repeat executions update in place without duplicate records.
// ============================================================================

export const SEED_IDS = {
  orgs: {
    solarassist: "ac763745-aed5-469d-9956-459fb00a337e", // canonical SolarAssist org
    sunwave: "bc763745-aed5-469d-9956-459fb00a337f",     // secondary EPC org
  },
  users: {
    super: "11111111-0000-4000-a000-000000000001",
    admin: "11111111-0000-4000-a000-000000000002",
    tech1: "11111111-0000-4000-a000-000000000003",
  },
  teams: {
    teamA: "22222222-0000-4000-a000-000000000001",
    teamB: "22222222-0000-4000-a000-000000000002",
    teamC: "22222222-0000-4000-a000-000000000003",
    teamD: "22222222-0000-4000-a000-000000000004",
    teamE: "22222222-0000-4000-a000-000000000005",
  },
  sites: {
    jodhpur: "33333333-0000-4000-a000-000000000001",
    pavagada: "33333333-0000-4000-a000-000000000002",
    bhadla: "33333333-0000-4000-a000-000000000003",
    nevada: "33333333-0000-4000-a000-000000000004",
    atacama: "33333333-0000-4000-a000-000000000005",
  },
  oemIntegration: "44444444-0000-4000-a000-000000000001",
  ticket1: "55555555-0000-4000-a000-000000000001",
  alert1: "66666666-0000-4000-a000-000000000001",
};

/**
 * Idempotently creates or updates an isolated test user.
 * STRICT SAFETY RULE:
 * If a user already exists with this email, it will ONLY be updated if its user_metadata
 * positively confirms it is an authorized synthetic test account (`is_synthetic_test: true`).
 * Otherwise, the script throws a hard Conflict Error to prevent mutating any real or unmanaged user.
 */
async function upsertVerifiedSyntheticUser(
  desiredId: string,
  email: string,
  password: string,
  fullName: string,
  role: string,
  orgId: string | null
): Promise<string> {
  const { data: listData, error: listErr } = await sb.auth.admin.listUsers();
  if (listErr) throw new Error(`auth.admin.listUsers failed: ${listErr.message}`);

  const existingUser = (listData?.users as any[])?.find((u) => u.email === email);

  let userId: string;
  if (existingUser) {
    const isSynthetic = existingUser.user_metadata?.is_synthetic_test === true;
    if (!isSynthetic) {
      throw new Error(
        `CRITICAL AUTH CONFLICT: User '${email}' already exists in Auth, but lacks verified '{ is_synthetic_test: true }' metadata. ` +
        `Refusing to modify an unverified account. Aborting seed.`
      );
    }
    userId = existingUser.id;
    await sb.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { full_name: fullName, is_synthetic_test: true, test_run_owner: "phase8-staging" },
    });
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      id: desiredId,
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, is_synthetic_test: true, test_run_owner: "phase8-staging" },
    });
    if (error || !data.user) {
      throw new Error(`Failed to create verified synthetic user (${email}): ${error?.message}`);
    }
    userId = data.user.id;
  }

  await sb.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role,
      org_id: orgId,
    },
    { onConflict: "id" }
  );

  return userId;
}

/**
 * Generates deterministic synthetic telemetry for 1 inverter.
 * Exactly 30 days of 2-hour intervals = exactly 360 records per inverter.
 */
function generateDeterministicTelemetry(inverterId: string, capacityKw: number, daysBack = 30) {
  const records: any[] = [];
  const baseTimestamp = new Date("2026-10-26T12:00:00.000Z").getTime();
  const msPerHour = 3600_000;
  const hoursBack = daysBack * 24;

  let cumEnergy = 0;
  for (let h = hoursBack; h > 0; h -= 2) {
    const t = new Date(baseTimestamp - h * msPerHour);
    const hour = t.getUTCHours();

    if (hour === 0) cumEnergy = 0;

    let ac = 0;
    let dc = 0;
    if (hour >= 6 && hour <= 18) {
      const bell = Math.sin(((hour - 6) / 12) * Math.PI);
      ac = +(capacityKw * bell * 0.92).toFixed(3);
      dc = +(ac * 1.05).toFixed(3);
    }
    cumEnergy += ac * 2;

    records.push({
      inverter_id: inverterId,
      timestamp: t.toISOString(),
      ac_power_kw: ac,
      dc_power_kw: dc,
      energy_kwh: +cumEnergy.toFixed(3),
      efficiency_pct: ac > 0 ? 94.5 : 0,
      temperature_c: 35.0,
      online_status: true,
    });
  }
  return records;
}

/**
 * Generates deterministic synthetic string telemetry.
 * 14 days of 4-hour daylight intervals (3 readings/day) = exactly 42 records per string.
 */
function generateDeterministicStringTelemetry(strings: { id: string; status: string }[], daysBack = 14) {
  const records: any[] = [];
  const baseTimestamp = new Date("2026-10-26T12:00:00.000Z").getTime();
  const msPerHour = 3600_000;

  for (const str of strings) {
    const isUnderperforming = str.status === "underperforming";

    for (let d = daysBack; d > 0; d--) {
      for (const hour of [8, 12, 16]) {
        const t = new Date(baseTimestamp - (d * 24 + (24 - hour)) * msPerHour);
        const bell = Math.sin(((hour - 6) / 12) * Math.PI);

        const voltage = +(680 + bell * 40).toFixed(1);
        const current = isUnderperforming ? 0.75 : +(6.5 * bell).toFixed(2);
        const power = +((voltage * current) / 1000).toFixed(3);

        records.push({
          string_id: str.id,
          timestamp: t.toISOString(),
          voltage_v: voltage,
          current_a: current,
          power_kw: power,
          status: isUnderperforming ? "underperforming" : "ok",
        });
      }
    }
  }
  return records;
}

/**
 * Inserts records in safe batches to avoid HTTP timeouts.
 */
async function insertInBatches(table: string, records: any[], batchSize = 100) {
  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const { error } = await sb.from(table).insert(chunk);
    if (error) {
      throw new Error(`Batch insert failed on table '${table}': ${error.message}`);
    }
  }
}

export async function runScopedStagingSeed(isDryRun = false) {
  console.log("===============================================================");
  console.log(` SolarAssist Scoped Staging Seed (${isDryRun ? "DRY RUN" : "EXECUTE"}) `);
  console.log("===============================================================");
  console.log(`Target Supabase URL: ${URL}`);
  console.log(`Verified Staging Project Ref: ${STAGING_PROJECT_REF}`);

  if (isDryRun) {
    console.log("\n[Preflight Plan & Safety Summary]:");
    console.log("- NO cascade deletes of existing organizations or sites.");
    console.log("- Using deterministic synthetic UUIDs for in-place upsert.");
    console.log("- Verified Auth user protection: will refuse to mutate unverified accounts.");
    return;
  }

  // 1. Upsert Scoped Organizations (In-Place)
  console.log("\n1. Upserting canonical test organizations with stable UUIDs...");
  const org1Id = SEED_IDS.orgs.solarassist;
  const org2Id = SEED_IDS.orgs.sunwave;

  await sb.from("organizations").upsert([
    {
      id: org1Id,
      name: "Solar Assist O&M (Test)",
      slug: "solarassist",
      primary_color: "#f59e0b",
    },
    {
      id: org2Id,
      name: "SunWave EPC (Test)",
      slug: "sunwave",
      primary_color: "#0ea5e9",
    },
  ], { onConflict: "id" });
  console.log(`   ✓ SolarAssist Org: ${org1Id}`);
  console.log(`   ✓ SunWave Org:     ${org2Id}`);

  // 2. Upsert Verified Synthetic Auth Users
  console.log("\n2. Upserting verified synthetic auth users...");
  const superId = await upsertVerifiedSyntheticUser(
    SEED_IDS.users.super,
    "super@solarassist.dev",
    "Solar@12345",
    "Sam Superadmin (Test)",
    "super_admin",
    null
  );
  const adminId = await upsertVerifiedSyntheticUser(
    SEED_IDS.users.admin,
    "admin@solarassist.dev",
    "Solar@12345",
    "Solar Assist Admin (Test)",
    "epc_admin",
    org1Id
  );
  const tech1Id = await upsertVerifiedSyntheticUser(
    SEED_IDS.users.tech1,
    "tech1@solarassist.dev",
    "Solar@12345",
    "Tech One (Test)",
    "technician",
    org1Id
  );
  console.log(`   ✓ super@solarassist.dev (${superId})`);
  console.log(`   ✓ admin@solarassist.dev (${adminId})`);
  console.log(`   ✓ tech1@solarassist.dev (${tech1Id})`);

  // 3. Upsert Workforce Teams with Stable UUIDs
  console.log("\n3. Upserting workforce teams for SolarAssist...");
  const teamsPayload = [
    { id: SEED_IDS.teams.teamA, org_id: org1Id, name: "Team A", base_address: "Navi Mumbai Hub", base_latitude: 19.2183, base_longitude: 72.9781, color_code: "#3b82f6", is_active: true },
    { id: SEED_IDS.teams.teamB, org_id: org1Id, name: "Team B", base_address: "Malad West Hub", base_latitude: 19.1860, base_longitude: 72.8485, color_code: "#10b981", is_active: true },
    { id: SEED_IDS.teams.teamC, org_id: org1Id, name: "Team C", base_address: "Dadar Central Hub", base_latitude: 19.0770, base_longitude: 72.9980, color_code: "#f59e0b", is_active: true },
    { id: SEED_IDS.teams.teamD, org_id: org1Id, name: "Team D", base_address: "Panvel Hub", base_latitude: 19.2403, base_longitude: 73.1305, color_code: "#8b5cf6", is_active: true },
    { id: SEED_IDS.teams.teamE, org_id: org1Id, name: "Team E (Pune)", base_address: "Pune Hub", base_latitude: 18.5204, base_longitude: 73.8567, color_code: "#ec4899", is_active: true },
  ];
  await sb.from("technician_teams").upsert(teamsPayload, { onConflict: "id" });

  // Pair tech1 with Team A
  await sb.from("technician_team_members").upsert([
    { team_id: SEED_IDS.teams.teamA, technician_id: tech1Id },
  ], { onConflict: "team_id,technician_id" });
  console.log("   ✓ 5 workforce teams verified with stable UUIDs.");

  // 4. Upsert OEM Integration
  console.log("\n4. Upserting SolisCloud test integration...");
  await sb.from("oem_integrations").upsert([
    {
      id: SEED_IDS.oemIntegration,
      org_id: org1Id,
      provider: "solis",
      is_active: true,
      config: {
        solis_key_id: "1300386381678106385",
        solis_key_secret: "a21fcc244b2f4fe48097ceca92a1c160",
        solis_api_url: "https://www.soliscloud.com:13333",
      },
    },
  ], { onConflict: "id" });

  // 5. Upsert 5 Sites with Stable UUIDs
  console.log("\n5. Upserting 5 test sites with stable UUIDs...");
  const sitesPayload = [
    { id: SEED_IDS.sites.jodhpur, org_id: org1Id, name: "Jodhpur Solar Park", location: "Rajasthan, India", latitude: 26.28, longitude: 73.02, capacity_kwp: 5200, commissioned_on: "2021-03-15", cleaning_cycle_days: 30, last_cleaned_on: "2026-10-10" },
    { id: SEED_IDS.sites.pavagada, org_id: org1Id, name: "Pavagada Plant", location: "Karnataka, India", latitude: 14.10, longitude: 77.27, capacity_kwp: 3800, commissioned_on: "2020-08-20", cleaning_cycle_days: 30, last_cleaned_on: "2026-10-12" },
    { id: SEED_IDS.sites.bhadla, org_id: org1Id, name: "Bhadla Array 3", location: "Rajasthan, India", latitude: 27.53, longitude: 71.91, capacity_kwp: 7500, commissioned_on: "2022-01-10", cleaning_cycle_days: 30, last_cleaned_on: "2026-10-05" },
    { id: SEED_IDS.sites.nevada, org_id: org2Id, name: "Nevada Sunbelt", location: "Nevada, USA", latitude: 36.17, longitude: -115.14, capacity_kwp: 4500, commissioned_on: "2021-11-05", cleaning_cycle_days: 30, last_cleaned_on: "2026-10-15" },
    { id: SEED_IDS.sites.atacama, org_id: org2Id, name: "Atacama Phase 2", location: "Antofagasta, Chile", latitude: -23.65, longitude: -70.40, capacity_kwp: 6200, commissioned_on: "2023-04-18", cleaning_cycle_days: 30, last_cleaned_on: "2026-10-18" },
  ];
  await sb.from("sites").upsert(sitesPayload, { onConflict: "id" });
  console.log("   ✓ 5 test sites upserted.");

  // 6. Upsert Inverters (4 per site = exactly 20 inverters)
  console.log("\n6. Upserting 20 inverters with deterministic IDs and device keys...");
  const invertersPayload: any[] = [];
  const providers = ["solis", "growatt", "sungrow"] as const;

  sitesPayload.forEach((s, sIdx) => {
    for (let i = 0; i < 4; i++) {
      const provider = providers[(sIdx * 4 + i) % providers.length];
      const invId = `00000000-0000-4000-b000-${String(sIdx * 4 + i + 1).padStart(12, "0")}`;
      const oemDeviceId = `${provider.toUpperCase()}-SITE${sIdx + 1}-INV${i + 1}`;
      const cap = Math.round(s.capacity_kwp / 4);

      invertersPayload.push({
        id: invId,
        site_id: s.id,
        oem: provider,
        oem_device_id: oemDeviceId,
        model: provider === "solis" ? "S5-GC50K" : provider === "growatt" ? "MAX 100KTL3" : "SG125HV",
        serial_number: `SN-${oemDeviceId}`,
        capacity_kw: cap,
        string_count: 4,
        status: (sIdx === 0 && i === 0) ? "offline" : "online",
        last_seen_at: new Date().toISOString(),
        installed_on: s.commissioned_on,
      });
    }
  });
  await sb.from("inverters").upsert(invertersPayload, { onConflict: "id" });
  console.log(`   ✓ 20 inverters upserted across 5 sites.`);

  // 7. Upsert Strings (4 per inverter = exactly 80 strings)
  console.log("\n7. Upserting 80 strings with deterministic IDs...");
  const stringsPayload: any[] = [];
  invertersPayload.forEach((inv, invIdx) => {
    for (let strIdx = 1; strIdx <= 4; strIdx++) {
      const globalStrNum = invIdx * 4 + strIdx;
      const strId = `00000000-0000-4000-c000-${String(globalStrNum).padStart(12, "0")}`;
      stringsPayload.push({
        id: strId,
        inverter_id: inv.id,
        string_index: strIdx,
        modules_count: 20,
        capacity_kw: +(inv.capacity_kw / 4).toFixed(2),
        status: (strIdx === 1 && invIdx === 0) ? "underperforming" : "ok",
      });
    }
  });
  await sb.from("strings").upsert(stringsPayload, { onConflict: "id" });
  console.log(`   ✓ 80 strings upserted (4 per inverter).`);

  // 8. Inverter Telemetry (Insert once or skip if already present to guarantee idempotency)
  console.log("\n8. Checking existing inverter telemetry...");
  const { count: existingTelCount } = await sb.from("telemetry").select("*", { count: "exact", head: true });
  if (!existingTelCount || existingTelCount === 0) {
    console.log("   Generating 30 days of synthetic inverter telemetry (360 rows/inv = 7,200 rows)...");
    let allTel: any[] = [];
    for (const inv of invertersPayload) {
      allTel.push(...generateDeterministicTelemetry(inv.id, inv.capacity_kw, 30));
    }
    await insertInBatches("telemetry", allTel, 100);
    console.log(`   ✓ Inserted exactly ${allTel.length} inverter telemetry rows in batches of 100.`);
  } else {
    console.log(`   ✓ Inverter telemetry already present (${existingTelCount} rows). Skipping append to prevent duplicate growth.`);
  }

  // 9. String Telemetry (Insert once or skip if already present)
  console.log("\n9. Checking existing string telemetry...");
  const { count: existingStrTelCount } = await sb.from("string_telemetry").select("*", { count: "exact", head: true });
  if (!existingStrTelCount || existingStrTelCount === 0) {
    console.log("   Generating 14 days of daylight string telemetry (42 rows/string = 3,360 rows)...");
    const allStrTel = generateDeterministicStringTelemetry(stringsPayload, 14);
    await insertInBatches("string_telemetry", allStrTel, 100);
    console.log(`   ✓ Inserted exactly ${allStrTel.length} string telemetry rows in batches of 100.`);
  } else {
    console.log(`   ✓ String telemetry already present (${existingStrTelCount} rows). Skipping append to prevent duplicate growth.`);
  }

  // 10. Upsert Baseline Alerts & Tickets (Stable IDs)
  console.log("\n10. Upserting baseline offline alert and investigation ticket...");
  const offlineInv = invertersPayload[0];
  await sb.from("alerts").upsert([
    {
      id: SEED_IDS.alert1,
      org_id: org1Id,
      site_id: offlineInv.site_id,
      inverter_id: offlineInv.id,
      code: "INV_OFFLINE",
      title: `Inverter ${offlineInv.serial_number} offline`,
      description: "No telemetry received for > 15 minutes.",
      severity: "high",
      status: "open",
    },
  ], { onConflict: "id" });

  await sb.from("tickets").upsert([
    {
      id: SEED_IDS.ticket1,
      org_id: org1Id,
      site_id: offlineInv.site_id,
      alert_id: SEED_IDS.alert1,
      title: `Investigate offline inverter ${offlineInv.serial_number}`,
      priority: "p2",
      assignee_id: tech1Id,
      created_by: adminId,
      sla_due_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    },
  ], { onConflict: "id" });
  console.log("   ✓ Alert and investigation ticket upserted with stable IDs.");

  // 11. Upsert Baseline Cleaning Logs & Rules (Stable IDs)
  console.log("\n11. Upserting baseline cleaning rules and history...");
  const cleaningRules = sitesPayload.map((s) => ({
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 15,
    monsoon_interval_days: 30,
    required_teams: 1,
    is_override: false,
  }));
  await sb.from("site_cleaning_rules").upsert(cleaningRules, { onConflict: "site_id" });

  const cleaningLogs = sitesPayload.map((s, idx) => ({
    id: `00000000-0000-4000-d000-${String(idx + 1).padStart(12, "0")}`,
    site_id: s.id,
    performed_by: tech1Id,
    performed_at: "2026-10-10T09:00:00.000Z",
    remarks: "Scheduled cleaning completed.",
  }));
  await sb.from("cleaning_logs").upsert(cleaningLogs, { onConflict: "id" });
  console.log("   ✓ Cleaning rules and logs upserted.");

  console.log("\n===============================================================");
  console.log("             Scoped Staging Seed Complete                      ");
  console.log("===============================================================");
  console.log(`✓ Organizations: 2 ('solarassist', 'sunwave')`);
  console.log(`✓ Test Auth Users: 3 ('super', 'admin', 'tech1')`);
  console.log(`✓ Workforce Teams: 5 (Team A - Team E)`);
  console.log(`✓ Sites: 5`);
  console.log(`✓ Inverters: 20`);
  console.log(`✓ Strings: 80`);
  console.log(`✓ Inverter Telemetry: 7,200 rows`);
  console.log(`✓ String Telemetry: 3,360 rows`);
  console.log(`✓ Alerts: 1 | Tickets: 1 | Cleaning Rules: 5 | Cleaning Logs: 5`);
  console.log("===============================================================");
}

// Allow dry-run invocation or default execution when called directly
const isDryRun = process.argv.includes("--dry-run");

if (process.argv[1] && (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"))) {
  runScopedStagingSeed(isDryRun).catch((err) => {
    console.error("FATAL ERROR during seed execution:", err);
    process.exit(1);
  });
}

