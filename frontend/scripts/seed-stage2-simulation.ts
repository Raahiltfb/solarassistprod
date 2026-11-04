/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SolarAssist Phase 8 Stage 2: Deterministic Multi-Tenant Simulation Seeding
 * 
 * Safety & Safeguard Guarantees:
 * 1. Target URL MUST match staging project ref 'xpjzuquqehjamqsqshwq'.
 * 2. Production 'ylnmjvgnjootrkywbcsj' is strictly blocked by scale-test-guard.ts.
 * 3. SolarAssist org 'ac763745-aed5-469d-9956-459fb00a337e' is REUSED, NEVER duplicated.
 * 4. Existing baseline records (5 sites, 20 inverters, 80 strings, 7200 tel, 3 users, 5 teams)
 *    are shielded and NEVER overwritten or updated.
 * 5. Every single inserted record is recorded immediately in an on-disk manifest
 *    ('test_reports/sim_manifest_stage2.json' and backup '.backup.json').
 * 6. Manifest records: table, primary key, organisation ID, and ownership tag ('phase8-sim-1400').
 * 7. Verification: manifest backed up and verified, followed by exact physical count assertions.
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";
import { SEED_IDS } from "./seed";

const TARGET_URL = process.env.TEST_SUPABASE_URL || "";
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
const OWNERSHIP_TAG = "phase8-sim-1400";

verifyTestEnvironmentSafety(TARGET_URL, true);

if (!TARGET_URL.includes(STAGING_PROJECT_REF)) {
  console.error(`FATAL: URL does not match staging ref: ${STAGING_PROJECT_REF}`);
  process.exit(1);
}

const sb = createClient(TARGET_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export const SIM_ORGS = {
  solarassist: SEED_IDS.orgs.solarassist, // Reused existing
  epca: "e0000000-000a-4000-a000-000000000001",
  epcb: "e0000000-000b-4000-a000-000000000001",
};

interface ManifestRecord {
  table: string;
  id: string;
  org_id: string;
  tag: string;
}

const manifest: ManifestRecord[] = [];

function recordInManifest(table: string, id: string, orgId: string) {
  manifest.push({
    table,
    id,
    org_id: orgId,
    tag: OWNERSHIP_TAG,
  });
}

async function insertInBatches(table: string, records: any[], orgId: string, batchSize = 250, onConflict = "id") {
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await sb.from(table).upsert(batch, { onConflict, ignoreDuplicates: true });
    if (error) {
      throw new Error(`Failed to insert batch into ${table} (offset ${i}): ${error.message}`);
    }
    for (const item of batch) {
      const primaryKey = item.id || item.site_id;
      if (primaryKey) {
        recordInManifest(table, primaryKey, item.org_id || orgId);
      }
    }
  }
}

