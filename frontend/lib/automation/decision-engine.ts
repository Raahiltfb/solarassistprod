import { ActionDecisionClass, DecisionResult, Alert, Site, Profile } from "@/lib/types";
import { getAlarmIntelligence } from "./alarm-intelligence";

/**
 * Calculates straight-line distance in km between two lat/lng coordinates.
 */
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the optimal technician for a site location, balancing open job workload and proximity.
 */
export function findNearestTechnician(
  siteLat: number,
  siteLng: number,
  technicians: Profile[],
  techWorkloads?: Record<string, number>
): { technician: Profile; distanceKm: number } | null {
  if (!technicians || technicians.length === 0) return null;

  let bestTech: Profile | null = null;
  let minScore = Infinity;
  let bestDist = Infinity;

  const MAX_ACTIVE_JOBS = 3;

  for (const tech of technicians) {
    const techLat = tech.base_latitude ?? 19.076; // Default to Mumbai lat if missing
    const techLng = tech.base_longitude ?? 72.877; // Default to Mumbai lng if missing

    const dist = haversineDistanceKm(siteLat, siteLng, techLat, techLng);
    const activeJobs = techWorkloads?.[tech.id] || 0;

    // Filter out overloaded technicians if possible (but we still need someone if all are busy)
    if (activeJobs >= MAX_ACTIVE_JOBS) {
      continue;
    }

    // Workload-balanced score: 50km equivalent penalty per active open job
    // Add random jitter (0 to 1 km) to break ties randomly instead of picking the first one
    const randomJitter = Math.random();
    const compositeScore = (activeJobs * 50) + dist + randomJitter;

    if (compositeScore < minScore) {
      minScore = compositeScore;
      bestTech = tech;
      bestDist = dist;
    }
  }

  // If everyone is at capacity, fall back to the absolute nearest regardless of workload
  if (!bestTech) {
    for (const tech of technicians) {
      const techLat = tech.base_latitude ?? 19.076;
      const techLng = tech.base_longitude ?? 72.877;
      const dist = haversineDistanceKm(siteLat, siteLng, techLat, techLng);
      
      const randomJitter = Math.random();
      const compositeScore = dist + randomJitter; // Purely distance + jitter

      if (compositeScore < minScore) {
        minScore = compositeScore;
        bestTech = tech;
        bestDist = dist;
      }
    }
  }

  return bestTech ? { technician: bestTech, distanceKm: bestDist } : null;
}

export interface EvaluationInput {
  alert: Alert;
  site?: Site | null;
  recentAlertsCount?: number;
  availableTechnicians?: Profile[];
  techWorkloads?: Record<string, number>;
}

/**
 * Core Action Decision Engine logic:
 * Evaluates an incoming Alert and determines the operational classification,
 * confidence score, reasoning, and recommended technician dispatch.
 */
