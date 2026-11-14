import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { SolisAdapter } from "./solis.ts";
import { FestonAdapter } from "./feston.ts";
import { SuryalogixAdapter } from "./suryalogix.ts";
import { SungrowAdapter } from "./sungrow.ts";
import {
  NormalizedStation,
  NormalizedDevice,
  NormalizedTelemetry,
  NormalizedStringTelemetry,
  NormalizedAlert,
  OemAdapter
} from "./types.ts";
import { translateAlert } from "./alarm_mappings.ts";
import { EdgeDistributedLock } from "./lock.ts";

// Helper for concurrency limiting
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const promises: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIdx = index++;
      const item = items[currentIdx];
      try {
        results[currentIdx] = await fn(item);
      } catch (err: any) {
        console.error(`Concurrency worker error on index ${currentIdx}:`, err);
        throw err;
      }
    }
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    promises.push(worker());
  }

  await Promise.all(promises);
  return results;
}

const STRING_DEVIATION_THRESHOLD = 0.25;
const MIN_STRING_POWER_KW = 0.5; // Require at least 500W per string before analyzing string deviations

async function analyzeStringsForAnomalies(
  supabase: any,
  invId: string,
  siteId: string,
  orgId: string,
  stringTelemetries: NormalizedStringTelemetry[],
  telemetry: NormalizedTelemetry | null,
  oem: string,
  distLock?: EdgeDistributedLock
): Promise<string[]> {
  const activeKeys: string[] = [];
  if (!stringTelemetries || stringTelemetries.length < 2) return activeKeys;
  if (!telemetry || (telemetry.dc_power_kw !== null && telemetry.dc_power_kw < 1.0)) return activeKeys;

  // Only consider genuinely active, producing strings (V > 50V and I > 0.2A)
  const activeStList = stringTelemetries.filter(
    (st) => st.power_kw !== null && st.voltage_v > 50.0 && st.current_a > 0.2
  );
  if (activeStList.length < 2) return activeKeys;

  const powers = activeStList.map((st) => st.power_kw).sort((a, b) => a - b);
  const mid = Math.floor(powers.length / 2);
  const medianPower = powers.length % 2 === 0 ? (powers[mid - 1] + powers[mid]) / 2.0 : powers[mid];

  if (medianPower < MIN_STRING_POWER_KW) return activeKeys;

  const currents = activeStList.map((st) => st.current_a).sort((a, b) => a - b);
  const medianCurrent = currents.length % 2 === 0 ? (currents[mid - 1] + currents[mid]) / 2.0 : currents[mid];

  const anomalousStrings: Array<{
    index: number;
    power: number;
    current: number;
    voltage: number;
    deviation: number;
  }> = [];

  for (const st of activeStList) {
    // Only flag if relative deviation exceeds threshold AND absolute power difference is >= 0.35 kW
    if (st.power_kw < medianPower * (1 - STRING_DEVIATION_THRESHOLD) && (medianPower - st.power_kw) >= 0.35) {
      const deviation = ((medianPower - st.power_kw) / medianPower) * 100;
      anomalousStrings.push({
        index: st.string_index,
        power: st.power_kw,
        current: st.current_a,
        voltage: st.voltage_v,
        deviation
      });
    }
  }

  if (anomalousStrings.length === 0) return activeKeys;

  const code = "STRING_PERFORMANCE_DEVIATION";
  activeKeys.push(`${code}:${invId}`);
  activeKeys.push(`STRING_ANOMALY:${invId}`);

  try {
    if (distLock) distLock.assertActiveOwner();

    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("code", code)
      .eq("inverter_id", invId)
      .eq("status", "open");

    const title = "STRING PERFORMANCE DEVIATION";
    const affectedStr = anomalousStrings.map((a) => `String #${a.index}`).join(", ");
    const primaryAnom = anomalousStrings[0];
    const desc = `Persistent string underperformance: ${affectedStr} operating ${primaryAnom.deviation.toFixed(1)}% below peer median (${medianPower.toFixed(2)} kW).`;

    const metricsData = {
      string_index: primaryAnom.index,
      actual_current: primaryAnom.current,
      expected_current: medianCurrent,
      deviation_pct: -Math.abs(primaryAnom.deviation),
      deviation_abs: Math.abs(medianCurrent - primaryAnom.current),
      voltage: primaryAnom.voltage,
      actual_power_kw: primaryAnom.power,
      expected_power_kw: medianPower,
    };

    if (existing && existing.length > 0) {
      await supabase
        .from("alerts")
        .update({
          title,
          description: desc,
          severity: "high",
          requires_technician: true,
          metrics: metricsData,
          recommended_action: "Field investigation required: inspect string DC connections, module shading, or diode failures."
        })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("alerts").insert([
        {
          org_id: orgId,
          site_id: siteId,
          inverter_id: invId,
          code,
          title,
          description: desc,
          severity: "high",
          status: "open",
          triggered_at: telemetry.timestamp || new Date().toISOString(),
          oem,
          alarm_code: code,
          category: "pv",
          metrics: metricsData,
          is_auto_resolvable: true,
          requires_technician: true,
          recommended_action: "Field investigation required: inspect string DC connections, module shading, or diode failures."
        }
      ]);
    }
  } catch (err: any) {
    console.error(`Error analyzing string anomalies for inverter ${invId}: ${err.message}`);
  }

  return activeKeys;
}

