/**
 * Deterministic, explainable Health Score calculation for Client Portal.
 * 
 * Formula:
 *   Score = Inverter Availability (Max 40) + Operational Incidents (Max 35) + Maintenance Routine (Max 25)
 *   Clamped strictly between 0 and 100.
 * 
 * Integrates directly with Phase 6 Verification Engine states:
 *   - Under Verification: Minimal provisional impact while telemetry confirms recovery
 *   - Verified Recovered: Zero penalty, positive confirmation
 *   - Verification Failed / Reopened: Flagged for follow-up
 */

export interface HealthFactor {
  category: "Inverter Availability" | "Operational Incidents" | "Preventive Maintenance";
  score: number;
  maxScore: number;
  status: "optimal" | "warning" | "critical";
  detail: string;
}

export interface SystemHealthResult {
  score: number; // 0 to 100
  status: "NORMAL" | "ATTENTION" | "SERVICE_ACTIVE";
  label: string;
  summary: string;
  breakdown: {
    inverterScore: number;
    inverterPenalty: number;
    incidentScore: number;
    incidentPenalty: number;
    alertPenalty: number; // Backwards-compatibility
    cleaningScore: number;
    cleaningPenalty: number;
    factors: HealthFactor[];
  };
}

export function calculateClientHealthScore(params: {
  inverters: Array<{ id?: string; status?: string; last_seen_at?: string; serial_number?: string }>;
  alerts: Array<{ id: string; site_id: string; inverter_id?: string | null; code: string; severity?: string; status?: string }>;
  sites: Array<{ cleaning_cycle_days: number; last_cleaned_on?: string | null; name?: string }>;
  tickets?: Array<{
    id: string;
    site_id: string;
    status: string;
    priority?: string;
    verification_status?: string | null;
    reopened_count?: number | null;
  }>;
  latestTelemetryTimestampMap?: Map<string, string>;
}): SystemHealthResult {
  const { inverters, alerts, sites, tickets = [], latestTelemetryTimestampMap } = params;

  const factors: HealthFactor[] = [];

  // 1. Inverter Connectivity & Health (Max 40 points)
  let offlineOrFaultCount = 0;
  for (const inv of inverters) {
    const lastSeenStr = (inv as any).last_seen_at || latestTelemetryTimestampMap?.get((inv as any).id);
    let isStale = false;
    if (lastSeenStr) {
      const diffMins = (Date.now() - new Date(lastSeenStr).getTime()) / (1000 * 60);
      if (diffMins > 30) isStale = true;
    } else {
      isStale = true;
    }

    const st = inv.status?.toLowerCase();
    if (isStale || st === "offline" || st === "fault") {
      offlineOrFaultCount++;
    }
  }

  const totalInverters = inverters.length;
  const inverterPenalty = totalInverters > 0 
    ? Math.min(40, Math.round(40 * (offlineOrFaultCount / totalInverters)))
    : 0;
  const inverterScore = 40 - inverterPenalty;

  factors.push({
    category: "Inverter Availability",
    score: inverterScore,
    maxScore: 40,
    status: inverterPenalty === 0 ? "optimal" : inverterPenalty <= 15 ? "warning" : "critical",
    detail: totalInverters === 0
      ? "No inverters configured"
      : offlineOrFaultCount === 0
        ? `All ${totalInverters} solar inverters are online and actively generating power.`
        : `${offlineOrFaultCount} of ${totalInverters} inverters require communication or status inspection.`,
  });

  // 2. Incident & Verification Lifecycle (Max 35 points)
  // Deduplicate open alerts by site + inverter + code
  const openAlerts = alerts.filter((a) => !a.status || a.status === "open");
  const uniqueIssues = new Map<string, { severity: string; site_id: string; inverter_id?: string | null }>();
  for (const a of openAlerts) {
    const issueKey = `${a.site_id}:${a.inverter_id || "site"}:${a.code}`;
    const current = uniqueIssues.get(issueKey);
    if (!current || a.severity === "critical" || (a.severity === "high" && current.severity !== "critical")) {
      uniqueIssues.set(issueKey, { severity: a.severity || "medium", site_id: a.site_id, inverter_id: a.inverter_id });
    }
  }

  // Account for Phase 6 tickets verification states
  const activeTickets = tickets.filter((t) => t.status !== "closed");
  let underVerificationCount = 0;
  let reopenedCount = 0;
  for (const t of activeTickets) {
    if (t.verification_status === "under_verification") {
      underVerificationCount++;
    } else if (t.verification_status === "verification_failed" || (t.reopened_count && t.reopened_count > 0)) {
      reopenedCount++;
    }
  }

  let incidentPenalty = 0;
  for (const issue of Array.from(uniqueIssues.values())) {
    if (issue.severity === "critical" || issue.severity === "high") {
      incidentPenalty += 15;
    } else {
      incidentPenalty += 5;
    }
  }

  // Add penalty for reopened/failed verification items
  if (reopenedCount > 0) {
    incidentPenalty += Math.min(15, reopenedCount * 10);
  }

  // If items are under active verification, apply small provisional adjustment (5 pts max)
  if (underVerificationCount > 0 && incidentPenalty === 0) {
    incidentPenalty += Math.min(5, underVerificationCount * 3);
  }

  incidentPenalty = Math.min(35, incidentPenalty);
  const incidentScore = 35 - incidentPenalty;

  let incidentDetail = "No active operational incidents or alarms.";
  if (reopenedCount > 0) {
    incidentDetail = `${reopenedCount} issue(s) reopened for follow-up investigation after telemetry verification.`;
  } else if (underVerificationCount > 0) {
    incidentDetail = `Technician completed physical work; ${underVerificationCount} item(s) under active telemetry verification.`;
  } else if (uniqueIssues.size > 0) {
    incidentDetail = `${uniqueIssues.size} operational item(s) currently being monitored or resolved by SolarAssist.`;
  }

  factors.push({
    category: "Operational Incidents",
    score: incidentScore,
    maxScore: 35,
    status: incidentPenalty === 0 ? "optimal" : incidentPenalty <= 15 ? "warning" : "critical",
    detail: incidentDetail,
  });

  // 3. Preventive Maintenance & Cleaning Routine (Max 25 points)
  let cleaningPenalty = 0;
  const now = Date.now();
  let overdueCount = 0;
  for (const site of sites) {
    const lastCleaned = site.last_cleaned_on ? new Date(site.last_cleaned_on).getTime() : 0;
    const daysSinceClean = lastCleaned > 0 ? Math.floor((now - lastCleaned) / (1000 * 60 * 60 * 24)) : 999;
    const overdueDays = daysSinceClean - (site.cleaning_cycle_days || 30);

    if (overdueDays > 0) {
      cleaningPenalty += 10;
      overdueCount++;
    }
  }
  cleaningPenalty = Math.min(25, cleaningPenalty);
  const cleaningScore = 25 - cleaningPenalty;

  factors.push({
    category: "Preventive Maintenance",
    score: cleaningScore,
    maxScore: 25,
    status: cleaningPenalty === 0 ? "optimal" : "warning",
    detail: overdueCount === 0
      ? "Solar panel cleaning routine is up to date across all installations."
      : `${overdueCount} site(s) are due or overdue for scheduled routine module washing.`,
  });

  // Raw score before clamping
  const rawScore = inverterScore + incidentScore + cleaningScore;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let status: "NORMAL" | "ATTENTION" | "SERVICE_ACTIVE" = "NORMAL";
  let label = "Normal";
  let summary = "Your solar system is operating normally.";

  if (score < 70) {
    status = "SERVICE_ACTIVE";
    label = "Service Active";
    summary = "SolarAssist technicians are actively addressing site performance.";
  } else if (score < 90) {
    status = "ATTENTION";
    label = "Attention Needed";
    summary = "Our automated monitoring system is supervising operational performance.";
  }

  return {
    score,
    status,
    label,
    summary,
    breakdown: {
      inverterScore,
      inverterPenalty,
      incidentScore,
      incidentPenalty,
      alertPenalty: incidentPenalty, // for backward compatibility
      cleaningScore,
      cleaningPenalty,
      factors,
    },
  };
}
