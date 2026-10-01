import { ConstraintSeverity } from "./types";

export type CleaningVisitStatus =
  | "required"
  | "unscheduled"
  | "planned"
  | "approved"
  | "published"
  | "en_route"
  | "in_progress"
  | "completed"
  | "acknowledged"
  | "cancelled"
  | "missed";

export type UnscheduledReason =
  | "team_capacity"
  | "allowed_weekday"
  | "blackout_date"
  | "scheduling_window_exceeded"
  | "no_available_team"
  | "other";

/**
 * State machine rules defining allowed status transitions for a canonical cleaning visit.
 */
export const ALLOWED_STATE_TRANSITIONS: Record<CleaningVisitStatus, CleaningVisitStatus[]> = {
  required: ["planned", "unscheduled", "cancelled"],
  unscheduled: ["planned", "required", "cancelled"],
  planned: ["approved", "published", "unscheduled", "cancelled"],
  approved: ["published", "planned", "cancelled"],
  published: ["en_route", "in_progress", "completed", "missed", "cancelled"],
  en_route: ["in_progress", "completed", "missed", "cancelled"],
  in_progress: ["completed", "missed", "cancelled"],
  completed: ["acknowledged"],
  acknowledged: [],
  cancelled: ["required", "planned"],
  missed: ["planned", "unscheduled", "cancelled"],
};

/**
 * Validates whether a state transition from currentStatus to nextStatus is allowed.
 */
export function isValidStateTransition(
  currentStatus: CleaningVisitStatus,
  nextStatus: CleaningVisitStatus
): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = ALLOWED_STATE_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

export interface CleaningVisit {
  id: string;
  org_id: string;
  site_id: string;
  plan_id: string | null;
  cycle_period: string; // Format: YYYY-MM
  visit_sequence_in_month: number;
  target_due_date: string;
  scheduled_date: string | null;
  assigned_team_id: string | null;
  assigned_technician_id: string | null;
  status: CleaningVisitStatus;
  constraint_state: ConstraintSeverity;
  constraint_notes: string | null;
  unscheduled_reason: UnscheduledReason | string | null;
  planner_rationale: string | null;
  route_id: string | null;
  route_sequence_order: number | null;
  estimated_cleaning_mins: number;
  estimated_travel_mins: number;
  estimated_distance_km: number;
  execution_log_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  updated_at: string;
}