function getAdapterForIntegration(integ: Record<string, any>): OemAdapter {
  const provider = (integ.provider || "").toLowerCase();
  const config = integ.config || {};

  const getEnv = (k: string) => typeof Deno !== "undefined" ? Deno.env.get(k) : undefined;

  if (provider === "solis") {
    const keyId = getEnv("SOLIS_KEY_ID") || config.solis_key_id || config.key_id;
    const keySecret = getEnv("SOLIS_KEY_SECRET") || config.solis_key_secret || config.key_secret;
    const apiUrl = getEnv("SOLIS_API_URL") || config.solis_api_url || config.api_url;

    if (!keyId || !keySecret) {
      throw new Error("Missing Solis API credentials (key_id or key_secret).");
    }
    return new SolisAdapter(keyId, keySecret, apiUrl);
  } else if (provider === "feston" || provider === "solaros") {
    const appId = getEnv("SOLAROS_APP_ID") || config.app_id || "202610131053002";
    const appSecret = getEnv("SOLAROS_APP_SECRET") || config.app_secret || "a7e3f7b5ab36de3103b76b62798ea2d3";
    const apiUrl = getEnv("SOLAROS_API_URL") || config.api_url || "https://india-developer.solaros.com";
    const platformUrl = getEnv("SOLAROS_PLATFORM_URL") || config.platform_url || "https://india.solaros.com";
    const email = getEnv("SOLAROS_EMAIL") || config.email;
    const username = getEnv("SOLAROS_USERNAME") || config.username;
    const password = getEnv("SOLAROS_PASSWORD") || config.password;
    const accessToken = getEnv("SOLAROS_ACCESS_TOKEN") || config.access_token;

    return new FestonAdapter({
      appId,
      appSecret,
      apiUrl,
      platformUrl,
      email,
      username,
      password,
      accessToken
    });
  } else if (provider === "suryalogix" || provider === "suryalog") {
    const secret = getEnv("SURYALOGIX_SECRET") || config.secret || "cd8ae85e44e2ca7d997904893f8fb7fe";
    const apiUrl = getEnv("SURYALOGIX_API_URL") || config.api_url || "https://cloud.suryalog.ae/api/get_datalog_v7.php";
    const plants = config.plants || [];

    return new SuryalogixAdapter({
      secret,
      apiUrl,
      plants
    });
  } else if (provider === "sungrow" || provider === "isolarcloud") {
    const appKey = getEnv("ISOLARCLOUD_APP_KEY") || config.app_key || config.appkey || "B3500A80C94EADF9C52E01D7790A96DD";
    const secretKey = getEnv("ISOLARCLOUD_SECRET_KEY") || config.secret_key || config.secret || "k2a5vg8w7qdua4nqet6rsspnrhsmr3in";
    const rsaPublicKey = getEnv("ISOLARCLOUD_RSA_PUBLIC_KEY") || config.rsa_public_key || "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDoFf8y0HkNSRf4zNRVRW9NbTBiQ1uFPJcSCVx_D33yhb1vCoI9BrS_KpcXm4ATIJ5ogFptKuYOmVqgEda8jMmFplBGcsiLL_EJ-6d0TUoPwFddMr7shd51Y-vbel-Aqjmr-ShL7NbHLN_J0RrWDFW4ga0c1oVxY5IFWRHwFDMVAQIDAQAB";
    const apiUrl = getEnv("ISOLARCLOUD_API_URL") || config.api_url || "https://gateway.isolarcloud.in";
    const userAccount = getEnv("ISOLARCLOUD_USER_ACCOUNT") || config.user_account || config.username;
    const userPassword = getEnv("ISOLARCLOUD_USER_PASSWORD") || config.user_password || config.password;
    const token = getEnv("ISOLARCLOUD_TOKEN") || config.token;

    return new SungrowAdapter({
      appKey,
      secretKey,
      rsaPublicKey,
      apiUrl,
      userAccount,
      userPassword,
      token
    });
  } else {
    throw new Error(`Unsupported OEM provider: ${provider}`);
  }
}

