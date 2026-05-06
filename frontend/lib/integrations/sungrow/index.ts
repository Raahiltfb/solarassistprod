import type { OemAdapter, NormalizedDevice, NormalizedTelemetry, NormalizedAlert } from "../types";

// Sungrow iSolarCloud OpenAPI adapter scaffold.

const API_URL = process.env.SUNGROW_API_URL || "https://gateway.isolarcloud.com.hk";
const APP_KEY = process.env.SUNGROW_APP_KEY || "";

async function callSungrow<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  if (!APP_KEY) return null;
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-key": APP_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export const sungrowAdapter: OemAdapter = {
  provider: "sungrow",
  async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    type Resp = { result_data?: { pageList?: Array<Record<string, unknown>> } };
    const r = await callSungrow<Resp>("/openapi/getDeviceList", { ps_id: plantId, device_type: 1 });
    return (r?.result_data?.pageList ?? []).map((d) => ({
      oem_device_id: String(d.ps_key ?? d.uuid ?? ""),
      model: String(d.device_model ?? "Sungrow"),
      serial_number: String(d.device_sn ?? ""),
      capacity_kw: Number(d.dev_fac_name ?? 0),
      string_count: 4,
      installed_on: new Date().toISOString().slice(0, 10),
    }));
  },
  async fetchTelemetry(deviceId: string): Promise<NormalizedTelemetry[]> {
    type Resp = { result_data?: Record<string, unknown> };
    const r = await callSungrow<Resp>("/openapi/getDeviceRealTimeData", { device_id: deviceId });
    const d = r?.result_data ?? {};
    return [{
      oem_device_id: deviceId,
      timestamp: new Date().toISOString(),
      ac_power_kw: Number(d.p83022 ?? 0),
      dc_power_kw: Number(d.p83020 ?? 0),
      energy_kwh: Number(d.p83025 ?? 0),
      efficiency_pct: 95,
      temperature_c: Number(d.p83027 ?? 35),
      status: "online",
      fault_codes: [],
    }];
  },
  async fetchAlerts(): Promise<NormalizedAlert[]> {
    return [];
  },
};
