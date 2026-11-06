import crypto from "node:crypto";
import {
  NormalizedStation,
  NormalizedDevice,
  NormalizedTelemetry,
  NormalizedStringTelemetry,
  NormalizedAlert,
  OemAdapter
} from "./types.ts";
import { translateAlert } from "./alarm_mappings.ts";

const KEY_PATTERNS: Record<string, string[]> = {
  ac_power: ["active power", "generation power", "ac power", "total ac power", "output power", "pac"],
  dc_power: ["dc power", "total dc power", "pv power", "solar power", "ppv"],
  daily_generation: ["daily generation", "daily energy", "today generation", "today energy", "e-today", "etoday"],
  total_generation: ["total generation", "total energy", "cumulative energy", "e-total", "etotal"],
  temperature: ["temperature", "radiator temp", "heatsink temp", "internal temp", "inverter temp"],
  frequency: ["frequency", "grid frequency", "ac frequency", "fac"],
  power_factor: ["power factor", "pf"],
  reactive_power: ["reactive power", "qac"],
  apparent_power: ["apparent power", "sac"],
  voltage_r: ["voltage l1", "voltage r", "grid voltage l1", "u_ac1", "u_l1", "vac1"],
  voltage_s: ["voltage l2", "voltage s", "grid voltage l2", "u_ac2", "u_l2", "vac2"],
  voltage_t: ["voltage l3", "voltage t", "grid voltage l3", "u_ac3", "u_l3", "vac3"],
  current_r: ["current l1", "current r", "grid current l1", "i_ac1", "i_l1", "iac1"],
  current_s: ["current l2", "current s", "grid current l2", "i_ac2", "i_l2", "iac2"],
  current_t: ["current l3", "current t", "grid current l3", "i_ac3", "i_l3", "iac3"],
  battery_soc: ["battery soc", "soc", "battery capacity percentage"],
  battery_soh: ["battery soh", "soh"],
  battery_power: ["battery power", "battery charge/discharge power", "pbat"],
  battery_voltage: ["battery voltage", "vbat"],
  battery_current: ["battery current", "ibat"],
  load_power: ["load power", "home load", "consumption power", "pload"],
  grid_purchased_today: ["daily grid purchase", "grid purchased today", "buy energy today"],
  grid_sell_today: ["daily grid sell", "grid sell today", "sell energy today"],
  load_today: ["daily consumption", "load today", "load energy today"]
};

export class FestonAdapter implements OemAdapter {
  private appId: string;
  private appSecret: string;
  private apiUrl: string;
  private platformUrl: string;
  private email?: string;
  private username?: string;
  private password?: string;
  private accessToken?: string;
  private tokenExpiry: number = 0;

  constructor(options: {
    appId?: string;
    appSecret?: string;
    apiUrl?: string;
    platformUrl?: string;
    email?: string;
    username?: string;
    password?: string;
    accessToken?: string;
  } = {}) {
    const getEnv = (k: string) => typeof Deno !== "undefined" ? Deno.env.get(k) : undefined;
    this.appId = options.appId || getEnv("SOLAROS_APP_ID") || "202610131053002";
    this.appSecret = options.appSecret || getEnv("SOLAROS_APP_SECRET") || "a7e3f7b5ab36de3103b76b62798ea2d3";
    this.apiUrl = (options.apiUrl || getEnv("SOLAROS_API_URL") || "https://india-developer.solaros.com").replace(/\/+$/, "");
    this.platformUrl = (options.platformUrl || getEnv("SOLAROS_PLATFORM_URL") || "https://india.solaros.com").replace(/\/+$/, "");
    this.email = options.email || getEnv("SOLAROS_EMAIL");
    this.username = options.username || getEnv("SOLAROS_USERNAME");
    this.password = options.password || getEnv("SOLAROS_PASSWORD");
    this.accessToken = options.accessToken || getEnv("SOLAROS_ACCESS_TOKEN");
  }

  public async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now() / 1000;
    if (!forceRefresh && this.accessToken && this.tokenExpiry > now + 300) {
      return this.accessToken;
    }

    if (this.accessToken && !forceRefresh) {
      return this.accessToken;
    }

