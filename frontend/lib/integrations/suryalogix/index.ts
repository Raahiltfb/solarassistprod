import type { OemAdapter, NormalizedDevice, NormalizedTelemetry, NormalizedAlert } from "../types";

const API_URL = process.env.SURYALOGIX_API_URL || "https://cloud.suryalog.ae/api/get_datalog_v7.php";
const SECRET = process.env.SURYALOGIX_SECRET || "cd8ae85e44e2ca7d997904893f8fb7fe";

export const suryalogixAdapter: OemAdapter = {
  provider: "suryalogix",
  async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    const now = Math.floor(Date.now() / 1000);
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: SECRET,
        plant: plantId,
        format: "std",
        for: "data",
        stime: String(now - 7200),
        etime: String(now),
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json.result !== 0 || !json.data) return [];

    const timestamps = Object.keys(json.data).sort();
    if (timestamps.length === 0) return [];
    const latestTs = timestamps[timestamps.length - 1];
    const inverters = json.data[latestTs]?.inverter || {};

    return Object.entries<any>(inverters).map(([invId, inv]) => ({
      oem_device_id: `${plantId}#${invId}`,
      model: String(inv.inverter_type || invId),
      serial_number: String(inv.SL_NO || `${plantId}_${invId}`),
      capacity_kw: Number(inv.AC_CAP || 50),
      string_count: 4,
      installed_on: "2024-01-01",
    }));
  },
  async fetchTelemetry(deviceId: string): Promise<NormalizedTelemetry[]> {
    const parts = deviceId.split("#");
    const plantId = parts[0];
    const invId = parts[1] || "I1";
    const now = Math.floor(Date.now() / 1000);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: SECRET,
        plant: plantId,
        format: "std",
        for: "data",
        stime: String(now - 7200),
        etime: String(now),
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json.result !== 0 || !json.data) return [];

    const timestamps = Object.keys(json.data).sort();
    if (timestamps.length === 0) return [];
    const latestTs = timestamps[timestamps.length - 1];
    const inv = json.data[latestTs]?.inverter?.[invId];
    if (!inv) return [];

    const acPower = (Number(inv.WT) || 0) / 1000.0;
    const dcPower = (Number(inv.DC_W) || 0) / 1000.0;
    const isOnline = inv.inverter_status === 4 || acPower > 0 || dcPower > 0;

    return [{
      oem_device_id: deviceId,
      timestamp: new Date(parseInt(latestTs, 10) * 1000).toISOString(),
      ac_power_kw: acPower,
      dc_power_kw: dcPower,
      energy_kwh: Number(inv.KWH_Day || 0),
      efficiency_pct: dcPower > 0 ? Math.min(100, Math.max(0, (acPower / dcPower) * 100)) : 97,
      temperature_c: Number(inv.TEMP_HS || inv.TEMP_INT || 35),
      status: isOnline ? "online" : (inv.inverter_status === 5 ? "fault" : "offline"),
      fault_codes: [],
    }];
  },
  async fetchAlerts(): Promise<NormalizedAlert[]> {
    return [];
  },
};