export function evaluateActionDecision({
  alert,
  site,
  recentAlertsCount = 0,
  availableTechnicians = [],
  techWorkloads = {},
}: EvaluationInput): DecisionResult {
  const alarmCode = alert.alarm_code || alert.code;
  const intel = getAlarmIntelligence(alarmCode, alert.oem || "solis");
  const codeUpper = alarmCode.toUpperCase();
  const titleUpper = (alert.title || "").toUpperCase();
  const affectedCapacityKwp = site?.capacity_kwp ?? 100;

  // 1. Check RECURRENCE Threshold (3+ occurrences in last 7 days -> ESCALATE)
  if (recentAlertsCount >= 3) {
    return {
      decision_class: "ESCALATE",
      confidence_pct: 95,
      reasoning: `Recurring fault detected (${recentAlertsCount} occurrences in 7 days). Automated repair attempt failed or persistent hardware defect suspected. Mandatory senior engineering review required.`,
      affected_capacity_kwp: affectedCapacityKwp,
      recurrence_count_7d: recentAlertsCount,
      automated_ticket_created: true,
      automated_job_created: true,
      admin_override_required: true,
    };
  }

  // 2. Check NOTIFY Classification (External Grid Outage / Grid Down)
  if (
    codeUpper.includes("GRID") ||
    titleUpper.includes("GRID OUTAGE") ||
    titleUpper.includes("GRID FAULT") ||
    codeUpper.includes("NO-GRID")
  ) {
    return {
      decision_class: "NOTIFY",
      confidence_pct: 90,
      reasoning: `External grid outage detected on ${site?.name || "site"}. No physical technician visit required. Client and operations notified of grid downtime.`,
      affected_capacity_kwp: affectedCapacityKwp,
      recurrence_count_7d: recentAlertsCount,
      automated_ticket_created: false,
      automated_job_created: false,
      admin_override_required: false,
    };
  }

  // 3. Check MONITOR Classification (Low severity, transient blip, or requires_technician = false)
  if (
    alert.requires_technician === false ||
    (alert.severity === "low" && !intel?.requires_technician)
  ) {
    return {
      decision_class: "MONITOR",
      confidence_pct: 85,
      reasoning: `Transient non-critical telemetry anomaly (${alarmCode}). System monitoring for persistence; no immediate field intervention required.`,
      affected_capacity_kwp: affectedCapacityKwp,
      recurrence_count_7d: recentAlertsCount,
      automated_ticket_created: false,
      automated_job_created: false,
      admin_override_required: false,
    };
  }

  // Find optimal technician for dispatch / schedule (balancing workload + proximity)
  let nearestMatch: { technician: Profile; distanceKm: number } | null = null;
  if (site && availableTechnicians.length > 0) {
    nearestMatch = findNearestTechnician(
      site.latitude || 19.076,
      site.longitude || 72.877,
      availableTechnicians,
      techWorkloads
    );
  }

  // 4. Check DISPATCH_IMMEDIATELY Classification (Critical severity / shutdown / isolation fault)
  if (alert.severity === "critical" || titleUpper.includes("SHUTDOWN") || codeUpper.includes("ISO")) {
    const techName = nearestMatch?.technician.full_name || "Nearest Field Tech";
    const distStr = nearestMatch ? ` (~${nearestMatch.distanceKm.toFixed(1)} km away)` : "";

    return {
      decision_class: "DISPATCH_IMMEDIATELY",
      confidence_pct: 95,
      reasoning: `Critical plant outage/fault (${alarmCode}: ${alert.title}). Pre-authorized urgent dispatch created. Assigned to ${techName}${distStr} to prevent active generation loss (${affectedCapacityKwp} kWp risk).`,
      affected_capacity_kwp: affectedCapacityKwp,
      recurrence_count_7d: recentAlertsCount,
      recommended_technician_id: nearestMatch?.technician.id || null,
      recommended_technician_name: nearestMatch?.technician.full_name || null,
      automated_ticket_created: true,
      automated_job_created: true,
      admin_override_required: false,
    };
  }

  // 5. Check SCHEDULE Classification (High severity / string underperformance / maintenance)
  if (alert.severity === "high" || titleUpper.includes("STRING") || titleUpper.includes("UNDERPERFORM")) {
    const techName = nearestMatch?.technician.full_name || "Assigned Field Tech";

    return {
      decision_class: "SCHEDULE",
      confidence_pct: 85,
      reasoning: `Performance degradation detected (${alarmCode}). Non-urgent physical inspection scheduled in daily routing window. Recommended tech: ${techName}.`,
      affected_capacity_kwp: affectedCapacityKwp,
      recurrence_count_7d: recentAlertsCount,
      recommended_technician_id: nearestMatch?.technician.id || null,
      recommended_technician_name: nearestMatch?.technician.full_name || null,
      automated_ticket_created: true,
      automated_job_created: true,
      admin_override_required: false,
    };
  }

  // 6. Default to INVESTIGATE Classification (Medium severity or ambiguous telemetry)
  return {
    decision_class: "INVESTIGATE",
    confidence_pct: 70,
    reasoning: `Operational alert (${alarmCode}) requires human analysis. Ticket created and queued for admin review before technician dispatch.`,
    affected_capacity_kwp: affectedCapacityKwp,
    recurrence_count_7d: recentAlertsCount,
    automated_ticket_created: true,
    automated_job_created: false,
    admin_override_required: true,
  };
}
