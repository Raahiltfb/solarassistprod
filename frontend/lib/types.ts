// Shared TypeScript types mirroring the Supabase schema.

export type Role = "super_admin" | "epc_admin" | "technician" | "client";

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type TicketStatus = "open" | "in_progress" | "on_hold" | "resolved" | "closed";
export type TicketPriority = "p1" | "p2" | "p3" | "p4";
export type OemProvider = "solis" | "growatt" | "sungrow";
export type InverterStatus = "online" | "offline" | "fault" | "standby";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string | null;
  email: string;
  full_name: string;
  role: Role;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Site {
  id: string;
  org_id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  capacity_kwp: number;
  commissioned_on: string;
  cleaning_cycle_days: number;
  last_cleaned_on: string | null;
  client_id: string | null;
  status: "active" | "inactive" | "commissioning";
  timezone: string;
  created_at: string;
}

export interface Inverter {
  id: string;
  site_id: string;
  oem: OemProvider;
  oem_device_id: string;
  model: string;
  serial_number: string;
  capacity_kw: number;
  string_count: number;
  status: InverterStatus;
  last_seen_at: string | null;
  installed_on: string;
}

export interface StringEntity {
  id: string;
  inverter_id: string;
  string_index: number;
  modules_count: number;
  capacity_kw: number;
  status: "ok" | "underperforming" | "fault";
}

export interface Telemetry {
  id: string;
  inverter_id: string;
  timestamp: string;
  ac_power_kw: number;
  dc_power_kw: number;
  energy_kwh: number;
  efficiency_pct: number;
  temperature_c: number;
}

export interface Alert {
  id: string;
  org_id: string;
  site_id: string;
  inverter_id: string | null;
  code: string;
  title: string;
  description: string | null;
  severity: AlertSeverity;
  status: AlertStatus;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
}

export interface Ticket {
  id: string;
  org_id: string;
  site_id: string;
  alert_id: string | null;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignee_id: string | null;
  created_by: string | null;
  sla_due_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CleaningLog {
  id: string;
  site_id: string;
  performed_by: string | null;
  performed_at: string;
  next_due_on: string | null;
  remarks: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
}

export interface MaintenanceRemark {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface OemIntegration {
  id: string;
  org_id: string;
  provider: OemProvider;
  config: Record<string, unknown>;
  is_active: boolean;
  last_sync_at: string | null;
}