    if (!this.password || (!this.email && !this.username)) {
      if (this.accessToken) {
        return this.accessToken;
      }
      throw new Error("Missing SolarOS credentials (SOLAROS_EMAIL/SOLAROS_PASSWORD or SOLAROS_ACCESS_TOKEN).");
    }

    const sha256Pass = crypto.createHash("sha256").update(this.password, "utf8").digest("hex").toLowerCase();
    const url = `${this.apiUrl}/v1.0/account/token?appId=${encodeURIComponent(this.appId)}`;
    const payload: Record<string, any> = {
      appSecret: this.appSecret,
      password: sha256Pass
    };
    if (this.email) payload.email = this.email;
    else if (this.username) payload.username = this.username;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`SolarOS token request failed with HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    if (!data.success || data.code !== "1000000") {
      throw new Error(`SolarOS token error [${data.code}]: ${data.msg || "Authentication failed"}`);
    }

    this.accessToken = data.accessToken;
    const expiresIn = Number(data.expiresIn || 5183999);
    this.tokenExpiry = now + expiresIn;
    return this.accessToken!;
  }

  private async _callPlatform(endpoint: string, method = "POST", bodyDict?: Record<string, any>, params?: Record<string, any>): Promise<any> {
    const token = await this.getAccessToken();
    let url = `${this.platformUrl}${endpoint}`;
    if (params) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        q.append(k, String(v));
      }
      url += (url.includes("?") ? "&" : "?") + q.toString();
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const init: RequestInit = {
          method: method.toUpperCase(),
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          }
        };
        if (method.toUpperCase() === "POST" && bodyDict) {
          init.body = JSON.stringify(bodyDict);
        }

        const res = await fetch(url, init);
        if (res.ok) {
          return await res.json();
        }
      } catch (err: any) {
        console.warn(`[Feston] Platform API call error on ${endpoint} (attempt ${attempt}): ${err.message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return { code: "-1", msg: "Platform request failed" };
  }

  private async _callSolaros(endpoint: string, bodyDict: Record<string, any> = {}): Promise<any> {
    let token = await this.getAccessToken();
    const url = `${this.apiUrl}${endpoint}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(bodyDict)
        });

        if (res.status === 401) {
          console.warn("[Feston] SolarOS returned 401 Unauthorized. Refreshing token...");
          token = await this.getAccessToken(true);
          continue;
        }

        if (res.ok) {
          return await res.json();
        }
      } catch (err: any) {
        console.warn(`[Feston] SolarOS API call error on ${endpoint} (attempt ${attempt}): ${err.message}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    return { code: "-1", msg: "SolarOS OpenAPI call failed after retries", success: false };
  }

  public async listStations(): Promise<NormalizedStation[]> {
    const stations: NormalizedStation[] = [];

    // Primary: SolarOS India Platform search
    try {
      const resPlatform = await this._callPlatform(
        "/maintain-s/operating/station/v2/search",
        "POST",
        {},
        { page: 1, size: 100 }
      );

      if (resPlatform?.total && Array.isArray(resPlatform.data) && resPlatform.data.length > 0) {
        for (const item of resPlatform.data) {
          const s = item.station || {};
          const plantId = String(s.id);
          const name = s.name || `Feston Plant ${plantId}`;
          const capacity = Number(s.installedCapacity || 0);
          const location = s.locationAddress || "India";
          const timezone = s.regionTimezone || "Asia/Kolkata";

          const rawTime = s.startOperatingTime || s.createdDate;
          let commissionedOn: string | null = null;
          if (rawTime) {
            try {
              if (typeof rawTime === "number") {
                commissionedOn = new Date(rawTime * 1000).toISOString().split("T")[0];
              } else if (typeof rawTime === "string" && rawTime.length >= 10) {
                commissionedOn = rawTime.slice(0, 10);
              }
            } catch (_) {
              commissionedOn = null;
            }
          }

          stations.push({
            plant_id: plantId,
            name,
            capacity_kwp: capacity,
            location,
            timezone,
            commissioned_on: commissionedOn
          });
        }
        console.log(`[Feston] Discovered ${stations.length} station(s) from SolarOS Platform API.`);
        return stations;
      }
    } catch (err: any) {
      console.warn(`[Feston] Platform station search fallback to OpenAPI: ${err.message}`);
    }

    // Fallback: OpenAPI Gateway
    let page = 1;
    const size = 50;
    let fetchedCount = 0;

    while (true) {
      const res = await this._callSolaros("/v1.0/station/list", { page, size });
      if (!res?.success && res?.code !== "1000000") {
        break;
      }

      const list = res.stationList || [];
      fetchedCount += list.length;

      for (const s of list) {
        const plantId = String(s.id);
        const name = s.name || `Feston Plant ${plantId}`;
        const capacity = Number(s.installedCapacity || 0);
        const location = s.locationAddress || "India";
        const timezone = s.regionTimezone || "Asia/Kolkata";

        const rawTime = s.startOperatingTime || s.createdDate;
        let commissionedOn: string | null = null;
        if (rawTime) {
          try {
            if (typeof rawTime === "number") {
              commissionedOn = new Date(rawTime * 1000).toISOString().split("T")[0];
            } else if (typeof rawTime === "string" && rawTime.length >= 10) {
              commissionedOn = rawTime.slice(0, 10);
            }
          } catch (_) {
            commissionedOn = null;
          }
        }

        stations.push({
          plant_id: plantId,
          name,
          capacity_kwp: capacity,
          location,
          timezone,
          commissioned_on: commissionedOn
        });
      }

      const total = res.total || 0;
      if (fetchedCount >= total || list.length === 0) {
        break;
      }
      page++;
    }

    console.log(`[Feston] Discovered ${stations.length} station(s) from SolarOS account.`);
    return stations;
  }

