import crypto from "node:crypto";

export interface NormalizedStation {
  plant_id: string;
  name: string;
  capacity_kwp: number;
  location: string;
  timezone: string;
}

export interface NormalizedDevice {
  oem_device_id: string;
  model: string;
  serial_number: string;
  capacity_kw: number;
  string_count: number;
  status: string;
  last_seen_at: string;
}

export interface NormalizedTelemetry {
  timestamp: string;
  ac_power_kw: number;
  dc_power_kw: number;
  energy_kwh: number;
  efficiency_pct: number;
  temperature_c: number;
  daily_generation_kwh: number;
  total_generation_kwh: number;
  specific_yield: number;
  online_status: boolean;
  last_update: string;
  frequency_hz: number;
  reactive_power_kvar: number;
  power_factor: number;
  current_r_a: number;
  current_s_a: number;
  current_t_a: number;
  voltage_r_v: number;
  voltage_s_v: number;
  voltage_t_v: number;
  apparent_power_kva: number;
  battery_soc_pct?: number | null;
  battery_soh_pct?: number | null;
  battery_power_kw?: number | null;
  battery_voltage_v?: number | null;
  battery_current_a?: number | null;
  load_power_kw?: number | null;
  grid_purchased_today_kwh?: number | null;
  grid_sell_today_kwh?: number | null;
  load_today_kwh?: number | null;
  metrics: Record<string, any>;
}

export interface NormalizedStringTelemetry {
  string_index: number;
  voltage_v: number;
  current_a: number;
  power_kw: number;
  status: string;
}

export interface NormalizedAlert {
  code: string;
  title: string;
  description: string;
  severity: string;
  triggered_at: string;
  alarm_code: string;
  oem: string;
  category: string;
  is_auto_resolvable: boolean;
  requires_technician: boolean;
  recommended_action: string;
}

export class SolisAdapter {
  private keyId: string;
  private keySecret: string;
  private apiUrl: string;

  constructor(keyId: string, keySecret: string, apiUrl?: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.apiUrl = apiUrl || "https://www.soliscloud.com:13333";
  }

