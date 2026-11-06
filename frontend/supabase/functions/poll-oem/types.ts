export interface NormalizedStation {
  plant_id: string;
  name: string;
  capacity_kwp: number;
  location: string;
  timezone: string;
  commissioned_on?: string | null;
}

export interface NormalizedDevice {
  oem_device_id: string;
  model: string;
  serial_number: string;
  capacity_kw: number;
  string_count: number;
  status: string;
  last_seen_at: string;
  installed_on?: string | null;
  modules_count?: number | null;
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
  frequency_hz?: number | null;
  reactive_power_kvar?: number | null;
  power_factor?: number | null;
  current_r_a?: number | null;
  current_s_a?: number | null;
  current_t_a?: number | null;
  voltage_r_v?: number | null;
  voltage_s_v?: number | null;
  voltage_t_v?: number | null;
  apparent_power_kva?: number | null;
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
  metrics?: Record<string, any>;
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

export interface OemAdapter {
  listStations(): Promise<NormalizedStation[]>;
  listDevices(plantId: string): Promise<NormalizedDevice[]>;
  fetchTelemetry(deviceId: string): Promise<[NormalizedTelemetry | null, NormalizedStringTelemetry[]]>;
  fetchAlerts(plantId: string): Promise<NormalizedAlert[] | null>;
}
