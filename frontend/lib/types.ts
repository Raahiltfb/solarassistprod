// Shared TypeScript types mirroring the Supabase schema.

export type Role = "super_admin" | "epc_admin" | "technician" | "client";

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type TicketStatus = "open" | "in_progress" | "on_hold" | "resolved" | "closed";
export type TicketPriority = "p1" | "p2" | "p3" | "p4";
export type OemProvider = "solis" | "growatt" | "sungrow";
export type InverterStatus = "online" | "offline" | "fault" | "standby";

export type WorkOrderType = "cleaning" | "maintenance" | "inspection" | "alarm_investigation";
export type WorkOrderStatus = "draft" | "scheduled" | "en_route" | "in_progress" | "completed" | "cancelled";
export type RouteStatus = "draft" | "optimized" | "published" | "completed";
export type NotificationChannel = "email" | "sms";
export type NotificationStatus = "pending" | "sent" | "failed" | "cancelled";

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
  base_latitude?: number | null;
  base_longitude?: number | null;
  base_address?: string | null;
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
  next_cleaning_date: string | null;
  cleaning_schedule_type: "suggested" | "manual" | "approved" | null;
  cleaning_schedule_notes: string | null;
  client_id: string | null;
  client_org_id: string | null;
  grid_tariff_inr_per_kwh: number | null;
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

export type ActionDecisionClass =
  | "MONITOR"
  | "NOTIFY"
  | "INVESTIGATE"
  | "SCHEDULE"
  | "DISPATCH_IMMEDIATELY"
  | "ESCALATE";

export interface DecisionResult {
  decision_class: ActionDecisionClass;
  confidence_pct: number;
  reasoning: string;
  affected_capacity_kwp?: number;
  recurrence_count_7d?: number;
  recommended_technician_id?: string | null;
  recommended_technician_name?: string | null;
  automated_ticket_created: boolean;
  automated_job_created: boolean;
  automated_job_id?: string | null;
  admin_override_required: boolean;
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
  requires_technician?: boolean | null;
  ticket_id?: string | null;
  alarm_code?: string | null;
  oem?: string | null;
  category?: string | null;
  is_auto_resolvable?: boolean | null;
  recommended_action?: string | null;
  action_decision_class?: ActionDecisionClass | null;
  decision_confidence_pct?: number | null;
  decision_reasoning?: string | null;
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
  action_decision_class?: ActionDecisionClass | null;
  decision_confidence_pct?: number | null;
  decision_reasoning?: string | null;
}

export interface WorkOrder {
  id: string;
  org_id: string;
  site_id: string;
  ticket_id?: string | null;
  technician_id?: string | null;
  created_by?: string | null;
  title: string;
  description?: string | null;
  type: WorkOrderType;
  status: WorkOrderStatus;
  scheduled_date?: string | null;
  estimated_duration_mins: number;
  check_in_at?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
  completed_at?: string | null;
  client_acknowledged_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyRoute {
  id: string;
  org_id: string;
  technician_id: string;
  date: string;
  status: RouteStatus;
  start_location_lat?: number | null;
  start_location_lng?: number | null;
  total_distance_km: number;
  total_travel_mins: number;
  created_at: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  work_order_id: string;
  sequence_order: number;
  estimated_arrival?: string | null;
  travel_time_mins: number;
  distance_km: number;
  created_at: string;
}

export interface WorkOrderNotification {
  id: string;
  org_id: string;
  work_order_id: string;
  recipient_id?: string | null;
  recipient_email: string;
  channel: NotificationChannel;
  event_type: string;
  status: NotificationStatus;
  scheduled_for: string;
  sent_at?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface CleaningLog {
  id: string;
  site_id: string;
  work_order_id?: string | null;
  performed_by: string | null;
  performed_at: string;
  next_due_on: string | null;
  remarks: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  safety_photo_url: string | null;
  damage_observed: boolean;
  damage_type: string | null;
  damage_photo_url: string | null;
  client_acknowledged_at?: string | null;
  client_acknowledged_damage?: boolean | null;
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

export type PlanStatus = "draft" | "review" | "approved" | "published" | "completed";
export type ConstraintSeverity = "valid" | "warning" | "blocking";

export interface TechnicianTeam {
  id: string;
  org_id: string;
  name: string;
  base_latitude?: number | null;
  base_longitude?: number | null;
  base_address?: string | null;
  color_code?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TechnicianTeamMember {
  id: string;
  team_id: string;
  technician_id: string;
  created_at: string;
  profiles?: Profile | null;
}

export const DEFAULT_SYSTEM_CLEANING_POLICY = {
  normal_interval_days: 15,
  monsoon_interval_days: 30,
  monsoon_start_md: "06-01",
  monsoon_end_md: "09-30",
  allowed_weekdays: [1, 2, 3, 4, 5],
  estimated_cleaning_mins: 90,
};

export interface SiteCleaningRule {
  id: string;
  site_id: string;
  is_configured: boolean;
  is_override?: boolean;
  normal_interval_days: number | null;
  monsoon_interval_days: number | null;
  monsoon_start_md: string | null;
  monsoon_end_md: string | null;
  allowed_weekdays: number[] | null;
  blackout_dates: string[] | null;
  estimated_cleaning_mins: number;
  created_at: string;
  updated_at: string;
}

export interface CleaningPlan {
  id: string;
  org_id: string;
  year: number;
  month: number;
  status: PlanStatus;
  planning_capacity_mins: number;
  scheduling_tolerance_days: number;
  notes?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CleaningPlanAssignment {
  id: string;
  plan_id: string;
  site_id: string;
  team_id: string;
  target_date: string;
  scheduled_date: string;
  sequence_order: number;
  estimated_cleaning_mins: number;
  estimated_travel_mins: number;
  estimated_distance_km: number;
  constraint_state: ConstraintSeverity;
  constraint_notes?: string | null;
  scheduler_rationale?: string | null;
  created_at: string;
  updated_at: string;
  sites?: Site | null;
  technician_teams?: TechnicianTeam | null;
}

export type { CleaningVisitStatus, CleaningVisit, UnscheduledReason } from "./cleaning-domain";



