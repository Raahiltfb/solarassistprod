import type { OemAdapter, NormalizedDevice, NormalizedTelemetry, NormalizedAlert } from "../types";

// Growatt OpenAPI adapter scaffold. Activates when GROWATT credentials are provided.
// Docs: https://www.showdoc.com.cn/262556420217021/1494053950115877

const API_URL = process.env.GROWATT_API_URL || "https://server-api.growatt.com";
const TOKEN = process.env.GROWATT_TOKEN || "";

async function callGrowatt<T>(path: string): Promise<T | null> {
  if (!TOKEN) return null;
  const res = await fetch(`${API_URL}${path}`, { headers: { token: TOKEN } });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export const growattAdapter: OemAdapter = {
  provider: "growatt",
  async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    type Resp = { data?: { inverters?: Array<Record<string, unknown>> } };
    const r = await callGrowatt<Resp>(`/v1/device/list?plant_id=${plantId}`);
    return (r?.data?.inverters ?? []).map((d) => ({
      oem_device_id: String(d.device_sn ?? ""),
      model: String(d.model ?? "Growatt"),
      serial_number: String(d.device_sn ?? ""),
      capacity_kw: Number(d.nominal_power ?? 0) / 1000,
      string_count: Number(d.string_num ?? 4),
      installed_on: new Date().toISOString().slice(0, 10),
    }));
  },
  async fetchTelemetry(deviceId: string): Promise<NormalizedTelemetry[]> {
    type Resp = { data?: Record<string, unknown> };
    const r = await callGrowatt<Resp>(`/v1/device/inverter/data?device_sn=${deviceId}`);
    const d = r?.data ?? {};
    return [{
      oem_device_id: deviceId,
      timestamp: new Date().toISOString(),
      ac_power_kw: Number(d.pac ?? 0) / 1000,
      dc_power_kw: Number(d.ppv ?? 0) / 1000,
      energy_kwh: Number(d.eToday ?? 0),
      efficiency_pct: 95,
      temperature_c: Number(d.temperature ?? 35),
      status: d.status === 1 ? "online" : "offline",
      fault_codes: [],
    }];
  },
  async fetchAlerts(): Promise<NormalizedAlert[]> {
    return [];
  },
};
