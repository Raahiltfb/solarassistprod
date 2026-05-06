// Unified telemetry & device data shapes that all OEM adapters MUST emit.
// This decouples raw OEM payloads from the application data model.

export interface NormalizedDevice {
  oem_device_id: string;
  model: string;
  serial_number: string;
  capacity_kw: number;
  string_count: number;
  installed_on: string;
}

export interface NormalizedTelemetry {
  oem_device_id: string;
  timestamp: string;       // ISO 8601 UTC
  ac_power_kw: number;
  dc_power_kw: number;
  energy_kwh: number;      // cumulative day-energy
  efficiency_pct: number;  // 0-100
  temperature_c: number;
  status: "online" | "offline" | "fault" | "standby";
  fault_codes: string[];
}

export interface NormalizedAlert {
  oem_device_id: string;
  code: string;
  title: string;
  description?: string;
  severity: "low" | "medium" | "high" | "critical";
  triggered_at: string;
}

export interface OemAdapter {
  provider: "solis" | "growatt" | "sungrow";
  listDevices(plantId: string): Promise<NormalizedDevice[]>;
  fetchTelemetry(deviceId: string, opts?: { fromIso?: string; toIso?: string }): Promise<NormalizedTelemetry[]>;
  fetchAlerts(deviceId: string): Promise<NormalizedAlert[]>;
}
