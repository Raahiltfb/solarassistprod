import { Site, SiteCleaningRule, TechnicianTeam, ConstraintSeverity, DEFAULT_SYSTEM_CLEANING_POLICY } from "./types";

/**
 * Resolves effective cleaning rule for a site.
 * If no custom site-specific override exists, returns system default policy.
 */
export function resolveEffectiveSiteCleaningRule(
  siteId: string,
  rule?: SiteCleaningRule | null
): SiteCleaningRule {
  if (rule && rule.is_override && rule.is_configured) {
    return rule;
  }
  return {
    id: rule?.id || `default-${siteId}`,
    site_id: siteId,
    is_configured: true,
    is_override: false,
    normal_interval_days: rule?.normal_interval_days ?? DEFAULT_SYSTEM_CLEANING_POLICY.normal_interval_days,
    monsoon_interval_days: rule?.monsoon_interval_days ?? DEFAULT_SYSTEM_CLEANING_POLICY.monsoon_interval_days,
    monsoon_start_md: rule?.monsoon_start_md || DEFAULT_SYSTEM_CLEANING_POLICY.monsoon_start_md,
    monsoon_end_md: rule?.monsoon_end_md || DEFAULT_SYSTEM_CLEANING_POLICY.monsoon_end_md,
    allowed_weekdays: rule?.allowed_weekdays || DEFAULT_SYSTEM_CLEANING_POLICY.allowed_weekdays,
    blackout_dates: rule?.blackout_dates || [],
    estimated_cleaning_mins: rule?.estimated_cleaning_mins || DEFAULT_SYSTEM_CLEANING_POLICY.estimated_cleaning_mins,
    created_at: rule?.created_at || new Date().toISOString(),
    updated_at: rule?.updated_at || new Date().toISOString(),
  };
}

export interface MacroScheduleRequest {
  year: number;
  month: number;
  sites: Site[];
  rules: SiteCleaningRule[];
  teams: TechnicianTeam[];
  planningCapacityMins?: number;
  schedulingToleranceDays?: number;
}

export interface ProposedAssignment {
  site_id: string;
  team_id: string;
  target_date: string;
  scheduled_date: string;
  sequence_order: number;
  estimated_cleaning_mins: number;
  estimated_travel_mins: number;
  estimated_distance_km: number;
  constraint_state: ConstraintSeverity;
  constraint_notes: string | null;
  scheduler_rationale: string;
}

export interface MacroScheduleResult {
  assignments: ProposedAssignment[];
  unconfiguredSites: Site[];
  unscheduledSites: Array<{ site: Site; targetDate: string; reason: string }>;
  rationaleLog: string[];
}

/**
 * Calculates distance in KM using Haversine formula between two lat/lng points
 */
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of Earth in KM
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
 * Checks if a given Date falls within a site's monsoon period (MM-DD format e.g. 06-01 to 09-30)
 */
function isMonsoonDate(date: Date, startMD = "06-01", endMD = "09-30"): boolean {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const currentMD = `${mm}-${dd}`;

  if (startMD <= endMD) {
    return currentMD >= startMD && currentMD <= endMD;
  } else {
    // Crosses year boundary (e.g. Nov to Feb)
    return currentMD >= startMD || currentMD <= endMD;
  }
}

/**
 * Converts JS Date day (0=Sun..6=Sat) to ISO weekday (1=Mon..7=Sun)
 */
function getIsoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Validates constraints for a specific site assignment on a target team/date
 */
