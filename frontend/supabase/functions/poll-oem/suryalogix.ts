import {
  NormalizedStation,
  NormalizedDevice,
  NormalizedTelemetry,
  NormalizedStringTelemetry,
  NormalizedAlert,
  OemAdapter
} from "./types.ts";
import { translateAlert } from "./alarm_mappings.ts";

export interface SuryalogixPlantConfig {
  name: string;
  token: string;
  capacity_kwp: number;
}

export const KNOWN_SURYALOGIX_PLANTS: Record<string, SuryalogixPlantConfig> = {
  "VlpaWHZFU2ZtWE00YlFJMDZHQTlVdXUvdkMvWjM4c2oxNFlXVWJ3MnV4Yz0=": {
    name: "OMYA Inoj Car Port",
    token: "VlpaWHZFU2ZtWE00YlFJMDZHQTlVdXUvdkMvWjM4c2oxNFlXVWJ3MnV4Yz0=",
    capacity_kwp: 100.0
  },
  "RG9SK3RPbC8yV0o1ODR4U3kzZ2ZIaGF3ZDdPUTdhODF5d2xkL3ZJYW4rcz0=": {
    name: "OMYA Inoj Stockpile",
    token: "RG9SK3RPbC8yV0o1ODR4U3kzZ2ZIaGF3ZDdPUTdhODF5d2xkL3ZJYW4rcz0=",
    capacity_kwp: 500.0
  },
  "dHVSQWF5TVZoUHF3UmlZS2trUTk5b2YzN2Y2VGcyN2dvQktTMGU0SU5xQT0=": {
    name: "OMYA Inoj Warehouse",
    token: "dHVSQWF5TVZoUHF3UmlZS2trUTk5b2YzN2Y2VGcyN2dvQktTMGU0SU5xQT0=",
    capacity_kwp: 300.0
  }
};

export class SuryalogixAdapter implements OemAdapter {
  private secret: string;
  private apiUrl: string;
  private plantTokens: string[];
  private cache: Map<string, { timestamp: number; data: any }> = new Map();
  private lastCallTime: number = 0;

  constructor(options: {
    secret?: string;
    apiUrl?: string;
    plants?: Array<{ plant_id?: string; token?: string; name?: string }>;
  } = {}) {
    const getEnv = (k: string) => typeof Deno !== "undefined" ? Deno.env.get(k) : undefined;
    this.secret = options.secret || getEnv("SURYALOGIX_SECRET") || "cd8ae85e44e2ca7d997904893f8fb7fe";
    this.apiUrl = options.apiUrl || getEnv("SURYALOGIX_API_URL") || "https://cloud.suryalog.ae/api/get_datalog_v7.php";

    if (options.plants && options.plants.length > 0) {
      this.plantTokens = options.plants.map(p => p.token || p.plant_id || "").filter(Boolean);
    } else {
      this.plantTokens = Object.keys(KNOWN_SURYALOGIX_PLANTS);
    }
  }

  private async ratePacedFetch(url: string, payload: any): Promise<any> {
    const minInterval = 2500; // 2.5s pacing to satisfy Result 8 limit
    const elapsed = Date.now() - this.lastCallTime;
    if (elapsed < minInterval) {
      await new Promise(r => setTimeout(r, minInterval - elapsed));
    }
    this.lastCallTime = Date.now();

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Suryalogix HTTP error ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  }

  private async fetchPlantData(plantToken: string): Promise<any> {
    const cached = this.cache.get(plantToken);
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.data;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      secret: this.secret,
      plant: plantToken,
      format: "std",
      for: "data",
      stime: String(now - 7200),
      etime: String(now)
    };

    const res = await this.ratePacedFetch(this.apiUrl, payload);
    if (res.result !== 0) {
      console.warn(`Suryalogix warning for plant ${plantToken}: ${res.cmsg} (code: ${res.result})`);
      return null;
    }

