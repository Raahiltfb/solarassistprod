/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Solar Assist — seed script
 *
 * Run: `yarn seed`
 * Applies the SQL schema (migrations/0001_init.sql) and populates realistic
 * mock data: 2 organizations, 5 sites, 20 inverters, 48h telemetry per inverter,
 * demo users (admin / tech / client), alerts, tickets, cleaning logs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !KEY) {
  console.error("Missing Supabase env vars. Ensure .env.local is loaded (try `npx dotenv-cli -e .env.local -- yarn seed`).");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function applySchema() {
  console.log("→ applying schema (0001_init.sql)…");
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0001_init.sql"), "utf8");
  // Execute via pg_rest — use raw SQL through rpc if exec_sql function exists, otherwise instruct user.
  // @ts-ignore – no typed rpc
  const { error } = await (sb as any).rpc("exec_sql", { sql });
  if (error) {
    console.warn("⚠ Could not auto-apply schema via rpc:", error.message);
    console.warn("⚠ Please paste `supabase/migrations/0001_init.sql` into Supabase Studio → SQL Editor and run once.");
  } else {
    console.log("✓ schema applied");
  }
}

async function upsertUser(email: string, password: string, fullName: string, role: string, orgId: string | null) {
  const { data: existing } = await sb.auth.admin.listUsers();
  let userId: string;
  const found = existing?.users?.find((u) => u.email === email);
  if (found) {
    userId = found.id;
    await sb.auth.admin.updateUserById(userId, { password, user_metadata: { full_name: fullName } });
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw new Error(`createUser(${email}): ${error?.message}`);
    userId = data.user.id;
  }
  await sb.from("profiles").upsert({ id: userId, email, full_name: fullName, role, org_id: orgId }, { onConflict: "id" });
  return userId;
}

function randomTelemetry(capacityKw: number, hoursBack = 48) {
  const out: any[] = [];
  const now = Date.now();
  let cumEnergy = 0;
  for (let h = hoursBack; h >= 0; h--) {
    const t = new Date(now - h * 3600_000);
    const hour = t.getHours();
    // Solar bell curve 6am-6pm
    const bell = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const noise = 0.85 + Math.random() * 0.3;
    const ac = +(capacityKw * bell * noise).toFixed(3);
    const dc = +(ac * 1.05).toFixed(3);
    cumEnergy += ac;
    if (hour === 0) cumEnergy = 0; // reset daily
    out.push({
      timestamp: t.toISOString(),
      ac_power_kw: ac,
      dc_power_kw: dc,
      energy_kwh: +cumEnergy.toFixed(3),
      efficiency_pct: +(92 + Math.random() * 5).toFixed(2),
      temperature_c: +(30 + Math.random() * 20).toFixed(1),
    });
  }
  return out;
}

async function main() {
  await applySchema();

  console.log("→ wiping old data…");
  await sb.from("telemetry").delete().gt("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("alerts").delete().gt("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("tickets").delete().gt("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("cleaning_logs").delete().gt("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("strings").delete().gt("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("inverters").delete().gt("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("sites").delete().gt("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("organizations").delete().gt("id", "00000000-0000-0000-0000-000000000000");

  console.log("→ organizations");
  const [org1, org2] = await Promise.all([
    sb.from("organizations").insert({ name: "Heliogrid Energy", slug: "heliogrid", primary_color: "#f59e0b" }).select().single(),
    sb.from("organizations").insert({ name: "SunWave EPC", slug: "sunwave", primary_color: "#0ea5e9" }).select().single(),
  ]);
  const org1Id = org1.data!.id, org2Id = org2.data!.id;

  console.log("→ demo users");
  const superId = await upsertUser("super@solarassist.dev", "Solar@12345", "Sam Superadmin", "super_admin", null);
  const admin1 = await upsertUser("admin@heliogrid.dev", "Solar@12345", "Alex Admin", "epc_admin", org1Id);
  const tech1 = await upsertUser("tech@heliogrid.dev", "Solar@12345", "Tara Technician", "technician", org1Id);
  const client1 = await upsertUser("client@heliogrid.dev", "Solar@12345", "Chris Client", "client", org1Id);
  void superId; void tech1;

  console.log("→ sites + assets");
  const sitesSeed = [
    { org_id: org1Id, name: "Jodhpur Solar Park", location: "Rajasthan, India", lat: 26.28, lon: 73.02, cap: 5200 },
    { org_id: org1Id, name: "Pavagada Plant", location: "Karnataka, India", lat: 14.10, lon: 77.27, cap: 3800 },
    { org_id: org1Id, name: "Bhadla Array 3", location: "Rajasthan, India", lat: 27.53, lon: 71.91, cap: 7500 },
    { org_id: org2Id, name: "Nevada Sunbelt", location: "Nevada, USA", lat: 36.17, lon: -115.14, cap: 4500 },
    { org_id: org2Id, name: "Atacama Phase 2", location: "Antofagasta, Chile", lat: -23.65, lon: -70.40, cap: 6200 },
  ];

  for (const s of sitesSeed) {
    const { data: site } = await sb.from("sites").insert({
      org_id: s.org_id, name: s.name, location: s.location,
      latitude: s.lat, longitude: s.lon, capacity_kwp: s.cap,
      commissioned_on: "2022-06-15", cleaning_cycle_days: 30,
      last_cleaned_on: new Date(Date.now() - (10 + Math.floor(Math.random() * 40)) * 86400_000).toISOString().slice(0, 10),
      client_id: s.org_id === org1Id ? client1 : null,
    }).select().single();

    // 4 inverters per site
    const invCount = 4;
    const providers = ["solis", "growatt", "sungrow"] as const;
    for (let i = 0; i < invCount; i++) {
      const provider = providers[i % providers.length];
      const cap = Math.round(s.cap / invCount);
      const { data: inv } = await sb.from("inverters").insert({
        site_id: site!.id,
        oem: provider,
        oem_device_id: `${provider.toUpperCase()}-${site!.id.slice(0, 6)}-${i}`,
        model: provider === "solis" ? "S5-GC50K" : provider === "growatt" ? "MAX 100KTL3" : "SG125HV",
        serial_number: randomUUID().slice(0, 10).toUpperCase(),
        capacity_kw: cap,
        string_count: 8,
        status: Math.random() > 0.9 ? "offline" : "online",
        last_seen_at: new Date().toISOString(),
        installed_on: "2022-06-15",
      }).select().single();

      // strings
      const strings = Array.from({ length: 8 }, (_, idx) => ({
        inverter_id: inv!.id, string_index: idx + 1, modules_count: 20,
        capacity_kw: +(cap / 8).toFixed(2),
        status: Math.random() > 0.85 ? "underperforming" : "ok",
      }));
      await sb.from("strings").insert(strings);

      // telemetry (last 48h, hourly)
      const tel = randomTelemetry(cap, 48).map((t) => ({ ...t, inverter_id: inv!.id }));
      // insert in chunks
      for (let k = 0; k < tel.length; k += 500) {
        await sb.from("telemetry").insert(tel.slice(k, k + 500));
      }

      // occasional alert on offline inverters
      if (inv!.status === "offline") {
        const { data: al } = await sb.from("alerts").insert({
          org_id: s.org_id, site_id: site!.id, inverter_id: inv!.id,
          code: "INV_OFFLINE", title: `Inverter ${inv!.serial_number} offline`,
          description: "No telemetry received for > 15 minutes.",
          severity: "high", status: "open",
        }).select().single();
        await sb.from("tickets").insert({
          org_id: s.org_id, site_id: site!.id, alert_id: al!.id,
          title: `Investigate offline inverter ${inv!.serial_number}`,
          priority: "p2", assignee_id: tech1, created_by: admin1,
          sla_due_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
        });
      }
    }

    // 1 string fault alert per site
    await sb.from("alerts").insert({
      org_id: s.org_id, site_id: site!.id,
      code: "STR_UNDERPERF", title: `Underperforming strings detected at ${s.name}`,
      description: "Two strings trending 15% below baseline vs irradiance.",
      severity: "medium", status: "open",
    });

    // cleaning history
    await sb.from("cleaning_logs").insert([
      {
        site_id: site!.id, performed_by: tech1,
        performed_at: new Date(Date.now() - 45 * 86400_000).toISOString(),
        remarks: "Full dry-clean with rotary brush. Dust accumulation moderate.",
      },
      {
        site_id: site!.id, performed_by: tech1,
        performed_at: new Date(Date.now() - 15 * 86400_000).toISOString(),
        remarks: "Partial cleaning, water only. 3 rows deferred to next cycle.",
      },
    ]);
  }

  console.log("\n✓ seed complete");
  console.log("  🔑 super@solarassist.dev      / Solar@12345");
  console.log("  🔑 admin@heliogrid.dev        / Solar@12345");
  console.log("  🔑 tech@heliogrid.dev         / Solar@12345");
  console.log("  🔑 client@heliogrid.dev       / Solar@12345");
}

main().catch((e) => { console.error(e); process.exit(1); });