export function validateAssignmentConstraint(
  site: Site,
  rule: SiteCleaningRule | undefined,
  targetDateStr: string,
  scheduledDateStr: string,
  teamDayWorkloadMins: number,
  planningCapacityMins = 480
): { state: ConstraintSeverity; notes: string | null } {
  if (!rule || !rule.is_configured) {
    return {
      state: "blocking",
      notes: "BLOCKING: Site cleaning rules have not been configured.",
    };
  }

  const schDate = new Date(scheduledDateStr);
  const weekday = getIsoWeekday(schDate);

  // 1. Allowed Weekdays Check
  if (rule.allowed_weekdays && rule.allowed_weekdays.length > 0) {
    if (!rule.allowed_weekdays.includes(weekday)) {
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const allowedNames = rule.allowed_weekdays.map((d) => dayNames[d - 1]).join(", ");
      return {
        state: "blocking",
        notes: `BLOCKING: Site cannot be cleaned on ${dayNames[weekday - 1]}. Allowed days: ${allowedNames}.`,
      };
    }
  }

  // 2. Blackout Dates Check
  if (rule.blackout_dates && rule.blackout_dates.includes(scheduledDateStr)) {
    return {
      state: "blocking",
      notes: `BLOCKING: Scheduled date ${scheduledDateStr} is a configured site blackout date.`,
    };
  }

  // 3. Workload Capacity Warning Check
  if (teamDayWorkloadMins > planningCapacityMins) {
    const hours = (teamDayWorkloadMins / 60).toFixed(1);
    const capHours = (planningCapacityMins / 60).toFixed(1);
    return {
      state: "warning",
      notes: `WARNING: Team planned workload (${hours}h) exceeds recommended planning capacity assumption (${capHours}h).`,
    };
  }

  // 4. Target Date Deviation Warning
  if (scheduledDateStr !== targetDateStr) {
    const diffDays = Math.round(
      (new Date(scheduledDateStr).getTime() - new Date(targetDateStr).getTime()) / 86400_000
    );
    if (Math.abs(diffDays) > 2) {
      return {
        state: "warning",
        notes: `WARNING: Visit scheduled ${diffDays > 0 ? `${diffDays} days after` : `${Math.abs(diffDays)} days before`} ideal target date.`,
      };
    }
  }

  return { state: "valid", notes: null };
}

/**
 * Main Deterministic & Explainable Assistant Macro-Scheduler
 */