  public async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    const devices: NormalizedDevice[] = [];
    const stId = plantId;

    // Primary: Platform deviceList
    try {
      const resPlatform = await this._callPlatform(
        "/maintain-s/power/system/deviceList",
        "POST",
        { page: 1, size: 100 }
      );

      if (resPlatform?.total !== undefined && Array.isArray(resPlatform.data)) {
        for (const d of resPlatform.data) {
          if (String(d.siteId) === String(stId) && d.deviceType === "INVERTER") {
            const devId = String(d.deviceId);
            const sn = String(d.deviceSn || devId);
            const model = String(d.productId || "SUN-G Inverter");
            const state = Number(d.deviceState ?? 1);
            const status = state === 1 ? "online" : state === 2 ? "alert" : "offline";

            devices.push({
              oem_device_id: devId,
              model,
              serial_number: sn,
              capacity_kw: 0.0,
              string_count: 2,
              status,
              last_seen_at: new Date().toISOString()
            });
          }
        }
        console.log(`[Feston] Discovered ${devices.length} inverter(s) for plant ${plantId} via SolarOS Platform.`);
        return devices;
      }
    } catch (err: any) {
      console.warn(`[Feston] Platform deviceList fallback to OpenAPI: ${err.message}`);
    }

    // Fallback: OpenAPI Gateway
    let page = 1;
    const size = 50;
    let fetchedCount = 0;
    const numericStId = Number(plantId) || plantId;

    while (true) {
      const res = await this._callSolaros("/v1.0/station/device", {
        stationIds: [numericStId],
        page,
        size
      });

      if (!res?.success && res?.code !== "1000000") {
        break;
      }

      const items = res.deviceListItems || [];
      fetchedCount += items.length;

      for (const d of items) {
        const devType = String(d.deviceType || "INVERTER").toUpperCase();
        if (!devType.includes("INVERTER") && devType !== "PCS" && devType !== "HYBRID") {
          continue;
        }

        const sn = String(d.deviceSn || d.deviceId);
        const rawModel = String(d.productId || "Feston Hybrid Inverter");
        const connectStatus = Number(d.connectStatus);
        const status = connectStatus === 1 ? "online" : connectStatus === 2 ? "alert" : "offline";

        const colTime = d.collectionTime;
        const lastSeen = colTime && typeof colTime === "number" ? new Date(colTime * 1000).toISOString() : new Date().toISOString();

        devices.push({
          oem_device_id: sn,
          model: rawModel,
          serial_number: sn,
          capacity_kw: 0.0,
          string_count: 2,
          status,
          last_seen_at: lastSeen
        });
      }

      const total = res.total || 0;
      if (fetchedCount >= total || items.length === 0) {
        break;
      }
      page++;
    }