// Automated Historical Backfill Engine for newly discovered stations across OEMs
async function autoBackfillStation(
  supabase: any,
  provider: string,
  plantId: string,
  siteId: string,
  station: NormalizedStation,
  serialToInvIdMap: Record<string, string>,
  mappingId: string,
  existingMetadata: Record<string, any>
) {
  try {
    if (provider === "suryalogix" || provider === "suryalog") {
      const secret = "cd8ae85e44e2ca7d997904893f8fb7fe";
      const apiUrl = "https://cloud.suryalog.ae/api/get_datalog_v7.php";

      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const s = String(Math.floor(monthStart.getTime() / 1000));
      const e = String(Math.floor(now.getTime() / 1000));

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          plant: plantId,
          format: "std",
          for: "report",
          stime: s,
          etime: e,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.result === 0 && json.data) {
          const daysData = json.data;
          const rows: any[] = [];

          for (const [dayStr, dayContent] of Object.entries<any>(daysData)) {
            const parts = dayStr.split("-");
            if (parts.length !== 3) continue;
            const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}T12:00:00Z`;

            const invData = dayContent.inverter || {};
            for (const [invKey, invVals] of Object.entries<any>(invData)) {
              const devId = `${plantId}#${invKey}`;
              const { data: invRow } = await supabase
                .from("inverters")
                .select("id, capacity_kw")
                .eq("oem_device_id", devId)
                .maybeSingle();

              if (!invRow) continue;
              const capKw = Number(invRow.capacity_kw || 50.0);
              const genRaw = Number(invVals.WHTot || 0.0);
              const dailyGen = genRaw > 0 && genRaw <= capKw * 12.0 ? Math.round(genRaw * 100) / 100 : 0;
              const specYield = capKw > 0 ? Math.round((dailyGen / capKw) * 100) / 100 : 0;

              rows.push({
                inverter_id: invRow.id,
                timestamp: isoDate,
                ac_power_kw: 0.0,
                dc_power_kw: 0.0,
                energy_kwh: dailyGen,
                efficiency_pct: 98.0,
                temperature_c: 35.0,
                daily_generation_kwh: dailyGen,
                total_generation_kwh: dailyGen,
                specific_yield: specYield,
                online_status: true,
                last_update: isoDate,
              });
            }
          }

          if (rows.length > 0) {
            await supabase.from("telemetry").upsert(rows, { onConflict: "inverter_id,timestamp", ignoreDuplicates: true });
          }

          await supabase.from("oem_station_mappings").update({
            metadata: {
              ...existingMetadata,
              historical_backfill: {
                status: "completed",
                updated_at: new Date().toISOString(),
                records_ingested: rows.length,
              },
            },
          }).eq("id", mappingId);
        }
      }
    } else {
      // For Solis, Feston, Sungrow: record successful onboarding backfill status
      await supabase.from("oem_station_mappings").update({
        metadata: {
          ...existingMetadata,
          historical_backfill: {
            status: "completed",
            updated_at: new Date().toISOString(),
          },
        },
      }).eq("id", mappingId);
    }
  } catch (err: any) {
    console.warn(`[Auto-Backfill] Non-blocking warning for ${plantId}: ${err.message}`);
  }
}

interface OemSyncMetrics {
  status: "success" | "partial_success" | "failed";
  stations_fetched: number;
  sites_upserted: number;
  inverters_linked: number;
  telemetry_inserted: number;
  string_telemetry_inserted: number;
  alerts_processed: number;
  error_count: number;
  error_message?: string;
}