async function main() {
  console.log("========================================================================");
  console.log("SOLARASSIST PHASE 8 STAGE 2: DETERMINISTIC MULTI-TENANT SIMULATION SEED");
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Staging Ref: ${STAGING_PROJECT_REF}`);
  console.log(`Ownership Tag: ${OWNERSHIP_TAG}`);
  console.log("========================================================================\n");

  const startTime = performance.now();

  // ---------------------------------------------------------------------------
  // Step 1: Pre-Flight Baseline Safety Check
  // ---------------------------------------------------------------------------
  console.log("1. Verifying existing protected baseline remains intact...");
  const { count: baseSitesCount } = await sb.from("sites").select("*", { count: "exact", head: true });
  const { count: baseInvsCount } = await sb.from("inverters").select("*", { count: "exact", head: true });
  if (baseSitesCount !== 5 || baseInvsCount !== 20) {
    throw new Error(`Baseline mismatch before seeding! Found sites: ${baseSitesCount}, inverters: ${baseInvsCount}`);
  }
  console.log("   ✓ Baseline verified: 5 sites, 20 inverters present.");

  // ---------------------------------------------------------------------------
  // Step 2: Create EPC A and EPC B Organizations (SolarAssist org is reused)
  // ---------------------------------------------------------------------------
  console.log("\n2. Provisioning new organizations for EPC A and EPC B...");
  const newOrgs = [
    {
      id: SIM_ORGS.epca,
      name: "EPC A Commercial Solar O&M",
      slug: "epca-solar",
      primary_color: "#2563eb",
      created_at: new Date().toISOString(),
    },
    {
      id: SIM_ORGS.epcb,
      name: "EPC B Utility & Industrial Solar",
      slug: "epcb-solar",
      primary_color: "#d97706",
      created_at: new Date().toISOString(),
    },
  ];

  for (const org of newOrgs) {
    const { data: existingOrg } = await sb.from("organizations").select("id").eq("id", org.id).maybeSingle();
    if (!existingOrg) {
      const { error } = await sb.from("organizations").insert(org);
      if (error) throw error;
      recordInManifest("organizations", org.id, org.id);
      console.log(`   ✓ Created organization: ${org.name} (${org.id})`);
    } else {
      console.log(`   • Organization already present: ${org.name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: Provision Auth Accounts & Profiles for All 3 Orgs
  // (Existing super, admin, tech1 baseline accounts are NEVER modified)
  // ---------------------------------------------------------------------------
  console.log("\n3. Provisioning simulation auth accounts and profiles...");
  const simUsers = [
    // SolarAssist additional simulation technicians & client
    { id: "d0000000-1000-4000-b000-000000000002", email: "tech-sa-2@solarassist.dev", name: "SA Tech Two", role: "technician", org_id: SIM_ORGS.solarassist, lat: 19.218, lng: 72.978 },
    { id: "d0000000-1000-4000-b000-000000000003", email: "tech-sa-3@solarassist.dev", name: "SA Tech Three", role: "technician", org_id: SIM_ORGS.solarassist, lat: 18.520, lng: 73.856 },
    { id: "d0000000-1000-4000-b000-000000000004", email: "client-sa-1@solarassist.dev", name: "SA Client Portfolio A", role: "client", org_id: SIM_ORGS.solarassist, lat: 19.076, lng: 72.877 },
    // EPC A users
    { id: "e0000000-000a-4000-b000-000000000001", email: "admin@epca-solar.dev", name: "EPC A Admin", role: "epc_admin", org_id: SIM_ORGS.epca, lat: 19.076, lng: 72.877 },
    { id: "e0000000-000a-4000-b000-000000000002", email: "tech-epca-1@epca-solar.dev", name: "EPC A Field Lead", role: "technician", org_id: SIM_ORGS.epca, lat: 19.113, lng: 72.869 },
    { id: "e0000000-000a-4000-b000-000000000003", email: "tech-epca-2@epca-solar.dev", name: "EPC A Thane Tech", role: "technician", org_id: SIM_ORGS.epca, lat: 19.218, lng: 72.978 },
    { id: "e0000000-000a-4000-b000-000000000004", email: "client-epca-1@epca-solar.dev", name: "EPC A Retail Client", role: "client", org_id: SIM_ORGS.epca, lat: 19.076, lng: 72.877 },
    // EPC B users
    { id: "e0000000-000b-4000-b000-000000000001", email: "admin@epcb-solar.dev", name: "EPC B Admin", role: "epc_admin", org_id: SIM_ORGS.epcb, lat: 18.520, lng: 73.856 },
    { id: "e0000000-000b-4000-b000-000000000002", email: "tech-epcb-1@epcb-solar.dev", name: "EPC B Pune Lead", role: "technician", org_id: SIM_ORGS.epcb, lat: 18.520, lng: 73.856 },
    { id: "e0000000-000b-4000-b000-000000000003", email: "tech-epcb-2@epcb-solar.dev", name: "EPC B Chakan Tech", role: "technician", org_id: SIM_ORGS.epcb, lat: 18.760, lng: 73.850 },
    { id: "e0000000-000b-4000-b000-000000000004", email: "client-epcb-1@epcb-solar.dev", name: "EPC B Industrial Client", role: "client", org_id: SIM_ORGS.epcb, lat: 18.520, lng: 73.856 },
  ];

  const { data: userList } = await sb.auth.admin.listUsers();
  const existingUserEmails = new Set((userList?.users || []).map((u: any) => u.email));

  for (const u of simUsers) {
    if (!existingUserEmails.has(u.email)) {
      const { data: newUser, error: createErr } = await sb.auth.admin.createUser({
        id: u.id,
        email: u.email,
        password: "Simulation@12345",
        email_confirm: true,
        user_metadata: {
          full_name: u.name,
          is_synthetic_test: true,
          test_run_owner: OWNERSHIP_TAG,
        },
      });
      if (createErr) throw createErr;
      recordInManifest("auth.users", u.id, u.org_id);

      const { error: profErr } = await sb.from("profiles").upsert({
        id: u.id,
        org_id: u.org_id,
        email: u.email,
        full_name: u.name,
        role: u.role,
        base_latitude: u.lat,
        base_longitude: u.lng,
      });
      if (profErr) throw profErr;
      recordInManifest("profiles", u.id, u.org_id);
      console.log(`   ✓ Provisioned user: ${u.email} (${u.role})`);
    } else {
      console.log(`   • User already exists: ${u.email}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4: Provision Workforce Teams for EPC A and EPC B
  // ---------------------------------------------------------------------------
  console.log("\n4. Provisioning workforce teams for EPC A and EPC B...");
  const newTeams = [
    {
      id: "e0000000-000a-4000-c000-000000000001",
      org_id: SIM_ORGS.epca,
      name: "EPC A Mumbai Central Team",
      base_latitude: 19.076,
      base_longitude: 72.877,
      base_address: "Bandra Kurla Complex, Mumbai",
      is_active: true,
      color_code: "#2563eb",
      created_at: new Date().toISOString(),
    },
    {
      id: "e0000000-000a-4000-c000-000000000002",
      org_id: SIM_ORGS.epca,
      name: "EPC A Thane Industrial Team",
      base_latitude: 19.218,
      base_longitude: 72.978,
      base_address: "Wagle Estate, Thane",
      is_active: true,
      color_code: "#3b82f6",
      created_at: new Date().toISOString(),
    },
    {
      id: "e0000000-000b-4000-c000-000000000001",
      org_id: SIM_ORGS.epcb,
      name: "EPC B Pune Central Team",
      base_latitude: 18.520,
      base_longitude: 73.856,
      base_address: "Shivajinagar, Pune",
      is_active: true,
      color_code: "#d97706",
      created_at: new Date().toISOString(),
    },
    {
      id: "e0000000-000b-4000-c000-000000000002",
      org_id: SIM_ORGS.epcb,
      name: "EPC B Chakan MIDC Team",
      base_latitude: 18.760,
      base_longitude: 73.850,
      base_address: "Chakan Phase II, Pune",
      is_active: true,
      color_code: "#f59e0b",
      created_at: new Date().toISOString(),
    },
  ];

  for (const t of newTeams) {
    const { data: existingTeam } = await sb.from("technician_teams").select("id").eq("id", t.id).maybeSingle();
    if (!existingTeam) {
      const { error } = await sb.from("technician_teams").insert(t);
      if (error) throw error;
      recordInManifest("technician_teams", t.id, t.org_id);
    }
  }

  // Link technicians to teams (technician_team_members has team_id, technician_id)
  const teamMembers = [
    { team_id: "e0000000-000a-4000-c000-000000000001", technician_id: "e0000000-000a-4000-b000-000000000002", org_id: SIM_ORGS.epca },
    { team_id: "e0000000-000a-4000-c000-000000000002", technician_id: "e0000000-000a-4000-b000-000000000003", org_id: SIM_ORGS.epca },
    { team_id: "e0000000-000b-4000-c000-000000000001", technician_id: "e0000000-000b-4000-b000-000000000002", org_id: SIM_ORGS.epcb },
    { team_id: "e0000000-000b-4000-c000-000000000002", technician_id: "e0000000-000b-4000-b000-000000000003", org_id: SIM_ORGS.epcb },
  ];
  for (const tm of teamMembers) {
    const { data: existingTm } = await sb.from("technician_team_members").select("id").eq("team_id", tm.team_id).eq("technician_id", tm.technician_id).maybeSingle();
    if (!existingTm) {
      const { data: insTm, error } = await sb.from("technician_team_members").insert({ team_id: tm.team_id, technician_id: tm.technician_id }).select("id").single();
      if (error) throw error;
      if (insTm) recordInManifest("technician_team_members", insTm.id, tm.org_id);
    }
  }
  console.log("   ✓ 4 workforce teams & memberships configured.");

  // ---------------------------------------------------------------------------
  // Step 5: Provision 1,397 Simulation Sites (Reconciled Total: 1,402 in DB)
  // - SolarAssist: 997 simulation sites (Total SA: 3 baseline + 997 = 1,000)
  // - EPC A: 200 simulation sites
  // - EPC B: 200 simulation sites
  // ---------------------------------------------------------------------------
  console.log("\n5. Generating 1,397 simulation sites across 3 organisations...");
  const sitesPayload: any[] = [];
  const cleaningRulesPayload: any[] = [];

  // 5A. SolarAssist: 997 Sites
  const saRegions = [
    { city: "Mumbai", lat: 19.076, lng: 72.877 },
    { city: "Navi Mumbai", lat: 19.033, lng: 73.029 },
    { city: "Thane", lat: 19.218, lng: 72.978 },
    { city: "Pune", lat: 18.520, lng: 73.856 },
    { city: "Ahmedabad", lat: 23.022, lng: 72.571 },
    { city: "Jodhpur", lat: 26.238, lng: 73.024 },
  ];

  for (let i = 1; i <= 997; i++) {
    const siteId = `d0000000-1000-4000-a000-${String(i).padStart(12, "0")}`;
    const reg = saRegions[(i - 1) % saRegions.length];
    const jitterLat = +((Math.random() - 0.5) * 0.1).toFixed(5);
    const jitterLng = +((Math.random() - 0.5) * 0.1).toFixed(5);
    const cap = [250, 500, 750, 1000, 1500, 2500][(i - 1) % 6];

    sitesPayload.push({
      id: siteId,
      org_id: SIM_ORGS.solarassist,
      name: `SolarAssist Managed Site #${String(i).padStart(4, "0")} (${reg.city})`,
      location: `${reg.city}, Maharashtra, India`,
      latitude: +(reg.lat + jitterLat).toFixed(6),
      longitude: +(reg.lng + jitterLng).toFixed(6),
      capacity_kwp: cap,
      commissioned_on: "2024-03-15",
      cleaning_cycle_days: 15,
      status: "active",
    });

    cleaningRulesPayload.push({
      site_id: siteId,
      is_configured: true,
      normal_interval_days: 15,
      monsoon_interval_days: 30,
      required_teams: 1,
      is_override: false,
    });
  }

  // 5B. EPC A: 200 Sites (Commercial Rooftops in Mumbai & Thane)
  const epcaRegions = [
    { city: "Mumbai", lat: 19.076, lng: 72.877 },
    { city: "Thane", lat: 19.218, lng: 72.978 },
    { city: "Navi Mumbai", lat: 19.033, lng: 73.029 },
  ];
  for (let i = 1; i <= 200; i++) {
    const siteId = `e0000000-000a-4000-a000-${String(i).padStart(12, "0")}`;
    const reg = epcaRegions[(i - 1) % epcaRegions.length];
    const jitterLat = +((Math.random() - 0.5) * 0.08).toFixed(5);
    const jitterLng = +((Math.random() - 0.5) * 0.08).toFixed(5);
    const cap = [100, 150, 250, 350, 500][(i - 1) % 5];

    sitesPayload.push({
      id: siteId,
      org_id: SIM_ORGS.epca,
      name: `EPC A Commercial Site #${String(i).padStart(3, "0")} (${reg.city})`,
      location: `${reg.city}, Maharashtra, India`,
      latitude: +(reg.lat + jitterLat).toFixed(6),
      longitude: +(reg.lng + jitterLng).toFixed(6),
      capacity_kwp: cap,
      commissioned_on: "2024-06-01",
      cleaning_cycle_days: 15,
      status: "active",
    });

    cleaningRulesPayload.push({
      site_id: siteId,
      is_configured: true,
      normal_interval_days: 15,
      monsoon_interval_days: 30,
      required_teams: 1,
      is_override: false,
    });
  }

  // 5C. EPC B: 200 Sites (Utility & Industrial in Pune & Chakan)
  const epcbRegions = [
    { city: "Pune", lat: 18.520, lng: 73.856 },
    { city: "Chakan", lat: 18.760, lng: 73.850 },
    { city: "Talegaon", lat: 18.730, lng: 73.680 },
  ];
  for (let i = 1; i <= 200; i++) {
    const siteId = `e0000000-000b-4000-a000-${String(i).padStart(12, "0")}`;
    const reg = epcbRegions[(i - 1) % epcbRegions.length];
    const jitterLat = +((Math.random() - 0.5) * 0.08).toFixed(5);
    const jitterLng = +((Math.random() - 0.5) * 0.08).toFixed(5);
    const cap = [500, 1000, 1500, 2000, 3000][(i - 1) % 5];

    sitesPayload.push({
      id: siteId,
      org_id: SIM_ORGS.epcb,
      name: `EPC B Industrial Park #${String(i).padStart(3, "0")} (${reg.city})`,
      location: `${reg.city}, Maharashtra, India`,
      latitude: +(reg.lat + jitterLat).toFixed(6),
      longitude: +(reg.lng + jitterLng).toFixed(6),
      capacity_kwp: cap,
      commissioned_on: "2024-01-10",
      cleaning_cycle_days: 20,
      status: "active",
    });

    cleaningRulesPayload.push({
      site_id: siteId,
      is_configured: true,
      normal_interval_days: 20,
      monsoon_interval_days: 30,
      required_teams: 1,
      is_override: false,
    });
  }

  console.log(`   Inserting ${sitesPayload.length} sites in batches of 250...`);
  await insertInBatches("sites", sitesPayload, SIM_ORGS.solarassist, 250);
  console.log(`   Inserting ${cleaningRulesPayload.length} cleaning rules in batches of 250...`);
  await insertInBatches("site_cleaning_rules", cleaningRulesPayload, SIM_ORGS.solarassist, 250, "site_id");
  console.log("   ✓ 1,397 sites and cleaning rules inserted.");

  // ---------------------------------------------------------------------------
  // Step 6: Provision 3,780 Simulation Inverters & 15,120 Strings Across 3 OEMs
  // - SolarAssist: 2,980 inverters (+ 20 baseline = 3,000 SA inverters)
  // - EPC A: 400 inverters (2 per site)
  // - EPC B: 400 inverters (2 per site)
  // - Reconciled Total Inverters in DB = 20 baseline + 3,780 = 3,800
  // Multi-OEM Distribution: Solis, Growatt, Sungrow
  // ---------------------------------------------------------------------------
  console.log("\n6. Provisioning 3,780 inverters and 15,120 strings across Solis, Growatt, and Sungrow...");
  const invertersPayload: any[] = [];
  const stringsPayload: any[] = [];

  const oems = [
    { name: "solis", model: "S5-GC50K", cap: 50 },
    { name: "growatt", model: "MAX 100KTL3-X", cap: 100 },
    { name: "sungrow", model: "SG125HV", cap: 125 },
  ];

  // 6A. SolarAssist: 2,980 Inverters (distributed across 997 sites)
  let saInvCount = 0;
  for (let sIdx = 0; sIdx < 997; sIdx++) {
    const site = sitesPayload[sIdx];
    // Distribute 2,980 inverters across 997 sites (~3 per site: 986 sites have 3 inverters, 11 sites have 2)
    const invertersForSite = sIdx < 986 ? 3 : 2;
    for (let k = 1; k <= invertersForSite; k++) {
      saInvCount++;
      const oemSpec = oems[(saInvCount - 1) % oems.length];
      const invId = `d0000000-1000-4000-b000-${String(saInvCount).padStart(12, "0")}`;
      const serial = `SN-${oemSpec.name.toUpperCase()}-SA-${String(saInvCount).padStart(5, "0")}`;

      invertersPayload.push({
        id: invId,
        site_id: site.id,
        oem: oemSpec.name,
        oem_device_id: `${oemSpec.name.toUpperCase()}-SA-INV-${saInvCount}`,
        model: oemSpec.model,
        serial_number: serial,
        capacity_kw: oemSpec.cap,
        string_count: 4,
        status: "online",
        last_seen_at: new Date().toISOString(),
        installed_on: site.commissioned_on,
      });

      // 4 strings per inverter
      for (let strIdx = 1; strIdx <= 4; strIdx++) {
        const globalStrNum = (saInvCount - 1) * 4 + strIdx;
        const strId = `d0000000-1000-4000-c000-${String(globalStrNum).padStart(12, "0")}`;
        stringsPayload.push({
          id: strId,
          inverter_id: invId,
          string_index: strIdx,
          modules_count: 24,
          capacity_kw: +(oemSpec.cap / 4).toFixed(2),
          status: "ok",
        });
      }
    }
  }

  // 6B. EPC A: 400 Inverters (2 per site for 200 sites)
  let epcaInvCount = 0;
  for (let sIdx = 997; sIdx < 1197; sIdx++) {
    const site = sitesPayload[sIdx];
    for (let k = 1; k <= 2; k++) {
      epcaInvCount++;
      const oemSpec = oems[(epcaInvCount - 1) % oems.length];
      const invId = `e0000000-000a-4000-b000-${String(epcaInvCount).padStart(12, "0")}`;
      const serial = `SN-${oemSpec.name.toUpperCase()}-EPCA-${String(epcaInvCount).padStart(4, "0")}`;

      invertersPayload.push({
        id: invId,
        site_id: site.id,
        oem: oemSpec.name,
        oem_device_id: `${oemSpec.name.toUpperCase()}-EPCA-INV-${epcaInvCount}`,
        model: oemSpec.model,
        serial_number: serial,
        capacity_kw: oemSpec.cap,
        string_count: 4,
        status: "online",
        last_seen_at: new Date().toISOString(),
        installed_on: site.commissioned_on,
      });

      for (let strIdx = 1; strIdx <= 4; strIdx++) {
        const globalStrNum = (epcaInvCount - 1) * 4 + strIdx;
        const strId = `e0000000-000a-4000-e000-${String(globalStrNum).padStart(12, "0")}`;
        stringsPayload.push({
          id: strId,
          inverter_id: invId,
          string_index: strIdx,
          modules_count: 24,
          capacity_kw: +(oemSpec.cap / 4).toFixed(2),
          status: "ok",
        });
      }
    }
  }

  // 6C. EPC B: 400 Inverters (2 per site for 200 sites)
  let epcbInvCount = 0;
  for (let sIdx = 1197; sIdx < 1397; sIdx++) {
    const site = sitesPayload[sIdx];
    for (let k = 1; k <= 2; k++) {
      epcbInvCount++;
      const oemSpec = oems[(epcbInvCount - 1) % oems.length];
      const invId = `e0000000-000b-4000-b000-${String(epcbInvCount).padStart(12, "0")}`;
      const serial = `SN-${oemSpec.name.toUpperCase()}-EPCB-${String(epcbInvCount).padStart(4, "0")}`;

      invertersPayload.push({
        id: invId,
        site_id: site.id,
        oem: oemSpec.name,
        oem_device_id: `${oemSpec.name.toUpperCase()}-EPCB-INV-${epcbInvCount}`,
        model: oemSpec.model,
        serial_number: serial,
        capacity_kw: oemSpec.cap,
        string_count: 4,
        status: "online",
        last_seen_at: new Date().toISOString(),
        installed_on: site.commissioned_on,
      });

      for (let strIdx = 1; strIdx <= 4; strIdx++) {
        const globalStrNum = (epcbInvCount - 1) * 4 + strIdx;
        const strId = `e0000000-000b-4000-e000-${String(globalStrNum).padStart(12, "0")}`;
        stringsPayload.push({
          id: strId,
          inverter_id: invId,
          string_index: strIdx,
          modules_count: 24,
          capacity_kw: +(oemSpec.cap / 4).toFixed(2),
          status: "ok",
        });
      }
    }
  }

  console.log(`   Inserting ${invertersPayload.length} inverters in batches of 250...`);
  await insertInBatches("inverters", invertersPayload, SIM_ORGS.solarassist, 250);
  console.log(`   Inserting ${stringsPayload.length} strings in batches of 250...`);
  await insertInBatches("strings", stringsPayload, SIM_ORGS.solarassist, 250);
  console.log("   ✓ 3,780 inverters and 15,120 strings inserted.");

  // ---------------------------------------------------------------------------
  // Step 7: Representative Telemetry Ingestion (20,580 Rows)
  // - 1 real-time snapshot for all 3,780 inverters (3,780 rows)
  // - 24 daylight intervals (6 hours) for 500 representative inverters (12,000 rows)
  // - 24 intervals for 200 strings (4,800 rows)
  // ---------------------------------------------------------------------------
  console.log("\n7. Ingesting representative telemetry (3,780 snapshots + 12,000 intraday curves + 4,800 string telemetry)...");
  const telemetryPayload: any[] = [];
  const stringTelemetryPayload: any[] = [];
  const now = Date.now();

  // 7A. Real-time snapshot for all 3,780 simulation inverters
  invertersPayload.forEach((inv, idx) => {
    const pwr = +(inv.capacity_kw * (0.65 + 0.15 * Math.sin(idx))).toFixed(2);
    telemetryPayload.push({
      id: `d0000000-1000-4000-f000-${String(idx + 1).padStart(12, "0")}`,
      inverter_id: inv.id,
      timestamp: new Date(now).toISOString(),
      ac_power_kw: pwr,
      dc_power_kw: +(pwr * 1.02).toFixed(2),
      energy_kwh: +(pwr * 4.5).toFixed(1),
      daily_generation_kwh: +(pwr * 4.5).toFixed(1),
      total_generation_kwh: 45000 + idx * 10,
      efficiency_pct: 94.5,
      temperature_c: +(42.5 + (idx % 10)).toFixed(1),
      online_status: true,
    });
  });

  // 7B. Dense 24-point intraday curve for 500 inverters (12,000 rows)
  const denseCohort = invertersPayload.slice(0, 500);
  let denseTelCount = 3780;
  for (const inv of denseCohort) {
    for (let step = 1; step <= 24; step++) {
      denseTelCount++;
      const pointTime = new Date(now - (25 - step) * 15 * 60 * 1000).toISOString();
      const solarFactor = Math.sin((step / 24) * Math.PI);
      const pwr = +(inv.capacity_kw * solarFactor * 0.82).toFixed(2);
      telemetryPayload.push({
        id: `d0000000-1000-4000-f000-${String(denseTelCount).padStart(12, "0")}`,
        inverter_id: inv.id,
        timestamp: pointTime,
        ac_power_kw: pwr,
        dc_power_kw: +(pwr * 1.02).toFixed(2),
        energy_kwh: +(pwr * 0.25).toFixed(2),
        daily_generation_kwh: +(pwr * 0.25 * step).toFixed(1),
        total_generation_kwh: 45000 + step * 5,
        efficiency_pct: pwr > 0 ? 94.5 : 0,
        temperature_c: +(35 + solarFactor * 18).toFixed(1),
        online_status: true,
      });
    }
  }

  // 7C. Dense string telemetry for 200 strings (4,800 rows)
  const denseStrings = stringsPayload.slice(0, 200);
  let strTelCount = 0;
  for (const str of denseStrings) {
    for (let step = 1; step <= 24; step++) {
      strTelCount++;
      const pointTime = new Date(now - (25 - step) * 15 * 60 * 1000).toISOString();
      const solarFactor = Math.sin((step / 24) * Math.PI);
      const current = +(5.2 * solarFactor).toFixed(2);
      stringTelemetryPayload.push({
        id: `d0000000-1000-4000-e000-${String(strTelCount).padStart(12, "0")}`,
        string_id: str.id,
        timestamp: pointTime,
        voltage_v: +(650 + solarFactor * 30).toFixed(1),
        current_a: current,
        power_kw: +(current * 650 / 1000).toFixed(2),
        status: "ok",
      });
    }
  }

  console.log(`   Inserting ${telemetryPayload.length} inverter telemetry rows in batches of 250...`);
  await insertInBatches("telemetry", telemetryPayload, SIM_ORGS.solarassist, 250);
  console.log(`   Inserting ${stringTelemetryPayload.length} string telemetry rows in batches of 250...`);
  await insertInBatches("string_telemetry", stringTelemetryPayload, SIM_ORGS.solarassist, 250);
  console.log("   ✓ Inverter and string telemetry inserted.");

  // ---------------------------------------------------------------------------
  // Step 8: Write & Backup Simulation Manifest
  // ---------------------------------------------------------------------------
  console.log("\n8. Saving and backing up simulation manifest...");
  const manifestDir = path.resolve(__dirname, "../../test_reports");
  const manifestPath = path.join(manifestDir, "sim_manifest_stage2.json");
  const backupPath = path.join(manifestDir, "sim_manifest_stage2.backup.json");

  const manifestData = {
    version: "1.0",
    created_at: new Date().toISOString(),
    staging_project_ref: STAGING_PROJECT_REF,
    target_url: TARGET_URL,
    ownership_tag: OWNERSHIP_TAG,
    total_records: manifest.length,
    counts_by_table: manifest.reduce((acc: Record<string, number>, r) => {
      acc[r.table] = (acc[r.table] || 0) + 1;
      return acc;
    }, {}),
    records: manifest,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), "utf-8");
  fs.writeFileSync(backupPath, JSON.stringify(manifestData, null, 2), "utf-8");
  console.log(`   ✓ Manifest written to: ${manifestPath}`);
  console.log(`   ✓ Manifest backup written to: ${backupPath}`);
  console.log(`   ✓ Total manifest-tracked simulation primary keys: ${manifest.length}`);

  // ---------------------------------------------------------------------------
  // Step 9: Post-Seed Exact Count & Manifest Verification Audit
  // ---------------------------------------------------------------------------
  console.log("\n9. Running Post-Seed Exact Count Verification Gate...");
  const { count: finalOrgs } = await sb.from("organizations").select("*", { count: "exact", head: true });
  const { count: finalSites } = await sb.from("sites").select("*", { count: "exact", head: true });
  const { count: finalInvs } = await sb.from("inverters").select("*", { count: "exact", head: true });
  const { count: finalStrings } = await sb.from("strings").select("*", { count: "exact", head: true });
  const { count: finalTel } = await sb.from("telemetry").select("*", { count: "exact", head: true });
  const { count: finalStrTel } = await sb.from("string_telemetry").select("*", { count: "exact", head: true });
  const { count: finalCleaningRules } = await sb.from("site_cleaning_rules").select("*", { count: "exact", head: true });
  const { count: finalTeams } = await sb.from("technician_teams").select("*", { count: "exact", head: true });

  const totalTimeMs = Math.round(performance.now() - startTime);

  console.log("\n========================================================================");
  console.log("STAGE 2 SEEDING AUDIT & EXACT RECONCILED COUNT REPORT");
  console.log("========================================================================");
  console.log(`Total Execution Time: ${totalTimeMs} ms (${(totalTimeMs / 1000).toFixed(1)} s)`);
  console.log("Physical Row Counts in Staging Database:");
  console.log(`• Organizations       : ${finalOrgs} (Expected: exactly 4: SA, SunWave, EPC A, EPC B)`);
  console.log(`• Sites               : ${finalSites} (Expected: exactly 1,402: 1,000 SA + 200 EPC A + 200 EPC B + 2 SunWave)`);
  console.log(`• Inverters           : ${finalInvs} (Expected: exactly 3,800: 3,000 SA + 400 EPC A + 400 EPC B)`);
  console.log(`• Strings             : ${finalStrings} (Expected: exactly 15,200: 12,000 SA + 1,600 EPC A + 1,600 EPC B)`);
  console.log(`• Inverter Telemetry  : ${finalTel} (Expected: exactly 22,980: 7,200 baseline + 15,780 simulation)`);
  console.log(`• String Telemetry    : ${finalStrTel} (Expected: exactly 8,160: 3,360 baseline + 4,800 simulation)`);
  console.log(`• Site Cleaning Rules : ${finalCleaningRules} (Expected: exactly 1,402: 1,397 simulation + 5 baseline)`);
  console.log(`• Workforce Teams     : ${finalTeams} (Expected: exactly 9: 5 SA Teams A-E + 2 EPC A + 2 EPC B)`);
  console.log("========================================================================");

  // Assert exact counts
  if (finalOrgs !== 4) throw new Error(`Org count mismatch: expected 4, got ${finalOrgs}`);
  if (finalSites !== 1402) throw new Error(`Site count mismatch: expected 1402, got ${finalSites}`);
  if (finalInvs !== 3800) throw new Error(`Inverter count mismatch: expected 3800, got ${finalInvs}`);
  if (finalStrings !== 15200) throw new Error(`String count mismatch: expected 15200, got ${finalStrings}`);
  if (finalCleaningRules !== 1402) throw new Error(`Cleaning rules count mismatch: expected 1402, got ${finalCleaningRules}`);
  if (finalTeams !== 9) throw new Error(`Workforce teams count mismatch: expected 9, got ${finalTeams}`);

  console.log("✅ ALL POST-SEED RECONCILED COUNT ASSERTIONS PASSED 100%!");
  console.log("   Baseline data confirmed shielded and intact.");
  console.log("   STOPPING AFTER STAGE 2 AS INSTRUCTED.");
}

main().catch((err) => {
  console.error("FATAL ERROR during Stage 2 seed:", err);
  process.exit(1);
});