    console.log(`[Feston] Discovered ${devices.length} inverter(s) for plant ${plantId}.`);
    return devices;
  }

  private _matchMetricValue(dataList: any[], patterns: string[]): number | null {
    if (!Array.isArray(dataList)) return null;
    for (const item of dataList) {
      const keyName = String(item.key || "").trim().toLowerCase();
      const valRaw = item.value;
      if (valRaw === undefined || valRaw === null) continue;

      for (const pattern of patterns) {
        if (keyName.includes(pattern)) {
          const num = Number(valRaw);
          if (!isNaN(num)) return num;
        }
      }
    }
    return null;
  }

  public async fetchTelemetry(deviceId: string): Promise<[NormalizedTelemetry | null, NormalizedStringTelemetry[]]> {
    const nowIso = new Date().toISOString();

    // Primary: Platform OriginalData
    try {
      const resOrig = await this._callPlatform(`/device-s/device/originalData?deviceId=${encodeURIComponent(deviceId)}`, "GET");

      if (resOrig && typeof resOrig === "object" && (resOrig.APo_t1 !== undefined || resOrig.PM1_AAC !== undefined)) {
        const acW = Number(resOrig.APo_t1 || 0);
        const acKw = acW / 1000.0;
        const dailyKwh = Number(resOrig.Etdy_ge1 || resOrig.t_gc_tdy1 || 0);
        const totalKwh = Number(resOrig.t_gc1 || resOrig.Et_ge0 || 0);
        const v1 = Number(resOrig.AV1 || 0);
        const i1 = Number(resOrig.AC1 || 0);
        const freq = Number(resOrig.A_Fo1 || 50.0);
        const temp = Number(resOrig.T_AC_RDT1 || resOrig.ENV_T0 || 35.0);
        const pf = Number(resOrig.L_A_P_A_R_P || 1.0);

        // Dynamic MPPT Strings
        const stringTelemetries: NormalizedStringTelemetry[] = [];
        let dcSumW = 0.0;
        for (let idx = 1; idx <= 8; idx++) {
          const dv = Number(resOrig[`DV${idx}`] || 0);
          const dc = Number(resOrig[`DC${idx}`] || 0);
          const dp = Number(resOrig[`DP${idx}`] || 0);

          if (dv > 0 || dc > 0) {
            dcSumW += dp;
            stringTelemetries.push({
              string_index: idx,
              voltage_v: Math.round(dv * 100) / 100,
              current_a: Math.round(dc * 100) / 100,
              power_kw: Math.round((dp / 1000.0) * 1000) / 1000,
              status: dv > 10.0 && dc > 0.05 ? "ok" : "standby",
              metrics: { raw_v: dv, raw_i: dc, raw_p: dp }
            });
          }
        }

        const dcKw = dcSumW > 0 ? dcSumW / 1000.0 : acKw;
        let eff = dcKw > 0.05 ? Math.round((acKw / dcKw) * 10000) / 100 : 98.2;
        eff = Math.min(Math.max(eff, 0.0), 100.0);

        const telemetry: NormalizedTelemetry = {
          timestamp: nowIso,
          ac_power_kw: Math.round(acKw * 1000) / 1000,
          dc_power_kw: Math.round(dcKw * 1000) / 1000,
          energy_kwh: Math.round(totalKwh * 100) / 100,
          efficiency_pct: eff,
          temperature_c: Math.round(temp * 10) / 10,
          daily_generation_kwh: Math.round(dailyKwh * 100) / 100,
          total_generation_kwh: Math.round(totalKwh * 100) / 100,
          specific_yield: dcKw > 0 ? Math.round((dailyKwh / Math.max(dcKw, 1.0)) * 100) / 100 : 0.0,
          online_status: acKw > 0.05,
          last_update: nowIso,
          frequency_hz: Math.round(freq * 100) / 100,
          power_factor: pf,
          current_r_a: Math.round(i1 * 100) / 100,
          voltage_r_v: Math.round(v1 * 10) / 10,
          metrics: resOrig
        };

        return [telemetry, stringTelemetries];
      }
    } catch (err: any) {
      console.warn(`[Feston] Platform telemetry fetch fallback to OpenAPI for device ${deviceId}: ${err.message}`);
    }

    // Fallback: OpenAPI Gateway
    try {
      const res = await this._callSolaros("/v1.0/device/latest", {
        deviceList: [String(deviceId)],
        deviceType: "INVERTER"
      });

      if (!res?.success && res?.code !== "1000000") {
        return [null, []];
      }

      const listResp = res.deviceDataList || [];
      if (listResp.length === 0) return [null, []];

      const deviceData = listResp[0];
      const rawRegisters = deviceData.dataList || [];
      const colTime = deviceData.collectionTime;
      const timestampIso = colTime && typeof colTime === "number" ? new Date(colTime * 1000).toISOString() : nowIso;

      const acPower = this._matchMetricValue(rawRegisters, KEY_PATTERNS.ac_power) || 0.0;
      const dcPower = this._matchMetricValue(rawRegisters, KEY_PATTERNS.dc_power) || acPower;
      const dailyGen = this._matchMetricValue(rawRegisters, KEY_PATTERNS.daily_generation) || 0.0;
      const totalGen = this._matchMetricValue(rawRegisters, KEY_PATTERNS.total_generation) || 0.0;
      const temp = this._matchMetricValue(rawRegisters, KEY_PATTERNS.temperature) || 35.0;
      const freq = this._matchMetricValue(rawRegisters, KEY_PATTERNS.frequency);
      const pf = this._matchMetricValue(rawRegisters, KEY_PATTERNS.power_factor);
      const vR = this._matchMetricValue(rawRegisters, KEY_PATTERNS.voltage_r);
      const vS = this._matchMetricValue(rawRegisters, KEY_PATTERNS.voltage_s);
      const vT = this._matchMetricValue(rawRegisters, KEY_PATTERNS.voltage_t);
      const iR = this._matchMetricValue(rawRegisters, KEY_PATTERNS.current_r);
      const iS = this._matchMetricValue(rawRegisters, KEY_PATTERNS.current_s);
      const iT = this._matchMetricValue(rawRegisters, KEY_PATTERNS.current_t);
      const bSoc = this._matchMetricValue(rawRegisters, KEY_PATTERNS.battery_soc);

      const rawMetricsDict: Record<string, any> = {};
      for (const item of rawRegisters) {
        if (item.key) {
          rawMetricsDict[item.key] = { value: item.value, unit: item.unit };
        }
      }

      let eff = dcPower > 0.1 ? Math.round((acPower / dcPower) * 10000) / 100 : 98.2;
      eff = Math.min(Math.max(eff, 0.0), 100.0);

      const telemetry: NormalizedTelemetry = {
        timestamp: timestampIso,
        ac_power_kw: Math.round(acPower * 1000) / 1000,
        dc_power_kw: Math.round(dcPower * 1000) / 1000,
        energy_kwh: Math.round(totalGen * 100) / 100,
        efficiency_pct: eff,
        temperature_c: Math.round(temp * 10) / 10,
        daily_generation_kwh: Math.round(dailyGen * 100) / 100,
        total_generation_kwh: Math.round(totalGen * 100) / 100,
        specific_yield: dcPower > 0 ? Math.round((dailyGen / Math.max(dcPower, 1.0)) * 100) / 100 : 0.0,
        online_status: acPower > 0.05,
        last_update: timestampIso,
        frequency_hz: freq,
        power_factor: pf,
        current_r_a: iR,
        current_s_a: iS,
        current_t_a: iT,
        voltage_r_v: vR,
        voltage_s_v: vS,
        voltage_t_v: vT,
        battery_soc_pct: bSoc,
        metrics: rawMetricsDict
      };

      const stringTelemetries: NormalizedStringTelemetry[] = [];
      for (let idx = 1; idx <= 16; idx++) {
        const v = this._matchMetricValue(rawRegisters, [`pv${idx} voltage`, `pv${idx}_voltage`, `pv ${idx} voltage`, `u_pv${idx}`]);
        const i = this._matchMetricValue(rawRegisters, [`pv${idx} current`, `pv${idx}_current`, `pv ${idx} current`, `i_pv${idx}`]);
        const p = this._matchMetricValue(rawRegisters, [`pv${idx} power`, `pv${idx}_power`, `pv ${idx} power`, `p_pv${idx}`]);

        if (v !== null || i !== null) {
          const vVal = Math.max(v || 0.0, 0.0);
          const iVal = Math.max(i || 0.0, 0.0);
          const pVal = p !== null ? p : Math.round(((vVal * iVal) / 1000.0) * 1000) / 1000;

          stringTelemetries.push({
            string_index: idx,
            voltage_v: Math.round(vVal * 100) / 100,
            current_a: Math.round(iVal * 100) / 100,
            power_kw: Math.round(pVal * 1000) / 1000,
            status: vVal > 10.0 && iVal > 0.05 ? "ok" : "standby",
            metrics: { raw_v: v, raw_i: i, raw_p: p }
          });
        }
      }

      return [telemetry, stringTelemetries];
    } catch (err: any) {
      console.warn(`[Feston] Failed to fetch telemetry via OpenAPI for device ${deviceId}: ${err.message}`);
      return [null, []];
    }
  }

  public async fetchAlerts(plantId: string): Promise<NormalizedAlert[]> {
    const alerts: NormalizedAlert[] = [];
    const stId = plantId;

    // Primary: Platform Alert Search
    try {
      const resPlatform = await this._callPlatform(
        "/device-s/device/alert/list?order.direction=DESC&order.property=alertTime",
        "POST",
        { page: 1, size: 100 }
      );

      if (resPlatform?.total !== undefined && Array.isArray(resPlatform.data)) {
        for (const item of resPlatform.data) {
          const rawCode = String(item.alertCode || item.protocolName || "");
          const alertName = item.alertName || `Alert ${rawCode}`;
          const deviceSn = item.deviceSn ? String(item.deviceSn) : "";
          const startTime = item.alertStartTime;
          const triggeredAt = startTime && typeof startTime === "number" ? new Date(startTime * 1000).toISOString() : new Date().toISOString();
          const translated = translateAlert("feston", rawCode, alertName);

          let desc = translated.description;
          if (deviceSn) {
            desc = `(Device SN: ${deviceSn}) ${desc}`;
          }

          alerts.push({
            code: rawCode || alertName,
            title: translated.title,
            description: desc,
            severity: translated.severity,
            triggered_at: triggeredAt,
            alarm_code: rawCode || "FESTON_ALARM",
            oem: "feston",
            category: translated.category,
            is_auto_resolvable: translated.is_auto_resolvable,
            requires_technician: translated.requires_technician,
            recommended_action: translated.recommended_action
          });
        }
        return alerts;
      }
    } catch (err: any) {
      console.warn(`[Feston] Platform alert search fallback to OpenAPI: ${err.message}`);
    }

    // Fallback: OpenAPI Alert List
    const nowTs = Math.floor(Date.now() / 1000);
    const startTs = nowTs - 30 * 86400;
    const numericStId = Number(plantId) || plantId;

    try {
      const res = await this._callSolaros("/v1.0/station/alertList", {
        stationId: numericStId,
        startTimestamp: startTs,
        endTimestamp: nowTs,
        page: 1,
        size: 100
      });

      if (!res?.success && res?.code !== "1000000") {
        return alerts;
      }

      for (const item of res.stationAlertItems || []) {
        if (item.status === 0) continue;
        const rawCode = String(item.alertCode || item.protocolName || "");
        const alertName = item.alertName || `Alert ${rawCode}`;
        const deviceSn = item.deviceSn ? String(item.deviceSn) : "";
        const startTime = item.alertStartTime;
        const triggeredAt = startTime && typeof startTime === "number" ? new Date(startTime * 1000).toISOString() : new Date().toISOString();
        const translated = translateAlert("feston", rawCode, alertName);

        let desc = translated.description;
        if (deviceSn) {
          desc = `(Device SN: ${deviceSn}) ${desc}`;
        }

        alerts.push({
          code: rawCode || alertName,
          title: translated.title,
          description: desc,
          severity: translated.severity,
          triggered_at: triggeredAt,
          alarm_code: rawCode || "FESTON_ALARM",
          oem: "feston",
          category: translated.category,
          is_auto_resolvable: translated.is_auto_resolvable,
          requires_technician: translated.requires_technician,
          recommended_action: translated.recommended_action
        });
      }
    } catch (err: any) {
      console.warn(`[Feston] Failed to fetch alerts via OpenAPI for plant ${plantId}: ${err.message}`);
    }

    return alerts;
  }
}
