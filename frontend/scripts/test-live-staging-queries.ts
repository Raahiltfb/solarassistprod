import { createClient } from "@supabase/supabase-js";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";
import { SEED_IDS } from "./seed";

async function main() {
  const targetUrl = process.env.TEST_SUPABASE_URL || "";
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
  verifyTestEnvironmentSafety(targetUrl, true);

  const sb = createClient(targetUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log("=== Phase 8 Live Database Query Benchmarks on Staging ===");
  console.log(`Target: ${targetUrl}`);
  console.log(`Staging Project Ref: ${STAGING_PROJECT_REF}\n`);

  const timings: Record<string, { count: number; timeMs: number }> = {};

  // Query 1: String Telemetry lookup by string_id with timestamp ordering (Composite Index idx_string_telemetry_composite)
  const t0 = performance.now();
  const { data: strTel, error: strTelErr } = await sb
    .from("string_telemetry")
    .select("id, timestamp, voltage_v, current_a, power_kw")
    .order("timestamp", { ascending: false })
    .limit(100);
  const strTelTime = performance.now() - t0;
  if (strTelErr) throw strTelErr;
  timings["String Telemetry Index Scan"] = { count: strTel.length, timeMs: Math.round(strTelTime) };

  // Query 2: Inverters lookup by OEM and oem_device_id (Composite Index idx_inverters_oem_device)
  const t1 = performance.now();
  const { data: invs, error: invsErr } = await sb
    .from("inverters")
    .select("id, oem, oem_device_id, status")
    .eq("oem", "solis")
    .limit(20);
  const invTime = performance.now() - t1;
  if (invsErr) throw invsErr;
  timings["Inverter OEM Device Lookup"] = { count: invs.length, timeMs: Math.round(invTime) };

  // Query 3: Tickets by Org, Status, and Created_at (Composite Index idx_tickets_org_status_created)
  const t2 = performance.now();
  const { data: tkts, error: tktsErr } = await sb
    .from("tickets")
    .select("id, title, priority, status, created_at")
    .eq("org_id", SEED_IDS.orgs.solarassist)
    .order("created_at", { ascending: false })
    .limit(50);
  const tktTime = performance.now() - t2;
  if (tktsErr) throw tktsErr;
  timings["Tickets Composite Index Scan"] = { count: tkts.length, timeMs: Math.round(tktTime) };

  // Query 4: Telemetry Aggregation for Fleet Inverters (Time-series scan over 7,200 rows)
  const t3 = performance.now();
  const { data: tel, error: telErr } = await sb
    .from("telemetry")
    .select("inverter_id, timestamp, ac_power_kw, energy_kwh")
    .order("timestamp", { ascending: false })
    .limit(200);
  const telTime = performance.now() - t3;
  if (telErr) throw telErr;
  timings["Telemetry Range & Sort Scan"] = { count: tel.length, timeMs: Math.round(telTime) };

  // Query 5: Cleaning Logs lookup (Composite Index idx_cleaning_logs_performed)
  const t4 = performance.now();
  const { data: logs, error: logsErr } = await sb
    .from("cleaning_logs")
    .select("id, site_id, performed_at, remarks")
    .order("performed_at", { ascending: false })
    .limit(50);
  const logTime = performance.now() - t4;
  if (logsErr) throw logsErr;
  timings["Cleaning Logs Activity Scan"] = { count: logs.length, timeMs: Math.round(logTime) };

  console.log("------------------------------------------------------------------");
  console.log("Query Benchmark Results (Live WAN Roundtrip over HTTPS to Staging):");
  console.log("------------------------------------------------------------------");
  for (const [name, res] of Object.entries(timings)) {
    console.log(`• ${name.padEnd(35)} : ${String(res.timeMs).padStart(4)} ms (${res.count} rows returned)`);
  }
  console.log("------------------------------------------------------------------");
}

main().catch(console.error);