  private async _callSolis(endpoint: string, bodyDict: Record<string, any>): Promise<any> {
    const body = JSON.stringify(bodyDict);
    const contentMd5 = crypto.createHash("md5").update(body, "utf8").digest("base64");
    const dateStr = new Date().toUTCString();
    const encryptStr = `POST\n${contentMd5}\napplication/json\n${dateStr}\n${endpoint}`;
    
    const sign = crypto.createHmac("sha1", this.keySecret)
      .update(encryptStr, "utf8")
      .digest("base64");

    const headers = {
      "Content-Type": "application/json",
      "Content-MD5": contentMd5,
      "Date": dateStr,
      "Authorization": `API ${this.keyId}:${sign}`
    };

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const url = `${this.apiUrl}${endpoint}`;
        console.log(`Solis API Request: POST ${url} | Attempt ${attempt + 1}`);
        
        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(25000)
        });

        if (!response.ok) {
          throw new Error(`HTTP status error: ${response.status}`);
        }

        const resJson = await response.json();
        if (resJson.code === "0") {
          return resJson;
        } else {
          console.warn(`Solis API returned error code ${resJson.code}: ${resJson.msg}`);
        }
      } catch (err: any) {
        console.error(`Solis API connection error on attempt ${attempt + 1}: ${err.message}`);
        if (attempt === maxRetries - 1) {
          return { code: "-1", msg: err.message };
        }
      }
      // Simple wait between retries
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return { code: "-1", msg: "Failed after max retries" };
  }

  async listStations(): Promise<NormalizedStation[]> {
    const res = await this._callSolis("/v1/api/userStationList", { pageNo: 1, pageSize: 100 });
    const stations: NormalizedStation[] = [];
    if (res && res.code === "0") {
      const records = res.data?.page?.records || [];
      for (const s of records) {
        const plantId = String(s.id);
        const name = s.sName || s.stationName || `Solis Plant ${plantId}`;
        const capacity = parseFloat(s.capacity || "0.0");
        
        const city = s.cityStr || "";
        const region = s.regionStr || "";
        const country = s.countryStr || "";
        const locParts = [city, region, country].filter(p => p);
        const location = locParts.length > 0 ? locParts.join(", ") : "Unknown";

        let timezoneStr = s.timeZoneStrNew || s.timeZoneName || "Asia/Kolkata";
        if (timezoneStr.includes(" ")) {
          timezoneStr = timezoneStr.split(" ", 2)[1];
        }

        stations.push({
          plant_id: plantId,
          name,
          capacity_kwp: capacity,
          location,
          timezone: timezoneStr
        });
      }
    }
    return stations;
  }

  async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    const stationIdParam = /^\d+$/.test(plantId) ? parseInt(plantId, 10) : plantId;
    const res = await this._callSolis("/v1/api/inverterList", { stationId: stationIdParam, pageNo: 1, pageSize: 100 });
    const devices: NormalizedDevice[] = [];
    if (res && res.code === "0") {
      const records = res.data?.page?.records || [];
      for (const d of records) {
        const invOemId = String(d.id);
        const serialNumber = d.sn;
        if (!invOemId || !serialNumber) continue;

        const stateVal = d.state;
        const pacVal = parseFloat(d.pac || "0.0");
        let status = "offline";
        if (stateVal === 1 || stateVal === "1" || pacVal > 0) {
          status = "online";
        } else if (stateVal === 3 || stateVal === "3") {
          status = "fault";
        } else if (stateVal === 2 || stateVal === "2") {
          status = "offline";
        } else {
          status = pacVal === 0 ? "standby" : "online";
        }

        const model = d.machine || d.model || "Solis Inverter";
        const capacityKw = parseFloat(d.power || "0.0");
        
        let dcInputType = d.dcInputType || d.dcInputtype;
        const stringCount = (dcInputType !== undefined && dcInputType !== null) ? (parseInt(dcInputType) + 1) : 8;

        const ts = d.dataTimestamp || d.updateTime;
        const lastSeenAt = ts ? new Date(parseInt(ts)).toISOString() : new Date().toISOString();

        devices.push({
          oem_device_id: invOemId,
          model,
          serial_number: serialNumber,
          capacity_kw: capacityKw,
          string_count: stringCount,
          status,
          last_seen_at: lastSeenAt
        });
      }
    }
    return devices;
  }

  async fetchTelemetry(deviceId: string): Promise<[NormalizedTelemetry | null, NormalizedStringTelemetry[]]> {
    const detailRes = await this._callSolis("/v1/api/inverterDetail", { id: deviceId });
    if (!detailRes || detailRes.code !== "0") {
      return [null, []];
    }

    const invData = detailRes.data || {};

    const acPowerKw = parseFloat(invData.pac || "0.0");
    const dcPowerKw = parseFloat(invData.dcPac || String(acPowerKw));
    const energyKwh = parseFloat(invData.eToday || "0.0");
    const efficiencyPct = parseFloat(invData.efficiency || "95.0");
    const temperatureC = parseFloat(invData.inverterTemperature || "35.0");

    const stateVal = invData.state;
    const onlineStatus = (stateVal === 1 || stateVal === "1");

    const capacityKw = parseFloat(invData.power || "0.0");
    const dailyGenerationKwh = energyKwh;

    // Normalizing eTotal (lifetime generation)
    const rawEtotal = parseFloat(invData.eTotal || "0.0");
    const eTotalStr = String(invData.eTotalStr || "kWh").toUpperCase();
    let totalGenerationKwh = rawEtotal;
    if (eTotalStr.includes("M")) {
      totalGenerationKwh = rawEtotal * 1000.0;
    } else if (eTotalStr.includes("G")) {
      totalGenerationKwh = rawEtotal * 1000000.0;
    }

    // Specific Yield (kWh/kWp)
    let specificYield = parseFloat(invData.fullHour || "0.0");
    if (specificYield === 0.0 && capacityKw > 0) {
      specificYield = Math.round((dailyGenerationKwh / capacityKw) * 100) / 100;
    }

    const ts = invData.dataTimestamp || invData.updateTime;
    const lastSeenAt = ts ? new Date(parseInt(ts)).toISOString() : new Date().toISOString();

    const frequencyHz = parseFloat(invData.fac || "0.0");
    const reactivePowerKvar = parseFloat(invData.reactivePower || "0.0");
    const powerFactor = parseFloat(invData.powerFactor || "1.0");

    const current_r_a = parseFloat(invData.iAc1 || "0.0");
    const current_s_a = parseFloat(invData.iAc2 || "0.0");
    const current_t_a = parseFloat(invData.iAc3 || "0.0");
    const voltage_r_v = parseFloat(invData.uAc1 || "0.0");
    const voltage_s_v = parseFloat(invData.uAc2 || "0.0");
    const voltage_t_v = parseFloat(invData.uAc3 || "0.0");
    const apparentPowerKva = parseFloat(invData.apparentPower || "0.0");

    const batterySocPct = invData.batteryCapacitySoc !== undefined ? parseFloat(invData.batteryCapacitySoc) : null;
    const batterySohPct = invData.batteryHealthSoh !== undefined ? parseFloat(invData.batteryHealthSoh) : null;
    const batteryPowerKw = invData.batteryPower !== undefined ? parseFloat(invData.batteryPower) : null;
    const batteryVoltageV = invData.batteryVoltage !== undefined ? parseFloat(invData.batteryVoltage) : null;
    const batteryCurrentA = invData.batteryCurrent !== undefined ? parseFloat(invData.batteryCurrent) : null;

    const loadPowerKw = invData.familyLoadPower !== undefined ? parseFloat(invData.familyLoadPower) : null;
    const gridPurchasedTodayKwh = invData.gridPurchasedTodayEnergy !== undefined ? parseFloat(invData.gridPurchasedTodayEnergy) : null;
    const gridSellTodayKwh = invData.gridSellTodayEnergy !== undefined ? parseFloat(invData.gridSellTodayEnergy) : null;
    const loadTodayKwh = invData.homeLoadTodayEnergy !== undefined ? parseFloat(invData.homeLoadTodayEnergy) : null;

    const vendorMetrics = {
      dcBus: invData.dcBus,
      dcBusHalf: invData.dcBusHalf,
      simFlowState: invData.simFlowState,
      fullHour: invData.fullHour,
      totalFullHour: invData.totalFullHour,
    };

    const cleanMetrics: Record<string, any> = {};
    for (const [k, v] of Object.entries(vendorMetrics)) {
      if (v !== undefined && v !== null) {
        cleanMetrics[k] = v;
      }
    }

    for (let i = 1; i <= 20; i++) {
      const upv = invData[`mpptUpv${i}`];
      const ipv = invData[`mpptIpv${i}`];
      const pow = invData[`mpptPow${i}`];
      if (upv !== undefined && upv !== null) cleanMetrics[`mpptUpv${i}`] = parseFloat(upv);
      if (ipv !== undefined && ipv !== null) cleanMetrics[`mpptIpv${i}`] = parseFloat(ipv);
      if (pow !== undefined && pow !== null) cleanMetrics[`mpptPow${i}`] = parseFloat(pow);
    }

    const telemetry: NormalizedTelemetry = {
      timestamp: lastSeenAt,
      ac_power_kw: acPowerKw,
      dc_power_kw: dcPowerKw,
      energy_kwh: energyKwh,
      efficiency_pct: efficiencyPct,
      temperature_c: temperatureC,
      daily_generation_kwh: dailyGenerationKwh,
      total_generation_kwh: totalGenerationKwh,
      specific_yield: specificYield,
      online_status: onlineStatus,
      last_update: lastSeenAt,
      frequency_hz: frequencyHz,
      reactive_power_kvar: reactivePowerKvar,
      power_factor: powerFactor,
      current_r_a,
      current_s_a,
      current_t_a,
      voltage_r_v,
      voltage_s_v,
      voltage_t_v,
      apparent_power_kva: apparentPowerKva,
      battery_soc_pct: batterySocPct,
      battery_soh_pct: batterySohPct,
      battery_power_kw: batteryPowerKw,
      battery_voltage_v: batteryVoltageV,
      battery_current_a: batteryCurrentA,
      load_power_kw: loadPowerKw,
      grid_purchased_today_kwh: gridPurchasedTodayKwh,
      grid_sell_today_kwh: gridSellTodayKwh,
      load_today_kwh: loadTodayKwh,
      metrics: cleanMetrics
    };

    // String Telemetry (1..32 inputs)
    const stringTelemetries: NormalizedStringTelemetry[] = [];
    for (let i = 1; i <= 32; i++) {
      const v = invData[`uPv${i}`];
      const curr = invData[`iPv${i}`];
      const voltage_v = v ? Math.round(parseFloat(v) * 100) / 100 : 0.0;
      const current_a = curr ? Math.round(parseFloat(curr) * 100) / 100 : 0.0;
      const power_kw = Math.round(((voltage_v * current_a) / 1000.0) * 1000) / 1000;
      const strStatus = voltage_v > 50 ? "ok" : "offline";

      stringTelemetries.push({
        string_index: i,
        voltage_v,
        current_a,
        power_kw,
        status: strStatus
      });
    }

    return [telemetry, stringTelemetries];
  }

  async fetchAlerts(plantId: string): Promise<NormalizedAlert[] | null> {
    const alerts: NormalizedAlert[] = [];
    let pageNo = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const alarmPayload = {
        pageNo: String(pageNo),
        pageSize: String(pageSize),
        stationId: plantId,
        state: 0 // Fetch active alarms specifically so they aren't buried under resolved historical alarms
      };

      const res = await this._callSolis("/v1/api/alarmList", alarmPayload);
      if (!res || res.code !== "0") {
        if (pageNo === 1) return null; // Report API failure on first page
        break;
      }

      const records = res.data?.records || [];
      for (const alarm of records) {
        const stateStr = String(alarm.state);
        if (stateStr !== "0" && stateStr !== "1") {
          continue; // Skip resolved/restored alarms
        }

        const code = alarm.alarmCode || "UNKNOWN";
        const title = alarm.alarmMsg || "Fault Detected";
        let description = alarm.alarmMsg || "";

        const alarmTs = alarm.alarmBeginTime;
        const triggeredAt = alarmTs ? new Date(parseInt(alarmTs)).toISOString() : new Date().toISOString();

        let severity = "low";
        const lvl = String(alarm.alarmLevel);
        if (lvl === "3") {
          severity = "critical";
        } else if (lvl === "2") {
          severity = "high";
        } else if (lvl === "1") {
          severity = "medium";
        }

        const sn = alarm.alarmDeviceSn;
        if (sn) {
          description = `${description} (Device SN: ${sn})`;
        }

        alerts.push({
          code,
          title,
          description,
          severity,
          triggered_at: triggeredAt,
          alarm_code: code,
          oem: "solis",
          category: "inverter",
          is_auto_resolvable: false,
          requires_technician: true,
          recommended_action: ""
        });
      }

      if (records.length < pageSize) {
        hasMore = false;
      } else {
        pageNo++;
      }
    }

    return alerts;
  }
}
