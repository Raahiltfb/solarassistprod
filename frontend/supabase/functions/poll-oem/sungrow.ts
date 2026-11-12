import {
  NormalizedStation,
  NormalizedDevice,
  NormalizedTelemetry,
  NormalizedStringTelemetry,
  NormalizedAlert,
  OemAdapter
} from "./types.ts";
import { translateAlert } from "./alarm_mappings.ts";

export class SungrowAdapter implements OemAdapter {
  private appKey: string;
  private secretKey: string;
  private rsaPublicKey: string;
  private apiUrl: string;
  private userAccount?: string;
  private userPassword?: string;
  private token?: string;
  private tokenExpiry: number = 0;

  constructor(options: {
    appKey?: string;
    secretKey?: string;
    rsaPublicKey?: string;
    apiUrl?: string;
    userAccount?: string;
    userPassword?: string;
    token?: string;
  } = {}) {
    const getEnv = (k: string) => typeof Deno !== "undefined" ? Deno.env.get(k) : undefined;
    this.appKey = options.appKey || getEnv("ISOLARCLOUD_APP_KEY") || "B3500A80C94EADF9C52E01D7790A96DD";
    this.secretKey = options.secretKey || getEnv("ISOLARCLOUD_SECRET_KEY") || "k2a5vg8w7qdua4nqet6rsspnrhsmr3in";
    this.rsaPublicKey = options.rsaPublicKey || getEnv("ISOLARCLOUD_RSA_PUBLIC_KEY") || "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDoFf8y0HkNSRf4zNRVRW9NbTBiQ1uFPJcSCVx_D33yhb1vCoI9BrS_KpcXm4ATIJ5ogFptKuYOmVqgEda8jMmFplBGcsiLL_EJ-6d0TUoPwFddMr7shd51Y-vbel-Aqjmr-ShL7NbHLN_J0RrWDFW4ga0c1oVxY5IFWRHwFDMVAQIDAQAB";
    this.apiUrl = options.apiUrl || getEnv("ISOLARCLOUD_API_URL") || "https://gateway.isolarcloud.in";
    this.userAccount = options.userAccount || getEnv("ISOLARCLOUD_USER_ACCOUNT") || "maintain.ispat@ratneshgroup.in";
    this.userPassword = options.userPassword || getEnv("ISOLARCLOUD_USER_PASSWORD") || "Ratnesh123";
    this.token = options.token || getEnv("ISOLARCLOUD_TOKEN");
  }

