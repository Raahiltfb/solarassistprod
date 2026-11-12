import type { OemAdapter, NormalizedDevice, NormalizedTelemetry, NormalizedAlert } from "../types";

const API_URL = process.env.ISOLARCLOUD_API_URL || "https://gateway.isolarcloud.in";
const APP_KEY = process.env.ISOLARCLOUD_APP_KEY || "B3500A80C94EADF9C52E01D7790A96DD";
const SECRET_KEY = process.env.ISOLARCLOUD_SECRET_KEY || "k2a5vg8w7qdua4nqet6rsspnrhsmr3in";

async function callSungrow<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  if (!APP_KEY) return null;
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "appkey": APP_KEY,
      "x-access-key": SECRET_KEY
    },
    body: JSON.stringify({
      appkey: APP_KEY,
      ...body
    }),
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
      oem_device_id: String(d.ps_key ?? d.uuid ?? d.device_id ?? ""),
      model: String(d.device_model ?? "Sungrow Inverter"),
      serial_number: String(d.device_sn ?? ""),
      capacity_kw: Number(d.dev_fac_name ?? d.device_power ?? 0),
      string_count: 4,
      installed_on: d.install_date ? String(d.install_date).slice(0, 10) : undefined,
    }));
  },
  async fetchTelemetry(deviceId: string): Promise<NormalizedTelemetry[]> {
    type Resp = { result_data?: Record<string, unknown> };
    const r = await callSungrow<Resp>("/openapi/getDeviceRealTimeData", { device_id: deviceId });
    const d = r?.result_data ?? {};
    const acPower = Number(d.p83022 ?? d.p_active ?? 0);
    const dcPower = Number(d.p83020 ?? d.p_dc ?? 0);
    const isOnline = acPower > 0 || dcPower > 0 || d.device_status === 1;

    return [{
      oem_device_id: deviceId,
      timestamp: new Date().toISOString(),
      ac_power_kw: acPower,
      dc_power_kw: dcPower,
      energy_kwh: Number(d.p83025 ?? d.e_today ?? 0),
      efficiency_pct: dcPower > 0 ? Math.min(100, Math.max(0, (acPower / dcPower) * 100)) : 97,
      temperature_c: Number(d.p83027 ?? d.temp ?? 35),
      status: isOnline ? "online" : "offline",
      fault_codes: [],
    }];
  },
  async fetchAlerts(): Promise<NormalizedAlert[]> {
    return [];
  },
};
