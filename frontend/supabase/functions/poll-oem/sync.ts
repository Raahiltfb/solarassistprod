import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { SolisAdapter, NormalizedDevice, NormalizedTelemetry, NormalizedStringTelemetry, NormalizedAlert } from "./solis.ts";
import { translateAlert } from "./alarm_mappings.ts";

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

export async function pollAndSyncAll(supabaseUrl: string, supabaseKey: string, triggerSource = "manual"): Promise<Record<string, any>> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const startedAt = new Date();
  
  // 1. Concurrency Mutex Lock using DB state
  // If there is another sync run marked 'running' that started within the last 15 minutes, we skip.
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: runningRuns } = await supabase
    .from("sync_runs")
    .select("id, started_at")
    .eq("status", "running")
    .gt("started_at", fifteenMinutesAgo);

  if (runningRuns && runningRuns.length > 0) {
    console.warn("Another sync session is already in progress. Logging skipped cycle.");
    const skippedPayload = {
      status: "failed",
      oem: "solis",
      trigger_source: triggerSource,
      started_at: startedAt.toISOString(),
      completed_at: startedAt.toISOString(),
      error_message: "Skipped: Another synchronization run was already in progress.",
      duration_seconds: 0.0,
      error_count: 1
    };
    await supabase.from("sync_runs").insert([skippedPayload]);
    return { status: "skipped", message: "Another sync session in progress" };
  }

  let syncRunId: string | null = null;
  let telemetryInsertedCount = 0;
  let stringTelemetryInsertedCount = 0;
  let alertsProcessedCount = 0;
  let errorCount = 0;
  let stationsFetchedCount = 0;
  let sitesUpsertedCount = 0;
  let invertersLinkedCount = 0;

  // Insert 'running' tracking log
  try {
    const runningPayload = {
      status: "running",
      oem: "solis",
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
      .insert([runningPayload])
      .select("id")
      .single();
      
    if (runErr) throw runErr;
    if (runRes) {
      syncRunId = runRes.id;
      console.log(`Initialized sync_runs tracking record with ID: ${syncRunId}`);
    }
  } catch (err: any) {
    console.error(`Failed to initialize sync_runs record: ${err.message}`);
    errorCount++;
  }

  try {
    // 1. Fetch active integrations
    const { data: integrations, error: integErr } = await supabase
      .from("oem_integrations")
      .select("*")
      .eq("is_active", true);

    if (integErr) throw integErr;
    console.log(`Found ${integrations?.length || 0} active OEM integration(s)`);

    const activeMappedSiteIds = new Set<string>();

    for (const integ of (integrations || [])) {
      const provider = integ.provider;
      const orgId = integ.org_id;
      const config = integ.config || {};
      const plantsMapping = config.plants || [];
      
      console.log(`Running adapter sync for ${provider} (Integration: ${integ.id})`);

      // Initialize Solis Adapter using credentials from Deno Env or integration credentials config
      const keyId = Deno.env.get("SOLIS_KEY_ID") || config.key_id;
      const keySecret = Deno.env.get("SOLIS_KEY_SECRET") || config.key_secret;
      const apiUrl = Deno.env.get("SOLIS_API_URL") || config.api_url;

      if (!keyId || !keySecret) {
        console.error(`Missing API credentials for provider ${provider}. Skipping.`);
        errorCount++;
        continue;
      }

      const adapter = new SolisAdapter(keyId, keySecret, apiUrl);

      // 2. Fetch list of stations
      let stations = [];
      try {
        stations = await adapter.listStations();
        stationsFetchedCount += stations.length;
        console.log(`Adapter returned ${stations.length} station(s) for ${provider}`);
      } catch (err: any) {
        console.error(`Failed to list stations: ${err.message}`);
        errorCount++;
        continue;
      }

      const updatedPlantsMapping: Array<{ plant_id: string; site_id: string }> = [];

      // Concurrency mapping over stations (Syncing 12 stations concurrently)
      await runWithConcurrency(stations, 12, async (station) => {
        const plantId = station.plant_id;
        try {
          // Check mapping config
          let mappedSiteId = null;
          for (const pm of plantsMapping) {
            if (String(pm.plant_id) === String(plantId)) {
              mappedSiteId = pm.site_id;
              break;
            }
          }

          let isValidMappedSite = false;
          if (mappedSiteId) {
            const { data: siteRes } = await supabase
              .from("sites")
              .select("id, name")
              .eq("id", mappedSiteId);
            
            if (siteRes && siteRes.length > 0 && siteRes[0].name === station.name) {
              isValidMappedSite = true;
            } else {
              mappedSiteId = null;
            }
          }

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

          const siteFields = {
            name: station.name,
            location: station.location,
            latitude: station.location !== "Unknown" ? 19.0 : 0.0,
            longitude: station.location !== "Unknown" ? 73.0 : 0.0,
            capacity_kwp: station.capacity_kwp,
            status: "active",
            timezone: station.timezone
          };

          let siteId = "";
          if (isValidMappedSite && mappedSiteId) {
            await supabase.from("sites").update(siteFields).eq("id", mappedSiteId);
            siteId = mappedSiteId;
            console.log(`Updated Site ID: ${siteId} for Station '${station.name}'`);
          } else {
            const { data: newSite } = await supabase
              .from("sites")
              .insert([{ ...siteFields, org_id: orgId }])
              .select("id")
              .single();
            if (!newSite) throw new Error("Failed to insert site");
            siteId = newSite.id;
            sitesUpsertedCount++;
            console.log(`Created Site ID: ${siteId} for Station '${station.name}'`);
          }

          activeMappedSiteIds.add(siteId);
          updatedPlantsMapping.push({ plant_id: String(plantId), site_id: siteId });

          // 3. Fetch devices under this site
          const devices = await adapter.listDevices(plantId);
          const serialToInvIdMap: Record<string, string> = {};

          for (const dev of devices) {
            try {
              const { data: dbInvs } = await supabase
                .from("inverters")
                .select("id")
                .eq("oem", provider)
                .eq("oem_device_id", dev.oem_device_id);

              const invFields: Record<string, any> = {
                site_id: siteId,
                model: dev.model,
                serial_number: dev.serial_number,
                capacity_kw: dev.capacity_kw,
                string_count: dev.string_count,
                status: dev.status,
                last_seen_at: dev.last_seen_at
              };

              let invId = "";
              if (dbInvs && dbInvs.length > 0) {
                invId = dbInvs[0].id;
                await supabase.from("inverters").update(invFields).eq("id", invId);
                console.log(`Updated Inverter ID: ${invId} under Site ${siteId}`);
              } else {
                invFields.oem = provider;
                invFields.oem_device_id = dev.oem_device_id;
                invFields.installed_on = new Date().toISOString().split("T")[0];
                const { data: newInv } = await supabase
                  .from("inverters")
                  .insert([invFields])
                  .select("id")
                  .single();
                if (!newInv) throw new Error("Failed to insert inverter");
                invId = newInv.id;
                console.log(`Created Inverter ID: ${invId} under Site ${siteId}`);
              }

              invertersLinkedCount++;
              serialToInvIdMap[dev.serial_number] = invId;

              // 4. Telemetry and String Telemetry
              const [telemetry, stringTelemetries] = await adapter.fetchTelemetry(dev.oem_device_id);
              if (telemetry) {
                // Prevent duplicate checks
                const { data: existingTel } = await supabase
                  .from("telemetry")
                  .select("timestamp")
                  .eq("inverter_id", invId)
                  .eq("timestamp", telemetry.timestamp);

                if (!existingTel || existingTel.length === 0) {
                  const telemetryInsertFields = {
                    inverter_id: invId,
                    timestamp: telemetry.timestamp,
                    ac_power_kw: telemetry.ac_power_kw,
                    dc_power_kw: telemetry.dc_power_kw,
                    energy_kwh: telemetry.energy_kwh,
                    efficiency_pct: telemetry.efficiency_pct,
                    temperature_c: telemetry.temperature_c,
                    daily_generation_kwh: telemetry.daily_generation_kwh,
                    total_generation_kwh: telemetry.total_generation_kwh,
                    specific_yield: telemetry.specific_yield,
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
                  await supabase.from("telemetry").insert([telemetryInsertFields]);
                  telemetryInsertedCount++;
                  console.log(`Logged Telemetry for Inverter ${invId}`);
                } else {
                  console.log(`Telemetry for Inverter ${invId} already exists. Skipping.`);
                }
              }

              // Strings Mapping
              const { data: existingStrings } = await supabase
                .from("strings")
                .select("id, string_index")
                .eq("inverter_id", invId);

              const stringMap: Record<number, string> = {};
              for (const s of (existingStrings || [])) {
                stringMap[s.string_index] = s.id;
              }

              // String Telemetry Sync - Bulk fetch existing string telemetries for this timestamp
              let existingStrSet = new Set<string>();
              if (telemetry) {
                const { data: existingStrTel } = await supabase
                  .from("string_telemetry")
                  .select("string_id")
                  .eq("timestamp", telemetry.timestamp);
                existingStrSet = new Set((existingStrTel || []).map((s: any) => s.string_id));
              }

              for (const st of stringTelemetries) {
                let stringId = stringMap[st.string_index];
                const isActive = (st.voltage_v > 0.0 || st.current_a > 0.0);

                // Prune dynamic string counts
                if (!isActive && stringId && telemetry && telemetry.ac_power_kw > 1.0) {
                  await supabase.from("strings").delete().eq("id", stringId);
                  delete stringMap[st.string_index];
                  console.log(`Safely pruned legacy placeholder string Index ${st.string_index} for Inverter ${invId}`);
                  continue;
                }

                if (!isActive && !stringId) {
                  continue;
                }

                if (!stringId) {
                  const stringCap = dev.string_count > 0 ? Math.round((dev.capacity_kw / dev.string_count) * 100) / 100 : 0.0;
                  const { data: newStr } = await supabase
                    .from("strings")
                    .insert([{
                      inverter_id: invId,
                      string_index: st.string_index,
                      modules_count: 20,
                      capacity_kw: stringCap,
                      status: "ok"
                    }])
                    .select("id")
                    .single();
                  
                  if (newStr) {
                    stringId = newStr.id;
                    stringMap[st.string_index] = stringId;
                    console.log(`Dynamically created physical String Index ${st.string_index} for Inverter ${invId}`);
                  }
                }

                if (stringId && telemetry) {
                  if (!existingStrSet.has(stringId)) {
                    await supabase.from("string_telemetry").insert([{
                      string_id: stringId,
                      timestamp: telemetry.timestamp,
                      voltage_v: st.voltage_v,
                      current_a: st.current_a,
                      power_kw: st.power_kw,
                      status: st.status
                    }]);
                    stringTelemetryInsertedCount++;
                  }
                }
              }

              // Update dynamic string counts in inverters
              const dynamicStringCount = Object.keys(stringMap).length;
              await supabase.from("inverters").update({ string_count: dynamicStringCount }).eq("id", invId);

            } catch (err: any) {
              console.error(`Error syncing inverter ${dev.serial_number}: ${err.message}`);
              errorCount++;
            }
          }

          // 5. Sync Alerts
          const alerts = await adapter.fetchAlerts(plantId);
          if (alerts === null) {
            console.warn(`[Alert Sync] Received null/failed response for plant ID ${plantId}. Skipping alert ingestion/resolution to prevent incorrect state clearance.`);
          } else {
            const activeAlertKeys = new Set<string>();

            for (const alert of alerts) {
              try {
                let deviceSn = null;
                if (alert.description.includes("(Device SN: ")) {
                  deviceSn = alert.description.split("(Device SN: ")[1].split(")")[0];
                }

                const invId = deviceSn ? serialToInvIdMap[deviceSn] : null;
                const key = `${alert.code}:${invId || ""}`;
                activeAlertKeys.add(key);

                const selectQuery = supabase
                  .from("alerts")
                  .select("id")
                  .eq("code", alert.code)
                  .eq("status", "open")
                  .eq("site_id", siteId);
                
                if (invId) {
                  selectQuery.eq("inverter_id", invId);
                } else {
                  selectQuery.is("inverter_id", null);
                }

                const { data: existingAlerts } = await selectQuery;
                if (!existingAlerts || existingAlerts.length === 0) {
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
                  alertsProcessedCount++;
                  console.log(`Created alert for code ${alert.code} under Site ${siteId}`);
                }
              } catch (err: any) {
                console.error(`Error syncing alert code ${alert.code} for station ${station.name}: ${err.message}`);
                errorCount++;
              }
            }

            // Auto-resolve database alerts that are no longer reported as active by the Solis API snapshot
            try {
              const { data: dbOpenAlerts } = await supabase
                .from("alerts")
                .select("id, code, inverter_id")
                .eq("site_id", siteId)
                .eq("status", "open");

              for (const dbAlert of (dbOpenAlerts || [])) {
                const key = `${dbAlert.code}:${dbAlert.inverter_id || ""}`;
                if (!activeAlertKeys.has(key)) {
                  await supabase
                    .from("alerts")
                    .update({
                      status: "resolved",
                      resolved_at: new Date().toISOString()
                    })
                    .eq("id", dbAlert.id);
                  console.log(`Automatically resolved alert ID: ${dbAlert.id} (Code: ${dbAlert.code}) for Site ${siteId}`);
                }
              }
            } catch (err: any) {
              console.error(`Error auto-resolving alerts for site ${siteId}: ${err.message}`);
              errorCount++;
            }
          }

        } catch (err: any) {
          console.error(`Error syncing station ${station.name}: ${err.message}`);
          errorCount++;
        }
      });

      // Update plants configuration in DB
      try {
        await supabase
          .from("oem_integrations")
          .update({
            config: { ...config, plants: updatedPlantsMapping },
            last_sync_at: new Date().toISOString()
          })
          .eq("id", integ.id);
        console.log(`Integration ${integ.id} config updated successfully.`);
      } catch (err: any) {
        console.error(`Failed to update integration config: ${err.message}`);
        errorCount++;
      }
    }

    // 7. Verification Gate Check
    const { data: allActiveConfigs } = await supabase
      .from("oem_integrations")
      .select("config")
      .eq("is_active", true);

    const currentMappedSiteIds = new Set<string>();
    for (const c of (allActiveConfigs || [])) {
      const pmList = c.config?.plants || [];
      for (const pm of pmList) {
        if (pm.site_id) currentMappedSiteIds.add(pm.site_id);
      }
    }

    console.log(`Verification Gate: Stations Fetched: ${stationsFetchedCount} | Unique Sites Mapped: ${currentMappedSiteIds.size}`);

    if (currentMappedSiteIds.size !== stationsFetchedCount) {
      console.warn("Verification gate failed! Mapped sites count mismatch. Cleanup aborted.");
      if (syncRunId) {
        await supabase
          .from("sync_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: "Verification gate failed: Mapped sites count mismatch.",
            error_count: errorCount + 1
          })
          .eq("id", syncRunId);
      }
      return { status: "failed", reason: "Verification site count mismatch" };
    }

    // Verification passed
    console.log("Verification gate passed! Proceeding to record success...");
    
    // Log successful sync run completed
    if (syncRunId) {
      const completedAt = new Date();
      const durationSeconds = (completedAt.getTime() - startedAt.getTime()) / 1000;
      await supabase
        .from("sync_runs")
        .update({
          status: "success",
          completed_at: completedAt.toISOString(),
          sites_processed: stationsFetchedCount,
          inverters_processed: invertersLinkedCount,
          telemetry_records: telemetryInsertedCount,
          string_records: stringTelemetryInsertedCount,
          alerts_processed: alertsProcessedCount,
          error_count: errorCount,
          duration_seconds: durationSeconds
        })
        .eq("id", syncRunId);
    }

    return {
      status: "success",
      sites_processed: stationsFetchedCount,
      inverters_processed: invertersLinkedCount,
      telemetry_records: telemetryInsertedCount,
      string_records: stringTelemetryInsertedCount,
      alerts_processed: alertsProcessedCount,
      error_count: errorCount
    };

  } catch (err: any) {
    console.error(`Error occurred during synchronization: ${err.message}`);
    if (syncRunId) {
      try {
        const completedAt = new Date();
        const durationSeconds = (completedAt.getTime() - startedAt.getTime()) / 1000;
        await supabase
          .from("sync_runs")
          .update({
            status: "failed",
            completed_at: completedAt.toISOString(),
            error_message: err.message,
            error_count: errorCount + 1,
            duration_seconds: durationSeconds
          })
          .eq("id", syncRunId);
      } catch (logErr: any) {
        console.error(`Failed to log sync run failure: ${logErr.message}`);
      }
    }
    return { status: "failed", error: err.message };
  }
}