    this.cache.set(plantToken, { timestamp: Date.now(), data: res.data });
    return res.data;
  }

  async listStations(): Promise<NormalizedStation[]> {
    return this.plantTokens.map(token => {
      const known = KNOWN_SURYALOGIX_PLANTS[token];
      return {
        plant_id: token,
        name: known ? known.name : `Suryalogix Plant ${token.slice(0, 8)}`,
        capacity_kwp: known ? known.capacity_kwp : 100.0,
        location: "India",
        timezone: "Asia/Kolkata",
        commissioned_on: "2024-01-01"
      };
    });
  }

  async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    const data = await this.fetchPlantData(plantId);
    if (!data || typeof data !== "object") return [];

    const timestamps = Object.keys(data).sort();
    if (timestamps.length === 0) return [];
    const latestTs = timestamps[timestamps.length - 1];
    const entry = data[latestTs];
    const inverters = entry?.inverter || {};

    const devices: NormalizedDevice[] = [];
    for (const [invId, inv] of Object.entries<any>(inverters)) {
      const acCap = parseFloat(inv.AC_CAP) || 50.0;
      const serialNumber = inv.SL_NO || `${plantId}_${invId}`;
      const acPower = (parseFloat(inv.WT) || 0) / 1000.0;
      const dcPower = (parseFloat(inv.DC_W) || 0) / 1000.0;
      const isOnline = inv.inverter_status === 4 || acPower > 0 || dcPower > 0;

      // Count active MPPT channels
      let stringCount = 0;
      for (let i = 1; i <= 12; i++) {
        if (inv[`MPP_V${i}`] > 0 || inv[`MPP_I${i}`] > 0) stringCount++;
      }
      if (stringCount === 0) stringCount = 4;

      const deviceIsoTime = new Date(parseInt(latestTs, 10) * 1000).toISOString();

      devices.push({
        oem_device_id: `${plantId}#${invId}`,
        model: inv.inverter_type || invId,
        serial_number: serialNumber,
        capacity_kw: acCap,
        string_count: stringCount,
        status: isOnline ? "online" : (inv.inverter_status === 5 ? "fault" : "offline"),
        last_seen_at: deviceIsoTime,
        installed_on: "2024-01-01",
        modules_count: Math.round((acCap * 1000) / 540)
      });
    }

    return devices;
  }

  async fetchTelemetry(deviceId: string): Promise<[NormalizedTelemetry | null, NormalizedStringTelemetry[]]> {
    // deviceId format: `${plantId}#${invId}`
    const parts = deviceId.split("#");
    const plantId = parts[0];
    const invId = parts[1] || "I1";

    const data = await this.fetchPlantData(plantId);
    if (!data || typeof data !== "object") return [null, []];

    const timestamps = Object.keys(data).sort();
    if (timestamps.length === 0) return [null, []];
    const latestTs = timestamps[timestamps.length - 1];
    const entry = data[latestTs];
    const inv = entry?.inverter?.[invId];

    if (!inv) return [null, []];

    const acPowerKw = (parseFloat(inv.WT) || 0) / 1000.0;
    const dcPowerKw = (parseFloat(inv.DC_W) || 0) / 1000.0;
    const dailyKwh = parseFloat(inv.KWH_Day) || (parseFloat(inv.WHDay) ? parseFloat(inv.WHDay) / 1000.0 : 0);
    const totalKwh = parseFloat(inv.WHTot) || 0;
    const acCap = parseFloat(inv.AC_CAP) || 50.0;
    const specificYield = acCap > 0 ? dailyKwh / acCap : 0;
    const tempC = parseFloat(inv.TEMP_HS) || parseFloat(inv.TEMP_INT) || 35.0;
    const isOnline = inv.inverter_status === 4 || acPowerKw > 0 || dcPowerKw > 0;
    const efficiency = dcPowerKw > 0 ? Math.min(100, Math.max(0, (acPowerKw / dcPowerKw) * 100)) : (isOnline ? 97.0 : 0);
    const isoTime = new Date(parseInt(latestTs, 10) * 1000).toISOString();

    const addon = typeof inv.ADDON_DATA === "object" ? inv.ADDON_DATA : {};

    const telemetry: NormalizedTelemetry = {
      timestamp: isoTime,
      ac_power_kw: acPowerKw,
      dc_power_kw: dcPowerKw,
      energy_kwh: totalKwh,
      efficiency_pct: efficiency,
      temperature_c: tempC,
      daily_generation_kwh: dailyKwh,
      total_generation_kwh: totalKwh,
      specific_yield: specificYield,
      online_status: isOnline,
      last_update: isoTime,
      frequency_hz: parseFloat(inv.FREQ) || 50.0,
      power_factor: parseFloat(inv.PFT) || 1.0,
      reactive_power_kvar: (parseFloat(inv.VART) || 0) / 1000.0,
      apparent_power_kva: (parseFloat(inv.VAT) || 0) / 1000.0,
      voltage_r_v: parseFloat(addon.V1) || parseFloat(inv.VT) || null,
      voltage_s_v: parseFloat(addon.V2) || parseFloat(inv.VT) || null,
      voltage_t_v: parseFloat(addon.V3) || parseFloat(inv.VT) || null,
      current_r_a: parseFloat(addon.I1) || (parseFloat(inv.IT) ? parseFloat(inv.IT) / 3.0 : null),
      current_s_a: parseFloat(addon.I2) || (parseFloat(inv.IT) ? parseFloat(inv.IT) / 3.0 : null),
      current_t_a: parseFloat(addon.I3) || (parseFloat(inv.IT) ? parseFloat(inv.IT) / 3.0 : null),
      metrics: {
        raw_suryalog_status: inv.suryalog_status,
        raw_inverter_status: inv.inverter_status,
        run_hours: inv.RUN_HOURS,
        temp_int: inv.TEMP_INT,
        temp_hs: inv.TEMP_HS,
        day_pr: inv.Day_PR,
        w1: inv.W1,
        w2: inv.W2,
        w3: inv.W3
      }
    };

    // Extract individual string/MPPT metrics
    const stringTelemetries: NormalizedStringTelemetry[] = [];
    let mppIdx = 1;
    for (let i = 1; i <= 12; i++) {
      const v = parseFloat(inv[`MPP_V${i}`]) || 0;
      const c = parseFloat(inv[`MPP_I${i}`]) || 0;
      const w = parseFloat(inv[`MPP_W${i}`]) || (v * c);
      if (v > 10.0 || c > 0.05 || w > 10.0) {
        const pKw = w / 1000.0;
        stringTelemetries.push({
          string_index: mppIdx++,
          voltage_v: v,
          current_a: c,
          power_kw: pKw,
          status: pKw > 0.05 ? "normal" : (v > 20.0 ? "low_current" : "offline"),
          metrics: { mppt_channel: i, raw_w: w }
        });
      }
    }

    // If no MPP channels had readings, check SMB object if present
    if (stringTelemetries.length === 0 && entry?.smb) {
      for (const [_, smb] of Object.entries<any>(entry.smb)) {
        const smbV = parseFloat(smb.V) || parseFloat(inv.DC_V) || 0;
        for (let s = 1; s <= 18; s++) {
          const sI = parseFloat(smb[`I${s}`]) || 0;
          if (sI > 0.05 || smbV > 50) {
            const sKw = (smbV * sI) / 1000.0;
            stringTelemetries.push({
              string_index: s,
              voltage_v: smbV,
              current_a: sI,
              power_kw: sKw,
              status: sKw > 0.05 ? "normal" : (smbV > 20.0 ? "low_current" : "offline"),
              metrics: { smb_channel: s }
            });
          }
        }
      }
    }

    return [telemetry, stringTelemetries];
  }

  async fetchAlerts(plantId: string): Promise<NormalizedAlert[]> {
    const data = await this.fetchPlantData(plantId);
    if (!data || typeof data !== "object") return [];

    const timestamps = Object.keys(data).sort();
    if (timestamps.length === 0) return [];
    const latestTs = timestamps[timestamps.length - 1];
    const entry = data[latestTs];
    const inverters = entry?.inverter || {};
    const isoTime = new Date(parseInt(latestTs, 10) * 1000).toISOString();

    const alerts: NormalizedAlert[] = [];

    for (const [invId, inv] of Object.entries<any>(inverters)) {
      const invStatus = parseInt(inv.inverter_status, 10);
      const suryalogStatus = parseInt(inv.suryalog_status, 10);
      const tempHs = parseFloat(inv.TEMP_HS) || 0;

      if (suryalogStatus === 0) {
        const tr = translateAlert("suryalogix", "ERR_COMM_DOWN", "Inverter Communication Lost");
        alerts.push({
          code: "ERR_COMM_DOWN",
          title: tr.title,
          description: `Inverter ${invId} lost communication with logger.`,
          severity: tr.severity,
          triggered_at: isoTime,
          alarm_code: "ERR_COMM_DOWN",
          oem: "suryalogix",
          category: tr.category,
          is_auto_resolvable: tr.is_auto_resolvable,
          requires_technician: tr.requires_technician,
          recommended_action: tr.recommended_action
        });
      }

      if (invStatus === 5) {
        const tr = translateAlert("suryalogix", "INV_STATUS_FAULT", "Inverter General Fault");
        alerts.push({
          code: "INV_STATUS_FAULT",
          title: tr.title,
          description: `Inverter ${invId} tripped into fault state (status code 5).`,
          severity: tr.severity,
          triggered_at: isoTime,
          alarm_code: "INV_STATUS_FAULT",
          oem: "suryalogix",
          category: tr.category,
          is_auto_resolvable: tr.is_auto_resolvable,
          requires_technician: tr.requires_technician,
          recommended_action: tr.recommended_action
        });
      }

      if (invStatus === 6) {
        const tr = translateAlert("suryalogix", "INV_STATUS_DERATING", "Inverter Thermal or Power Derating");
        alerts.push({
          code: "INV_STATUS_DERATING",
          title: tr.title,
          description: `Inverter ${invId} operating under active power derating.`,
          severity: tr.severity,
          triggered_at: isoTime,
          alarm_code: "INV_STATUS_DERATING",
          oem: "suryalogix",
          category: tr.category,
          is_auto_resolvable: tr.is_auto_resolvable,
          requires_technician: tr.requires_technician,
          recommended_action: tr.recommended_action
        });
      }

      if (tempHs > 80) {
        const tr = translateAlert("suryalogix", "OVER_TEMP", "Heatsink / Cabinet Over Temperature");
        alerts.push({
          code: "OVER_TEMP",
          title: tr.title,
          description: `Inverter ${invId} heatsink temperature is ${tempHs}°C (> 80°C threshold).`,
          severity: tr.severity,
          triggered_at: isoTime,
          alarm_code: "OVER_TEMP",
          oem: "suryalogix",
          category: tr.category,
          is_auto_resolvable: tr.is_auto_resolvable,
          requires_technician: tr.requires_technician,
          recommended_action: tr.recommended_action
        });
      }
    }

    return alerts;
  }
}
