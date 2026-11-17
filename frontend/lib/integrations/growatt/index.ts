import type { OemAdapter, NormalizedDevice, NormalizedTelemetry, NormalizedAlert } from "../types";
import { getAlarmIntelligence } from "../../automation/alarm-intelligence";

// Growatt OpenAPI v1 production adapter.
// Base URL: https://openapi.growatt.com/v1

const API_URL = process.env.GROWATT_API_URL || "https://openapi.growatt.com/v1";
const TOKEN = process.env.GROWATT_TOKEN || "0vlcyi6371401rzl2nfy322i2iz6fb05";

function parseGrowattIstTimestamp(rawTime?: string | null): string {
  if (!rawTime) return new Date().toISOString();
  const trimmed = String(rawTime).trim();
  const isoCandidate = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withTz =
    isoCandidate.endsWith("Z") || isoCandidate.includes("+") || isoCandidate.slice(10).includes("-")
      ? isoCandidate
      : `${isoCandidate}+05:30`;
  const parsed = new Date(withTz);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function decodeGrowattCapacityKw(modelCode: string, fallbackKw = 15): number {
  const m = String(modelCode || "").match(/M([0-9A-Fa-f]{4})$/);
  if (m) {
    const val = parseInt(m[1], 16) / 10;
    if (val > 0 && val <= 500) return val;
  }
  return fallbackKw;
}

function formatGrowattModelName(modelCode: string, capacityKw: number): string {
  if (!modelCode) return `Growatt ${capacityKw}KTL3-X`;
  const series = capacityKw >= 20 ? "MID" : "MOD";
  const capLabel = capacityKw >= 10 ? `${capacityKw}KTL3-X` : `${capacityKw * 1000}TL3-X`;
  return `Growatt ${series} ${capLabel}`;
}

async function callGrowatt<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>
): Promise<T | null> {
  if (!TOKEN) return null;
  const baseUrl = API_URL.replace(/\/$/, "");
  const fullUrl = path.startsWith("/v1/")
    ? `${baseUrl.replace(/\/v1$/, "")}${path}`
    : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const headers: Record<string, string> = { token: TOKEN };
    const opts: RequestInit = { method, headers };
    if (method === "POST" && body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = new URLSearchParams(body).toString();
    }
    const res = await fetch(fullUrl, opts);
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    if (json?.error_code === 10012 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      continue;
    }
    return json as T;
  }
  return null;
}

