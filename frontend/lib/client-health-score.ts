/**
 * Deterministic, explainable Health Score calculation for Client Portal.
 * 
 * Formula:
 *   Score = 100 - (Inverter Availability Penalty) - (Deduplicated Open Issue Penalty) - (Overdue Cleaning Penalty)
 *   Clamped strictly between 0 and 100.
 */

export interface SystemHealthResult {
  score: number; // 0 to 100
  status: "NORMAL" | "ATTENTION" | "SERVICE_ACTIVE";
  label: string;
  summary: string;
  breakdown: {
    inverterPenalty: number;
    alertPenalty: number;
    cleaningPenalty: number;
  };
}

export function calculateClientHealthScore(params: {
  inverters: Array<{ status?: string; last_seen_at?: string }>;
  alerts: Array<{ id: string; site_id: string; inverter_id?: string | null; code: string; severity?: string }>;
  sites: Array<{ cleaning_cycle_days: number; last_cleaned_on?: string | null }>;
  latestTelemetryTimestampMap?: Map<string, string>;
}): SystemHealthResult {
  const { inverters, alerts, sites, latestTelemetryTimestampMap } = params;

  // 1. Inverter Connectivity & Health Penalty (Max 40 points)
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

  // 2. Deduplicated Open Issue Penalty (Max 35 points)
  // Deduplicate alerts representing the same root operational issue by site + inverter + code
  const uniqueIssues = new Map<string, string>();
  for (const a of alerts) {
    const issueKey = `${a.site_id}:${a.inverter_id || "site"}:${a.code}`;
    const currentSev = uniqueIssues.get(issueKey);
    // Keep highest severity if multiple instances exist
    if (!currentSev || a.severity === "critical" || (a.severity === "high" && currentSev !== "critical")) {
      uniqueIssues.set(issueKey, a.severity || "medium");
    }
  }

  let alertPenalty = 0;
  for (const severity of Array.from(uniqueIssues.values())) {
    if (severity === "critical" || severity === "high") {
      alertPenalty += 15;
    } else {
      alertPenalty += 5;
    }
  }
  alertPenalty = Math.min(35, alertPenalty);

  // 3. Overdue Cleaning Penalty (Max 25 points)
  let cleaningPenalty = 0;
  const now = Date.now();
  for (const site of sites) {
    const lastCleaned = site.last_cleaned_on ? new Date(site.last_cleaned_on).getTime() : 0;
    const daysSinceClean = lastCleaned > 0 ? Math.floor((now - lastCleaned) / (1000 * 60 * 60 * 24)) : 999;
    const overdueDays = daysSinceClean - (site.cleaning_cycle_days || 30);

    if (overdueDays > 0) {
      cleaningPenalty += 10;
    }
  }
  cleaningPenalty = Math.min(25, cleaningPenalty);

  // Raw score before clamping
  const rawScore = 100 - inverterPenalty - alertPenalty - cleaningPenalty;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let status: "NORMAL" | "ATTENTION" | "SERVICE_ACTIVE" = "NORMAL";
  let label = "Normal";
  let summary = "Your solar system is operating normally.";

  if (score < 70) {
    status = "SERVICE_ACTIVE";
    label = "Service Active";
    summary = "SolarAssist technicians are actively addressing site issues.";
  } else if (score < 90) {
    status = "ATTENTION";
    label = "Attention Needed";
    summary = "Our monitoring system is attending to performance variations.";
  }

  return {
    score,
    status,
    label,
    summary,
    breakdown: {
      inverterPenalty,
      alertPenalty,
      cleaningPenalty,
    },
  };
}