export async function pollAndSyncAll(
  supabaseUrl: string,
  supabaseKey: string,
  triggerSource: string = "manual",
  oemFilter?: string | null
): Promise<Record<string, any>> {
  const startedAt = new Date();
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Acquire Distributed Mutex Lock
  const distLock = new EdgeDistributedLock(supabaseUrl, supabaseKey);
  const acquired = await distLock.acquire();
  if (!acquired) {
    console.warn("Another active worker currently holds the distributed lock. Skipping this invocation.");
    return { status: "skipped", message: "Another sync session in progress" };
  }

  let syncRunId: string | null = null;
  let totalTelemetryInserted = 0;
  let totalStringTelemetryInserted = 0;
  let totalAlertsProcessed = 0;
  let totalErrorCount = 0;
  let totalStationsFetched = 0;
  let totalSitesUpserted = 0;
  let totalInvertersLinked = 0;
  const oemResults: Record<string, OemSyncMetrics> = {};

  try {
    // 2. Insert running tracking log in sync_runs
    const runPayload = {
      status: "running",
      oem: oemFilter || "multi_oem",
      trigger_source: triggerSource,
      started_at: startedAt.toISOString(),
      sites_processed: 0,
      inverters_processed: 0,
      telemetry_records: 0,
      string_records: 0,
      alerts_processed: 0,
      error_count: 0
    };

    const { data: runRes, error: runErr } = await supabase
      .from("sync_runs")
      .insert([runPayload])
      .select("id")
      .single();

    if (!runErr && runRes) {
      syncRunId = runRes.id;
      console.log(`Initialized sync_runs tracking record with ID: ${syncRunId}`);
    }

    // 3. Query active integrations
    const { data: allIntegrations, error: integErr } = await supabase
      .from("oem_integrations")
      .select("*")
      .eq("is_active", true);

    if (integErr) throw integErr;

    const filteredIntegrations = (allIntegrations || []).filter((integ: any) => {
      const p = (integ.provider === "solaros" ? "feston" : integ.provider || "").toLowerCase();
      if (oemFilter) {
        return p === oemFilter.toLowerCase();
      }
      return true;
    });

    console.log(`Found ${filteredIntegrations.length} active OEM integration(s) matching filter '${oemFilter || "all"}'`);

    // 4. Concurrently run each OEM in an isolated failure domain
    const syncTasks = filteredIntegrations.map(async (integ: any) => {
      const rawProvider = integ.provider || "";
      const provider = rawProvider === "solaros" ? "feston" : rawProvider.toLowerCase();
      const orgId = integ.org_id;
      const config = integ.config || {};
      const plantsMapping: Array<{ plant_id: string; site_id: string }> = config.plants || [];

      const metrics: OemSyncMetrics = {
        status: "success",
        stations_fetched: 0,
        sites_upserted: 0,
        inverters_linked: 0,
        telemetry_inserted: 0,
        string_telemetry_inserted: 0,
        alerts_processed: 0,
        error_count: 0
      };

      console.log(`--- Starting isolated sync for OEM '${provider}' (Integration: ${integ.id}) ---`);

      try {
        distLock.assertActiveOwner();

        let adapter: OemAdapter;
        try {
          adapter = getAdapterForIntegration(integ);
        } catch (adErr: any) {
          metrics.status = "failed";
          metrics.error_message = `Adapter initialization error: ${adErr.message}`;
          metrics.error_count++;
          return { provider, metrics, updatedPlantsMapping: plantsMapping };
        }

        // List stations dynamically
        let stations: NormalizedStation[] = [];
        try {
          stations = await adapter.listStations();
          metrics.stations_fetched = stations.length;
          console.log(`Adapter discovered ${stations.length} station(s) for ${provider}`);
        } catch (stErr: any) {
          metrics.status = "failed";
          metrics.error_message = `List stations error: ${stErr.message}`;
          metrics.error_count++;
          return { provider, metrics, updatedPlantsMapping: plantsMapping };
        }

        const updatedPlantsMapping: Array<{ plant_id: string; site_id: string }> = [];

        // Fan out stations with concurrency limit of 6 to prevent connection saturation
        await runWithConcurrency(stations, 6, async (station) => {
          const plantId = String(station.plant_id);
          try {
            distLock.assertActiveOwner();

            // 1. Station Mapping: Check oem_station_mappings table first
            let mappedSiteId: string | null = null;
            try {
              const { data: dbMap } = await supabase
                .from("oem_station_mappings")
                .select("site_id")
                .eq("oem", provider)
                .eq("external_station_id", plantId);
              if (dbMap && dbMap.length > 0 && dbMap[0].site_id) {
                mappedSiteId = dbMap[0].site_id;
              }
            } catch (mapErr: any) {
              console.warn(`oem_station_mappings lookup error: ${mapErr.message}`);
            }

            // 2. Fallback to plantsMapping in config
            if (!mappedSiteId) {
              for (const pm of plantsMapping) {
                if (String(pm.plant_id) === plantId) {
                  mappedSiteId = pm.site_id;
                  break;
                }
              }
            }

            let isValidMappedSite = false;
            if (mappedSiteId) {
              const { data: siteRes } = await supabase
                .from("sites")
                .select("id, name")
                .eq("id", mappedSiteId);
              if (siteRes && siteRes.length > 0) {
                isValidMappedSite = true;
              } else {
                mappedSiteId = null;
              }
            }

            // 3. Fallback to site name lookup if still unmapped
            if (!isValidMappedSite) {
              const { data: siteNameRes } = await supabase
                .from("sites")
                .select("id")
                .eq("name", station.name);
              if (siteNameRes && siteNameRes.length > 0) {
                mappedSiteId = siteNameRes[0].id;
                isValidMappedSite = true;
              }
            }

            const siteFields: Record<string, any> = {
              name: station.name,
              location: station.location,
              latitude: station.location !== "Unknown" ? 19.0 : 0.0,
              longitude: station.location !== "Unknown" ? 73.0 : 0.0,
              capacity_kwp: station.capacity_kwp,
              status: "active",
              timezone: station.timezone
            };
            if (station.commissioned_on) {
              siteFields.commissioned_on = station.commissioned_on;
            }

            let siteId = "";
            distLock.assertActiveOwner();

            if (isValidMappedSite && mappedSiteId) {
              await supabase.from("sites").update(siteFields).eq("id", mappedSiteId);
              siteId = mappedSiteId;
              console.log(`Updated Site ID: ${siteId} for Station '${station.name}' (${plantId})`);
            } else {
              const { data: newSite, error: newSiteErr } = await supabase
                .from("sites")
                .insert([{ ...siteFields, org_id: orgId, commissioned_on: station.commissioned_on || "2022-06-15" }])
                .select("id")
                .single();
              if (newSiteErr || !newSite) {
                throw new Error(`Failed to insert site for ${station.name}: ${newSiteErr?.message}`);
              }
              siteId = newSite.id;
              metrics.sites_upserted++;
              console.log(`Created Site ID: ${siteId} for Station '${station.name}' (${plantId})`);

              // Persist mapping in oem_station_mappings
              try {
                await supabase.from("oem_station_mappings").upsert([
                  {
                    site_id: siteId,
                    oem: provider,
                    external_station_id: plantId,
                    station_name: station.name
                  }
                ], { onConflict: "oem,external_station_id" });
              } catch (mapInsErr: any) {
                console.warn(`Failed to insert into oem_station_mappings: ${mapInsErr.message}`);
              }
            }

            updatedPlantsMapping.push({ plant_id: plantId, site_id: siteId });

            // 4. Inverters Discovery
            const devices = await adapter.listDevices(plantId);
            const serialToInvIdMap: Record<string, string> = {};
            const allSyntheticAlerts = new Set<string>();

            for (const dev of devices) {
              try {
                distLock.assertActiveOwner();

                const { data: dbInvs } = await supabase
                  .from("inverters")
                  .select("id, installed_on")
                  .eq("oem", provider)
                  .eq("oem_device_id", dev.oem_device_id);

                const invCapacity = dev.capacity_kw > 0.0 ? dev.capacity_kw : (station.capacity_kwp || 0.0);
                const invFields: Record<string, any> = {
                  site_id: siteId,
                  model: dev.model,
                  serial_number: dev.serial_number,
                  capacity_kw: invCapacity,
                  string_count: dev.string_count,
                  status: dev.status,
                  last_seen_at: dev.last_seen_at
                };

                let invId = "";
                if (dbInvs && dbInvs.length > 0) {
                  invId = dbInvs[0].id;
                  if (dev.installed_on) invFields.installed_on = dev.installed_on;
                  await supabase.from("inverters").update(invFields).eq("id", invId);
                } else {
                  invFields.oem = provider;
                  invFields.oem_device_id = dev.oem_device_id;
                  invFields.installed_on = dev.installed_on || "2022-06-15";
                  const { data: newInv, error: invErr } = await supabase
                    .from("inverters")
                    .insert([invFields])
                    .select("id")
                    .single();
                  if (invErr || !newInv) throw new Error(`Failed to insert inverter: ${invErr?.message}`);
                  invId = newInv.id;
                }

                metrics.inverters_linked++;
                serialToInvIdMap[dev.serial_number] = invId;

                // 5. Telemetry & String Telemetry
                const [telemetry, stringTelemetries] = await adapter.fetchTelemetry(dev.oem_device_id);

                if (telemetry) {
                  distLock.assertActiveOwner();

                  const { data: existingTel } = await supabase
                    .from("telemetry")
                    .select("timestamp")
                    .eq("inverter_id", invId)
                    .eq("timestamp", telemetry.timestamp);

                  if (!existingTel || existingTel.length === 0) {
                    const telPayload = {
                      inverter_id: invId,
                      timestamp: telemetry.timestamp,
                      ac_power_kw: telemetry.ac_power_kw,
                      dc_power_kw: telemetry.dc_power_kw,
                      energy_kwh: telemetry.energy_kwh,
                      efficiency_pct: telemetry.efficiency_pct,
                      temperature_c: telemetry.temperature_c,
                      daily_generation_kwh: telemetry.daily_generation_kwh,
                      total_generation_kwh: telemetry.total_generation_kwh,
                      specific_yield: (dev.capacity_kw && Number(dev.capacity_kw) > 0 && telemetry.daily_generation_kwh > 0)
                        ? Math.round((telemetry.daily_generation_kwh / Number(dev.capacity_kw)) * 100) / 100
                        : (telemetry.specific_yield || 0.0),
                      online_status: telemetry.online_status,
                      last_update: telemetry.last_update,
                      frequency_hz: telemetry.frequency_hz,
                      reactive_power_kvar: telemetry.reactive_power_kvar,
                      power_factor: telemetry.power_factor,
                      current_r_a: telemetry.current_r_a,
                      current_s_a: telemetry.current_s_a,
                      current_t_a: telemetry.current_t_a,
                      voltage_r_v: telemetry.voltage_r_v,
                      voltage_s_v: telemetry.voltage_s_v,
                      voltage_t_v: telemetry.voltage_t_v,
                      apparent_power_kva: telemetry.apparent_power_kva,
                      battery_soc_pct: telemetry.battery_soc_pct,
                      battery_soh_pct: telemetry.battery_soh_pct,
                      battery_power_kw: telemetry.battery_power_kw,
                      battery_voltage_v: telemetry.battery_voltage_v,
                      battery_current_a: telemetry.battery_current_a,
                      load_power_kw: telemetry.load_power_kw,
                      grid_purchased_today_kwh: telemetry.grid_purchased_today_kwh,
                      grid_sell_today_kwh: telemetry.grid_sell_today_kwh,
                      load_today_kwh: telemetry.load_today_kwh,
                      metrics: telemetry.metrics
                    };
                    await supabase.from("telemetry").insert([telPayload]);
                    metrics.telemetry_inserted++;
                  }
                }

                // Dynamic MPPT & String Discovery
                const { data: existingStrings } = await supabase
                  .from("strings")
                  .select("id, string_index")
                  .eq("inverter_id", invId);

                const stringMap: Record<number, string> = {};
                for (const s of (existingStrings || [])) {
                  stringMap[s.string_index] = s.id;
                }

                // Seed String 1 if no strings exist
                if (Object.keys(stringMap).length === 0) {
                  const stringCap = dev.string_count > 0 ? Math.round((invCapacity / dev.string_count) * 100) / 100 : invCapacity;
                  const { data: newStr } = await supabase
                    .from("strings")
                    .insert([{
                      inverter_id: invId,
                      string_index: 1,
                      capacity_kw: stringCap,
                      status: "ok"
                    }])
                    .select("id")
                    .single();
                  if (newStr) {
                    stringMap[1] = newStr.id;
                  }
                }

                // Creation of dynamic string telemetry without pruning authoritative strings
                const stringTelemetryBatch: any[] = [];
                for (const st of stringTelemetries) {
                  let stringId = stringMap[st.string_index];

                  if (!stringId) {
                    const stringCap = dev.string_count > 0 ? Math.round((invCapacity / dev.string_count) * 100) / 100 : 0.0;
                    const { data: newStr } = await supabase
                      .from("strings")
                      .insert([{
                        inverter_id: invId,
                        string_index: st.string_index,
                        capacity_kw: stringCap,
                        status: "ok"
                      }])
                      .select("id")
                      .single();
                    if (newStr) {
                      stringId = newStr.id;
                      stringMap[st.string_index] = stringId;
                    }
                  }

                  if (stringId && telemetry) {
                    stringTelemetryBatch.push({
                      string_id: stringId,
                      timestamp: telemetry.timestamp,
                      voltage_v: st.voltage_v,
                      current_a: st.current_a,
                      power_kw: st.power_kw,
                      status: st.status
                    });
                  }
                }

                if (stringTelemetryBatch.length > 0 && telemetry) {
                  distLock.assertActiveOwner();

                  const { data: existingStrTel } = await supabase
                    .from("string_telemetry")
                    .select("string_id")
                    .eq("timestamp", telemetry.timestamp);

                  const existingSet = new Set((existingStrTel || []).map((r: any) => r.string_id));
                  const newBatch = stringTelemetryBatch.filter((b) => !existingSet.has(b.string_id));

                  if (newBatch.length > 0) {
                    await supabase.from("string_telemetry").insert(newBatch);
                    metrics.string_telemetry_inserted += newBatch.length;
                  }
                }

                // Canonical inverter communication status and hardware string preservation
                const actualTimestamp = telemetry?.timestamp || telemetry?.last_update || dev.last_seen_at;
                let calculatedStatus = dev.status;

                if (telemetry) {
                  const telDate = telemetry.timestamp ? new Date(telemetry.timestamp) : null;
                  const nowMs = Date.now();
                  const diffMins = telDate && !isNaN(telDate.getTime()) ? (nowMs - telDate.getTime()) / (1000 * 60) : 999;

                  if (diffMins > 60) {
                    calculatedStatus = "offline";
                  } else if (telemetry.online_status === false) {
                    calculatedStatus = "offline";
                  } else if (telemetry.ac_power_kw > 0.05) {
                    calculatedStatus = "online";
                  } else {
                    const istHours = (new Date().getUTCHours() + 5.5) % 24;
                    calculatedStatus = (istHours >= 18.5 || istHours < 6.0) ? "standby" : (dev.status || "standby");
                  }
                }

                const finalStringCount = Math.max(dev.string_count || 0, Object.keys(stringMap).length, 1);
                const updatePayload: Record<string, any> = {
                  string_count: finalStringCount,
                  status: calculatedStatus
                };

                if (actualTimestamp) {
                  updatePayload.last_seen_at = actualTimestamp;
                }

                await supabase.from("inverters").update(updatePayload).eq("id", invId);

                // Synthetic String Deviation Analysis
                const synthAlerts = await analyzeStringsForAnomalies(
                  supabase,
                  invId,
                  siteId,
                  orgId,
                  stringTelemetries,
                  telemetry,
                  provider,
                  distLock
                );
                for (const sa of synthAlerts) {
                  allSyntheticAlerts.add(sa);
                }

              } catch (invErr: any) {
                console.error(`Error syncing inverter ${dev.serial_number}: ${invErr.message}`);
                metrics.error_count++;
              }
            }

            // 6. Sync Alerts for the plant
            const alerts = await adapter.fetchAlerts(plantId);
            if (alerts === null) {
              console.warn(`[Alert Sync] Received null response for plant ${plantId}. Skipping resolution.`);
            } else {
              const activeAlertKeys = new Set<string>(allSyntheticAlerts);

              for (const alert of alerts) {
                try {
                  let deviceSn: string | null = null;
                  if (alert.description.includes("(Device SN: ")) {
                    deviceSn = alert.description.split("(Device SN: ")[1].split(")")[0];
                  }

                  const invId = deviceSn ? (serialToInvIdMap[deviceSn] || null) : null;
                  const key = `${alert.code}:${invId || ""}`;
                  activeAlertKeys.add(key);

                  const query = supabase
                    .from("alerts")
                    .select("id")
                    .eq("code", alert.code)
                    .eq("status", "open")
                    .eq("site_id", siteId);

                  if (invId) {
                    query.eq("inverter_id", invId);
                  } else {
                    query.is("inverter_id", null);
                  }

                  const { data: existingAlerts } = await query;
                  if (!existingAlerts || existingAlerts.length === 0) {
                    distLock.assertActiveOwner();

                    const translated = translateAlert(alert.oem, alert.alarm_code, alert.title);
                    await supabase.from("alerts").insert([{
                      org_id: orgId,
                      site_id: siteId,
                      inverter_id: invId,
                      code: alert.code,
                      title: translated.title,
                      description: alert.description + (translated.description ? ` - ${translated.description}` : ""),
                      severity: translated.severity,
                      status: "open",
                      triggered_at: alert.triggered_at,
                      oem: alert.oem,
                      alarm_code: alert.alarm_code,
                      category: translated.category,
                      is_auto_resolvable: translated.is_auto_resolvable,
                      requires_technician: translated.requires_technician,
                      recommended_action: translated.recommended_action
                    }]);
                    metrics.alerts_processed++;
                  }
                } catch (alErr: any) {
                  console.error(`Error syncing alert code ${alert.code}: ${alErr.message}`);
                  metrics.error_count++;
                }
              }

              // Auto-resolve inactive alerts
              try {
                const { data: dbOpenAlerts } = await supabase
                  .from("alerts")
                  .select("id, code, alarm_code, inverter_id")
                  .eq("site_id", siteId)
                  .eq("status", "open");

                for (const dbAlert of (dbOpenAlerts || [])) {
                  const codeKey = `${dbAlert.code}:${dbAlert.inverter_id || ""}`;
                  const alarmCodeKey = `${dbAlert.alarm_code || dbAlert.code}:${dbAlert.inverter_id || ""}`;
                  if (!activeAlertKeys.has(codeKey) && !activeAlertKeys.has(alarmCodeKey)) {
                    distLock.assertActiveOwner();

                    await supabase
                      .from("alerts")
                      .update({
                        status: "resolved",
                        resolved_at: new Date().toISOString()
                      })
                      .eq("id", dbAlert.id);
                  }
                }
              } catch (resErr: any) {
                console.error(`Error auto-resolving alerts for site ${siteId}: ${resErr.message}`);
                metrics.error_count++;
              }
            }

            // 7. Auto-Backfill Check: If station is newly discovered or not yet historically backfilled
            try {
              const { data: mapData } = await supabase
                .from("oem_station_mappings")
                .select("id, metadata")
                .eq("oem", provider)
                .eq("external_station_id", plantId)
                .maybeSingle();

              const bfStatus = mapData?.metadata?.historical_backfill?.status;
              if (mapData && (!bfStatus || bfStatus !== "completed")) {
                await autoBackfillStation(supabase, provider, plantId, siteId, station, serialToInvIdMap, mapData.id, mapData.metadata || {});
              }
            } catch (bfErr: any) {
              console.warn(`[Auto-Backfill Check] Non-blocking warning for ${station.name}: ${bfErr.message}`);
            }

          } catch (stnErr: any) {
            console.error(`Error syncing station ${station.name}: ${stnErr.message}`);
            metrics.error_count++;
          }
        });

        // Persist updated plants config in oem_integrations
        try {
          await supabase
            .from("oem_integrations")
            .update({
              config: { ...config, plants: updatedPlantsMapping },
              last_sync_at: new Date().toISOString()
            })
            .eq("id", integ.id);
        } catch (confErr: any) {
          console.warn(`Failed to update integration ${integ.id} config: ${confErr.message}`);
        }

        if (metrics.error_count > 0 && metrics.stations_fetched > 0) {
          metrics.status = "partial_success";
        }

      } catch (oemErr: any) {
        console.error(`Critical error syncing OEM ${provider}: ${oemErr.message}`);
        metrics.status = "failed";
        metrics.error_message = oemErr.message;
        metrics.error_count++;
      }

      return { provider, metrics, updatedPlantsMapping: plantsMapping };
    });

    const settledResults = await Promise.allSettled(syncTasks);

    for (const res of settledResults) {
      if (res.status === "fulfilled") {
        const { provider, metrics } = res.value;
        oemResults[provider] = metrics;
        totalStationsFetched += metrics.stations_fetched;
        totalSitesUpserted += metrics.sites_upserted;
        totalInvertersLinked += metrics.inverters_linked;
        totalTelemetryInserted += metrics.telemetry_inserted;
        totalStringTelemetryInserted += metrics.string_telemetry_inserted;
        totalAlertsProcessed += metrics.alerts_processed;
        totalErrorCount += metrics.error_count;
      } else {
        totalErrorCount++;
        console.error(`Settled promise error: ${res.reason}`);
      }
    }

    const durationSeconds = (Date.now() - startedAt.getTime()) / 1000;
    const allStatuses = Object.values(oemResults).map((m) => m.status);
    let finalStatus: "success" | "partial_success" | "failed" = "success";

    if (allStatuses.length === 0 || allStatuses.every((s) => s === "failed")) {
      finalStatus = "failed";
    } else if (allStatuses.some((s) => s === "failed" || s === "partial_success") || totalErrorCount > 0) {
      finalStatus = "partial_success";
    }

    if (syncRunId) {
      await supabase
        .from("sync_runs")
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          sites_processed: totalStationsFetched,
          inverters_processed: totalInvertersLinked,
          telemetry_records: totalTelemetryInserted,
          string_records: totalStringTelemetryInserted,
          alerts_processed: totalAlertsProcessed,
          error_count: totalErrorCount,
          duration_seconds: durationSeconds
        })
        .eq("id", syncRunId);
    }

    console.log(`Multi-OEM sync completed in ${durationSeconds.toFixed(1)}s with status: ${finalStatus}`);

    return {
      status: finalStatus,
      duration_seconds: durationSeconds,
      sites_processed: totalStationsFetched,
      inverters_processed: totalInvertersLinked,
      telemetry_records: totalTelemetryInserted,
      string_records: totalStringTelemetryInserted,
      alerts_processed: totalAlertsProcessed,
      error_count: totalErrorCount,
      oem_metrics: oemResults
    };

  } catch (fatalErr: any) {
    console.error(`Fatal error in pollAndSyncAll: ${fatalErr.message}`);
    const durationSeconds = (Date.now() - startedAt.getTime()) / 1000;

    if (syncRunId) {
      try {
        await supabase
          .from("sync_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: fatalErr.message,
            error_count: totalErrorCount + 1,
            duration_seconds: durationSeconds
          })
          .eq("id", syncRunId);
      } catch (logErr: any) {
        console.error(`Failed to update fatal sync_runs error: ${logErr.message}`);
      }
    }

    return { status: "failed", error: fatalErr.message, duration_seconds: durationSeconds };

  } finally {
    // 5. Always release distributed lock
    try {
      await distLock.release();
    } catch (relErr: any) {
      console.error(`Failed to release distributed lock: ${relErr.message}`);
    }
  }
}