export const growattAdapter: OemAdapter = {
  provider: "growatt",

  async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    type Resp = {
      error_code?: number;
      data?: {
        devices?: Array<Record<string, unknown>>;
        inverters?: Array<Record<string, unknown>>;
      };
    };
    const r = await callGrowatt<Resp>(`/device/list?plant_id=${plantId}`);
    const rawList = r?.data?.devices ?? r?.data?.inverters ?? [];
    const seen = new Set<string>();
    const devices: NormalizedDevice[] = [];

    for (const d of rawList) {
      const sn = String(d.device_sn ?? "").trim();
      if (!sn || seen.has(sn)) continue;
      seen.add(sn);

      const rawModel = String(d.model ?? "");
      const capKw =
        d.nominal_power && Number(d.nominal_power) > 0
          ? Number(d.nominal_power) / 1000
          : decodeGrowattCapacityKw(rawModel, 15);
      const stringCount = capKw >= 30 ? 3 : capKw === 8 ? 1 : 2;

      devices.push({
        oem_device_id: sn,
        model: formatGrowattModelName(rawModel, capKw),
        serial_number: sn,
        capacity_kw: capKw,
        string_count: Number(d.string_num ?? stringCount),
        installed_on:
          d.create_date || d.install_date
            ? String(d.create_date || d.install_date).slice(0, 10)
            : undefined,
      });
    }

    return devices;
  },

  async fetchTelemetry(
    deviceId: string,
    opts?: { fromIso?: string; toIso?: string }
  ): Promise<NormalizedTelemetry[]> {
    if (opts?.fromIso && opts?.toIso) {
      type HistResp = {
        error_code?: number;
        data?: { datas?: Array<Record<string, unknown>> };
      };
      const startDate = opts.fromIso.slice(0, 10);
      const endDate = opts.toIso.slice(0, 10);
      const r = await callGrowatt<HistResp>(
        `/device/inverter/data?device_sn=${deviceId}&start_date=${startDate}&end_date=${endDate}&page=1&perpage=100`
      );
      const rows = r?.data?.datas ?? [];
      return rows.map((d) => {
        const acKw = Number(d.pac ?? d.power ?? 0) / 1000;
        const dcKw = Number(d.ppv ?? 0) / 1000;
        const eff = dcKw > 0.05 ? Math.min(99.5, Math.max(0, (acKw / dcKw) * 100)) : 98.0;
        const faultCodes: string[] = [];
        if (Number(d.faultType || 0) > 0) faultCodes.push(String(d.faultType));
        if (Number(d.faultCode1 || 0) > 0) faultCodes.push(String(d.faultCode1));
        if (Number(d.warnCode || 0) > 0) faultCodes.push(`WARN_${d.warnCode}`);

        return {
          oem_device_id: deviceId,
          timestamp: parseGrowattIstTimestamp(String(d.time ?? "")),
          ac_power_kw: Math.round(acKw * 1000) / 1000,
          dc_power_kw: Math.round(dcKw * 1000) / 1000,
          energy_kwh: Number(d.today_energy ?? d.eacToday ?? d.powerToday ?? 0),
          efficiency_pct: Math.round(eff * 100) / 100,
          temperature_c: Number(d.temperature ?? d.temperature2 ?? 35),
          status:
            d.status === 3 || faultCodes.length > 0
              ? "fault"
              : d.status === 1
                ? "online"
                : d.status === 0
                  ? "standby"
                  : "offline",
          fault_codes: faultCodes,
        };
      });
    }

    type LiveResp = { error_code?: number; data?: Record<string, unknown> };
    const r = await callGrowatt<LiveResp>(`/device/inverter/last_new_data?device_sn=${deviceId}`);
    const d = r?.data ?? {};
    const tsIso = parseGrowattIstTimestamp(d.time ? String(d.time) : null);
    const diffMins = (Date.now() - new Date(tsIso).getTime()) / (1000 * 60);
    const isFresh = diffMins <= 120;
    const isSameDay = d.time
      ? String(d.time).slice(0, 10) ===
        new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
      : false;

    const acKw = isFresh ? Number(d.pac ?? 0) / 1000 : 0;
    const dcKw = isFresh ? Number(d.ppv ?? 0) / 1000 : 0;
    const energyToday = isSameDay ? Number(d.powerToday ?? d.today_energy ?? 0) : 0;
    const eff = dcKw > 0.05 ? Math.min(99.5, Math.max(0, (acKw / dcKw) * 100)) : 98.0;

    const faultCodes: string[] = [];
    if (isFresh) {
      if (Number(d.faultType || 0) > 0) faultCodes.push(String(d.faultType));
      if (Number(d.faultCode1 || 0) > 0) faultCodes.push(String(d.faultCode1));
      if (Number(d.warnCode || 0) > 0) faultCodes.push(`WARN_${d.warnCode}`);
    }

    let status: "online" | "offline" | "fault" | "standby" = "offline";
    if (!isFresh || d.status === -1) {
      status = "offline";
    } else if (d.status === 3 || faultCodes.length > 0) {
      status = "fault";
    } else if (d.status === 1 || acKw > 0.05) {
      status = "online";
    } else {
      status = "standby";
    }

    return [
      {
        oem_device_id: deviceId,
        timestamp: tsIso,
        ac_power_kw: Math.round(acKw * 1000) / 1000,
        dc_power_kw: Math.round(dcKw * 1000) / 1000,
        energy_kwh: Math.round(energyToday * 100) / 100,
        efficiency_pct: Math.round(eff * 100) / 100,
        temperature_c: Number(d.temperature ?? 35),
        status,
        fault_codes: faultCodes,
      },
    ];
  },

  async fetchAlerts(deviceId: string): Promise<NormalizedAlert[]> {
    type AlarmResp = {
      error_code?: number;
      data?: {
        alarms?: Array<{
          alarm_code?: number | string;
          alarm_message?: string;
          start_time?: string;
          end_time?: string;
          fault_type?: string;
          status?: number;
        }>;
      };
    };
    const todayIst = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const r = await callGrowatt<AlarmResp>(
      `/device/inverter/alarm?device_sn=${deviceId}&date=${todayIst}&page=1&perpage=100`
    );
    const alarms = r?.data?.alarms ?? [];
    return alarms.map((a) => {
      const rawCode = String(a.alarm_code ?? "UNKNOWN");
      const intel = getAlarmIntelligence(rawCode, "growatt");
      return {
        oem_device_id: deviceId,
        code: intel.code || rawCode,
        title: intel.title || a.alarm_message || `Growatt Alarm ${rawCode}`,
        description: `${intel.description}${a.alarm_message ? ` (OEM: ${a.alarm_message})` : ""}`,
        severity: intel.severity,
        triggered_at: parseGrowattIstTimestamp(a.start_time),
      };
    });
  },
};