export function generateMonthlyCleaningPlan({
  year,
  month,
  sites,
  rules,
  teams,
  planningCapacityMins = 480,
  schedulingToleranceDays = 2,
}: MacroScheduleRequest): MacroScheduleResult {
  const ruleMap = new Map<string, SiteCleaningRule>();
  rules.forEach((r) => ruleMap.set(r.site_id, r));

  const effectiveRuleMap = new Map<string, SiteCleaningRule>();
  const configuredSites: Site[] = [];
  const unconfiguredSites: Site[] = [];

  sites.forEach((s) => {
    const rawRule = ruleMap.get(s.id);
    const effectiveRule = resolveEffectiveSiteCleaningRule(s.id, rawRule);
    effectiveRuleMap.set(s.id, effectiveRule);
    configuredSites.push(s);
  });

  const activeTeams = teams.filter((t) => t.is_active);
  const assignments: ProposedAssignment[] = [];
  const unscheduledSites: Array<{ site: Site; targetDate: string; reason: string }> = [];
  const rationaleLog: string[] = [];

  if (activeTeams.length === 0) {
    rationaleLog.push("No active technician teams found for schedule generation.");
    return { assignments: [], unconfiguredSites, unscheduledSites: [], rationaleLog };
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // Last day of month
  const monthStartStr = monthStart.toISOString().split("T")[0];
  const monthEndStr = monthEnd.toISOString().split("T")[0];

  // Daily workload tracking map: key = `${team_id}:${dateStr}`, value = total mins
  const teamWorkloadMap = new Map<string, number>();

  // Daily team assigned sites count for sequence order
  const teamDaySequenceMap = new Map<string, number>();

  // Process configured sites to project recurring visit dates
  for (const site of configuredSites) {
    const rule = effectiveRuleMap.get(site.id)!;
    const siteLat = site.latitude;
    const siteLng = site.longitude;

    // Find nearest team by base location
    let nearestTeam = activeTeams[0];
    let minDistance = Infinity;
    for (const t of activeTeams) {
      if (t.base_latitude && t.base_longitude) {
        const dist = haversineDistanceKm(siteLat, siteLng, t.base_latitude, t.base_longitude);
        if (dist < minDistance) {
          minDistance = dist;
          nearestTeam = t;
        }
      }
    }

    // Determine baseline last cleaned date
    let lastCleanedDate = site.last_cleaned_on
      ? new Date(site.last_cleaned_on)
      : new Date(year, month - 1, -10); // Default prior date if never recorded

    let currentTargetDate = new Date(lastCleanedDate);

    // Calculate recurring target dates until exceeding monthEnd
    while (true) {
      const inMonsoon = isMonsoonDate(
        currentTargetDate,
        rule.monsoon_start_md || "06-01",
        rule.monsoon_end_md || "09-30"
      );

      const activeInterval =
        inMonsoon && rule.monsoon_interval_days
          ? rule.monsoon_interval_days
          : rule.normal_interval_days || 10;

      // Project next due date
      const nextDueMs = currentTargetDate.getTime() + activeInterval * 86400_000;
      currentTargetDate = new Date(nextDueMs);

      const targetDateStr = currentTargetDate.toISOString().split("T")[0];

      if (targetDateStr > monthEndStr) {
        break; // Passed month boundary
      }

      if (targetDateStr < monthStartStr) {
        continue; // Before month boundary
      }

      // Search for best valid scheduled date within tolerance window [Target - tol, Target + tol]
      let bestDateStr: string | null = null;
      let bestTeam = nearestTeam;
      let minTravelMins = 30;
      let minTravelKm = Math.round(minDistance * 1.3 * 10) / 10; // Est road distance

      // Candidate window search
      let foundDate = false;
      for (let offset = 0; offset <= schedulingToleranceDays * 2; offset++) {
        // Alternate offset: 0, +1, -1, +2, -2...
        const sign = offset % 2 === 0 ? 1 : -1;
        const delta = Math.floor((offset + 1) / 2) * sign;

        const candidateMs = currentTargetDate.getTime() + delta * 86400_000;
        const candidateDate = new Date(candidateMs);
        const candidateStr = candidateDate.toISOString().split("T")[0];

        if (candidateStr < monthStartStr || candidateStr > monthEndStr) continue;

        const isoWeekday = getIsoWeekday(candidateDate);
        if (rule.allowed_weekdays && rule.allowed_weekdays.length > 0) {
          if (!rule.allowed_weekdays.includes(isoWeekday)) continue;
        }

        if (rule.blackout_dates && rule.blackout_dates.includes(candidateStr)) continue;

        // Check nearest team workload capacity
        const currentWorkload = teamWorkloadMap.get(`${nearestTeam.id}:${candidateStr}`) || 0;
        const cleaningMins = rule.estimated_cleaning_mins || 90;
        const estTotalMins = currentWorkload + cleaningMins + minTravelMins;

        if (estTotalMins <= planningCapacityMins) {
          bestDateStr = candidateStr;
          foundDate = true;
          break;
        }
      }

      // Fallback: If nearest team overloaded on all candidate dates, try secondary teams
      if (!foundDate) {
        for (const team of activeTeams) {
          if (team.id === nearestTeam.id) continue;
          const candidateStr = targetDateStr;
          const currentWorkload = teamWorkloadMap.get(`${team.id}:${candidateStr}`) || 0;
          const cleaningMins = rule.estimated_cleaning_mins || 90;

          if (currentWorkload + cleaningMins <= planningCapacityMins) {
            bestDateStr = candidateStr;
            bestTeam = team;
            foundDate = true;
            break;
          }
        }
      }

      // Final placement decision
      if (bestDateStr) {
        const cleaningMins = rule.estimated_cleaning_mins || 90;
        const key = `${bestTeam.id}:${bestDateStr}`;

        const currentSeq = (teamDaySequenceMap.get(key) || 0) + 1;
        teamDaySequenceMap.set(key, currentSeq);

        const currentWorkload = teamWorkloadMap.get(key) || 0;
        teamWorkloadMap.set(key, currentWorkload + cleaningMins + minTravelMins);

        const constraintValidation = validateAssignmentConstraint(
          site,
          rule,
          targetDateStr,
          bestDateStr,
          currentWorkload + cleaningMins + minTravelMins,
          planningCapacityMins
        );

        let rationale = `Scheduled for ${bestTeam.name} on ${bestDateStr}. Ideal target due: ${targetDateStr}.`;
        if (bestDateStr !== targetDateStr) {
          rationale += ` Shifted ${bestDateStr > targetDateStr ? "forward" : "backward"} due to weekday/capacity constraints.`;
        }
        if (bestTeam.id !== nearestTeam.id) {
          rationale += ` Reassigned to ${bestTeam.name} to relieve workload capacity.`;
        }

        assignments.push({
          site_id: site.id,
          team_id: bestTeam.id,
          target_date: targetDateStr,
          scheduled_date: bestDateStr,
          sequence_order: currentSeq,
          estimated_cleaning_mins: cleaningMins,
          estimated_travel_mins: minTravelMins,
          estimated_distance_km: minTravelKm,
          constraint_state: constraintValidation.state,
          constraint_notes: constraintValidation.notes,
          scheduler_rationale: rationale,
        });

        rationaleLog.push(`[${site.name}] ${rationale}`);
      } else {
        unscheduledSites.push({
          site,
          targetDate: targetDateStr,
          reason: `No valid capacity or allowed weekday slot found within tolerance window.`,
        });
        rationaleLog.push(`[${site.name}] WARNING: Unable to schedule visit for target date ${targetDateStr}.`);
      }
    }
  }

  return {
    assignments,
    unconfiguredSites,
    unscheduledSites,
    rationaleLog,
  };
}