  async login(): Promise<string | null> {
    if (!this.userAccount || !this.userPassword) return null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json;charset=UTF-8",
      "appkey": this.appKey,
      "sys_code": "901",
      "x-access-key": this.secretKey,
    };
    const body = {
      appkey: this.appKey,
      sys_code: "901",
      user_account: this.userAccount,
      user_password: this.userPassword,
    };
    try {
      const res = await fetch(`${this.apiUrl}/openapi/login`, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.result_code === "1" && data?.result_data?.token) {
        this.token = data.result_data.token;
        return this.token || null;
      }
    } catch (e) {
      console.error("[Sungrow] Login exception:", e);
    }
    return null;
  }

  private async callSungrow<T>(path: string, body: Record<string, unknown> = {}): Promise<T | null> {
    if (!this.token) {
      await this.login();
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json;charset=UTF-8",
      "appkey": this.appKey,
      "sys_code": "901",
      "token": this.token || "",
      "x-access-key": this.secretKey
    };

    const payload = {
      appkey: this.appKey,
      token: this.token,
      ...body
    };

    try {
      let res = await fetch(`${this.apiUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        console.error(`Sungrow API error on ${path}: HTTP ${res.status}`);
        return null;
      }

      let data = (await res.json()) as any;
      if ((data?.result_code === "002" || data?.result_code === "E900") && this.userAccount) {
        const refreshed = await this.login();
        if (refreshed) {
          headers["token"] = this.token || "";
          payload.token = this.token;
          res = await fetch(`${this.apiUrl}${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            data = await res.json();
          }
        }
      }

      return data as T;
    } catch (err) {
      console.error(`Sungrow call exception on ${path}:`, err);
      return null;
    }
  }

  async listStations(): Promise<NormalizedStation[]> {
    type Resp = {
      result_code: string;
      result_data?: {
        pageList?: Array<Record<string, unknown>>;
      };
    };

    const res = await this.callSungrow<Resp>("/openapi/getPowerStationList", { curPage: 1, size: 50 });
    const list = res?.result_data?.pageList || [];

    return list.map(item => ({
      plant_id: String(item.ps_id || item.id || ""),
      name: String(item.ps_name || item.name || "Sungrow Plant"),
      capacity_kwp: parseFloat(String(item.installed_power || item.capacity || 0)),
      location: String(item.ps_location || item.address || "India"),
      timezone: "Asia/Kolkata",
      commissioned_on: item.grid_connection_date ? String(item.grid_connection_date).slice(0, 10) : undefined
    }));
  }

  async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    type Resp = {
      result_code: string;
      result_data?: {
        pageList?: Array<Record<string, unknown>>;
      };
    };

    const res = await this.callSungrow<Resp>("/openapi/getDeviceList", {
      ps_id: /^\d+$/.test(plantId) ? parseInt(plantId, 10) : plantId,
      device_type: 1,
      size: 50
    });
    const list = res?.result_data?.pageList || [];

    return list
      .filter((d: any) => d.device_type === 1 && d.rel_state !== 0 && Boolean(d.device_sn))
      .map((d: any) => {
        const devId = String(d.ps_key || d.uuid || d.device_id || "");
        const modelCode = String(d.device_model_code || d.device_model || "Sungrow Inverter");
        const cap = modelCode.includes("125") ? 125.0 : (modelCode.includes("110") ? 110.0 : (modelCode.includes("100") ? 100.0 : parseFloat(String(d.device_power || 100))));
        const devStatus = String(d.dev_status ?? d.device_status ?? "");
        const isOnline = devStatus === "1" || devStatus.toLowerCase() === "online";

        return {
          oem_device_id: devId,
          model: modelCode,
          serial_number: String(d.device_sn || devId),
          capacity_kw: cap,
          string_count: 8,
          status: isOnline ? "online" : "offline",
          last_seen_at: new Date().toISOString(),
          installed_on: d.grid_connection_date ? String(d.grid_connection_date).slice(0, 10) : (d.install_date ? String(d.install_date).slice(0, 10) : "2024-07-16"),
          modules_count: cap > 0 ? Math.round((cap * 1000) / 540) : null
        };
      });
  }

  async fetchTelemetry(deviceId: string): Promise<[NormalizedTelemetry | null, NormalizedStringTelemetry[]]> {
    type Resp = {
      result_code: string;
      result_data?: {
        device_point_list?: Array<{
          device_point?: Record<string, unknown>;
        }>;
      };
    };

    const psId = deviceId.includes("_") && /^\d+$/.test(deviceId.split("_")[0])
      ? parseInt(deviceId.split("_")[0], 10)
      : 1376094;

    const res = await this.callSungrow<Resp>("/openapi/getDeviceRealTimeData", {
      ps_id: psId,
      device_type: 1,
      ps_key_list: [deviceId],
      point_id_list: ["83001", "83002", "83003", "83004", "83005", "83006", "83020", "83022", "83025", "83026", "83027", "83028", "83029", "p83020", "p83022", "p83025"]
    });
    const d = res?.result_data?.device_point_list?.[0]?.device_point;
    if (!d) return [null, []];

    // Sungrow standard parameter mapping:
    // p83022 = Active Power (kW)
    // p83020 = DC Power (kW)
    // p83025 = Daily Energy (kWh)
    // p83026 = Total Energy (kWh)
    // p83027 = Temperature (°C)
    const acPowerKw = parseFloat(String(d.p83022 || d.p_active || 0));
    const dcPowerKw = parseFloat(String(d.p83020 || d.p_dc || 0));
    const dailyKwh = parseFloat(String(d.p83025 || d.e_today || 0));
    const totalKwh = parseFloat(String(d.p83026 || d.e_total || 0));
    const tempC = parseFloat(String(d.p83027 || d.temp || 35));
    const isOnline = acPowerKw > 0 || dcPowerKw > 0 || d.device_status === 1;
    const efficiency = dcPowerKw > 0 ? Math.min(100, Math.max(0, (acPowerKw / dcPowerKw) * 100)) : (isOnline ? 98.0 : 0);
    const isoTime = new Date().toISOString();

    const telemetry: NormalizedTelemetry = {
      timestamp: isoTime,
      ac_power_kw: acPowerKw,
      dc_power_kw: dcPowerKw,
      energy_kwh: totalKwh,
      efficiency_pct: efficiency,
      temperature_c: tempC,
      daily_generation_kwh: dailyKwh,
      total_generation_kwh: totalKwh,
      specific_yield: 0,
      online_status: isOnline,
      last_update: isoTime,
      frequency_hz: parseFloat(String(d.p83028 || 50.0)),
      power_factor: parseFloat(String(d.p83029 || 1.0)),
      voltage_r_v: parseFloat(String(d.p83001 || 0)) || null,
      voltage_s_v: parseFloat(String(d.p83002 || 0)) || null,
      voltage_t_v: parseFloat(String(d.p83003 || 0)) || null,
      current_r_a: parseFloat(String(d.p83004 || 0)) || null,
      current_s_a: parseFloat(String(d.p83005 || 0)) || null,
      current_t_a: parseFloat(String(d.p83006 || 0)) || null,
      metrics: d
    };

    // Extract strings
    const stringTelemetries: NormalizedStringTelemetry[] = [];
    for (let i = 1; i <= 8; i++) {
      const v = parseFloat(String(d[`p8303${i}_v`] || d[`pv${i}_voltage`] || 0));
      const c = parseFloat(String(d[`p8303${i}_i`] || d[`pv${i}_current`] || 0));
      if (v > 10.0 || c > 0.05) {
        const pKw = (v * c) / 1000.0;
        stringTelemetries.push({
          string_index: i,
          voltage_v: v,
          current_a: c,
          power_kw: pKw,
          status: pKw > 0.05 ? "normal" : "low_current",
          metrics: { string: i }
        });
      }
    }

    return [telemetry, stringTelemetries];
  }

  async fetchAlerts(plantId: string): Promise<NormalizedAlert[]> {
    type Resp = {
      result_code: string;
      result_data?: {
        faultList?: Array<Record<string, unknown>>;
      };
    };

    const res = await this.callSungrow<Resp>("/openapi/getFaultList", { ps_id: plantId });
    const list = res?.result_data?.faultList || [];
    const isoTime = new Date().toISOString();

    return list.map(item => {
      const rawCode = String(item.fault_code || item.alarm_code || "FAULT_UNKNOWN");
      const codeKey = rawCode.startsWith("FAULT_") ? rawCode : `FAULT_${rawCode}`;
      const defaultTitle = String(item.fault_name || `Sungrow Fault ${rawCode}`);
      const tr = translateAlert("sungrow", codeKey, defaultTitle);

      return {
        code: codeKey,
        title: tr.title,
        description: tr.description,
        severity: tr.severity,
        triggered_at: item.fault_time ? new Date(String(item.fault_time)).toISOString() : isoTime,
        alarm_code: rawCode,
        oem: "sungrow",
        category: tr.category,
        is_auto_resolvable: tr.is_auto_resolvable,
        requires_technician: tr.requires_technician,
        recommended_action: tr.recommended_action
      };
    });
  }
}

