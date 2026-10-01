import { Site, SiteCleaningRule, TechnicianTeam, ConstraintSeverity, DEFAULT_SYSTEM_CLEANING_POLICY } from "./types";
import { CleaningVisitStatus, UnscheduledReason } from "./cleaning-domain";

/**
 * Helper to parse a date string YYYY-MM-DD into a local Date object at noon to prevent timezone shifts.
 */
function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Helper to format a local Date object to YYYY-MM-DD.
 */
function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Converts JS Date day (0=Sun..6=Sat) to ISO weekday (1=Mon..7=Sun)
 */
export function getIsoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
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
 * Calculates distance in KM using Haversine formula between two lat/lng points
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
 * Helper to check if two locations belong to compatible regions (rejects Bangalore on Thane/Pune routes)
 */
function isCompatibleRegion(loc1?: string, loc2?: string): boolean {
  if (!loc1 || !loc2) return true;
  const l1 = loc1.toLowerCase();
  const l2 = loc2.toLowerCase();

  const isBangalore1 = l1.includes("bangalore") || l1.includes("bengaluru");
  const isBangalore2 = l2.includes("bangalore") || l2.includes("bengaluru");

  if (isBangalore1 !== isBangalore2) return false;
  return true;
}

function extractBuildingBaseName(name: string): string {
  return name
    .replace(/\s+society.*/i, "")
    .replace(/\s+wing.*/i, "")
    .replace(/\s+building.*/i, "")
    .replace(/\s+tower.*/i, "")
    .replace(/\s+club house.*/i, "")
    .replace(/\s+\d+(\.\d+)?(kw|kwh)?$/i, "")
    .trim();
}

export interface GeographicCluster {
  cluster_id: string;
  cluster_name: string;
  sites: Site[];
  center_lat: number;
  center_lng: number;
  owner_team_id: string | null;
}

/**
 * Builds physical location clusters by grouping sites within 1.5km radius or matching building/property names.
 */
export function buildGeographicClusters(sites: Site[]): GeographicCluster[] {
  const clusters: GeographicCluster[] = [];

  sites.forEach((site) => {
    let matchedCluster: GeographicCluster | undefined = undefined;
    const siteBaseName = extractBuildingBaseName(site.name);

    for (const c of clusters) {
      const dist = haversineDistanceKm(site.latitude, site.longitude, c.center_lat, c.center_lng);

      if (dist <= 1.5 && (site.latitude !== 19 || site.longitude !== 73)) {
        matchedCluster = c;
        break;
      }

      const clusterBaseName = extractBuildingBaseName(c.sites[0].name);

      if (
        siteBaseName.length >= 3 &&
        clusterBaseName.length >= 3 &&
        (siteBaseName.toLowerCase().includes(clusterBaseName.toLowerCase()) ||
          clusterBaseName.toLowerCase().includes(siteBaseName.toLowerCase()))
      ) {
        matchedCluster = c;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.sites.push(site);
    } else {
      clusters.push({
        cluster_id: `cluster-${site.id}`,
        cluster_name: siteBaseName + " Cluster",
        sites: [site],
        center_lat: site.latitude,
        center_lng: site.longitude,
        owner_team_id: null,
      });
    }
  });

  return clusters;
}

/**
 * Resolves effective cleaning rule for a site.
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
  previousTeamAssignments?: Map<string, string>;
  workforceAllowedWeekdays?: number[]; // Workforce calendar (default Mon-Sat: [1,2,3,4,5,6])
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

export interface ProposedVisit {
  site_id: string;
  cycle_period: string;
  visit_sequence_in_month: number;
  target_due_date: string;
  scheduled_date: string | null;
  assigned_team_id: string | null;
  status: CleaningVisitStatus;
  constraint_state: ConstraintSeverity;
  constraint_notes: string | null;
  unscheduled_reason: UnscheduledReason | null;
  planner_rationale: string;
  estimated_cleaning_mins: number;
  estimated_travel_mins: number;
  estimated_distance_km: number;
}

export interface PreScheduleAuditItem {
  site_id: string;
  site_name: string;
  cluster_id: string;
  cluster_name: string;
  required_visits_count: number;
  target_due_dates: string[];
  eligible_teams: string[];
}

export interface PreScheduleAuditReport {
  total_sites: number;
  total_required_visits: number;
  total_clusters: number;
  audit_items: PreScheduleAuditItem[];
}

export interface MacroScheduleResult {
  assignments: ProposedAssignment[];
  proposedVisits: ProposedVisit[];
  unconfiguredSites: Site[];
  unscheduledSites: Array<{ site: Site; targetDate: string; reason: string }>;
  rationaleLog: string[];
  clusters: GeographicCluster[];
  auditReport: PreScheduleAuditReport;
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

  const schDate = parseDateStr(scheduledDateStr);
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
      (parseDateStr(scheduledDateStr).getTime() - parseDateStr(targetDateStr).getTime()) / 86400_000
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
 * Phase 2.7 Location-Day Batching Macro-Scheduler:
 * - RULE 1: ONE TEAM PER PHYSICAL LOCATION PER DAY (Hard Rule: COUNT(DISTINCT team) <= 1 per date+location)
 * - RULE 2: Batch same-location work together on the same day whenever possible
 * - RULE 3: Select common valid date across sites in the physical location
 * - RULE 4: Preserve team ownership continuity per location
 * - RULE 8: Work exceeding 1 day capacity continues with SAME team on subsequent valid day
 */
export function generateMonthlyCleaningPlan({
  year,
  month,
  sites,
  rules,
  teams,
  planningCapacityMins = 480,
  previousTeamAssignments,
  workforceAllowedWeekdays = [1, 2, 3, 4, 5, 6],
}: MacroScheduleRequest): MacroScheduleResult {
  const cyclePeriod = `${year}-${String(month).padStart(2, "0")}`;
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
  const proposedVisits: ProposedVisit[] = [];
  const unscheduledSites: Array<{ site: Site; targetDate: string; reason: string }> = [];
  const rationaleLog: string[] = [];

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndStr = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const allMonthDates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    allMonthDates.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  // LEVEL 1: Group physical locations / clusters
  const clusters = buildGeographicClusters(configuredSites);
  const teamClusterWorkloadMap = new Map<string, number>();

  clusters.forEach((cluster) => {
    const histTeamId = cluster.sites.map((s) => previousTeamAssignments?.get(s.id)).find((id) => !!id);
    const historicalTeam = activeTeams.find((t) => t.id === histTeamId);

    if (historicalTeam) {
      cluster.owner_team_id = historicalTeam.id;
    } else if (activeTeams.length > 0) {
      let bestTeam = activeTeams[0];
      let bestScore = -Infinity;

      for (const t of activeTeams) {
        const dist = haversineDistanceKm(
          cluster.center_lat,
          cluster.center_lng,
          t.base_latitude || cluster.center_lat,
          t.base_longitude || cluster.center_lng
        );
        let score = 1000 - dist * 10;
        const currentWorkload = teamClusterWorkloadMap.get(t.id) || 0;
        score -= currentWorkload * 0.1;

        if (score > bestScore) {
          bestScore = score;
          bestTeam = t;
        }
      }
      cluster.owner_team_id = bestTeam.id;
    }

    if (cluster.owner_team_id) {
      const current = teamClusterWorkloadMap.get(cluster.owner_team_id) || 0;
      teamClusterWorkloadMap.set(cluster.owner_team_id, current + cluster.sites.length * 180);
    }
  });

  const clusterMap = new Map<string, GeographicCluster>();
  clusters.forEach((c) => {
    c.sites.forEach((s) => clusterMap.set(s.id, c));
  });

  // LEVEL 2: Recurrence Visit Generation & Pre-Schedule Audit
  interface RequiredVisitItem {
    visitId: string;
    site: Site;
    cluster: GeographicCluster;
    rule: SiteCleaningRule;
    targetDateStr: string;
    visitSequenceInMonth: number;
    cleaningMins: number;
    travelMins: number;
    travelKm: number;
    preferredTeam: TechnicianTeam | null;
    validCandidateDates: string[];
  }

  const visitsToSchedule: RequiredVisitItem[] = [];
  const auditItems: PreScheduleAuditItem[] = [];

  for (const site of configuredSites) {
    const rule = effectiveRuleMap.get(site.id)!;
    const cluster = clusterMap.get(site.id)!;
    const preferredTeam = activeTeams.find((t) => t.id === cluster.owner_team_id) || activeTeams[0] || null;

    const cleaningMins = rule.estimated_cleaning_mins || 90;
    const isMultiWing = cluster.sites.length > 1;
    const minTravelMins = isMultiWing ? 10 : 30;
    const baseDist = preferredTeam && preferredTeam.base_latitude && preferredTeam.base_longitude
      ? haversineDistanceKm(site.latitude, site.longitude, preferredTeam.base_latitude, preferredTeam.base_longitude)
      : 15;
    const minTravelKm = Math.round(baseDist * 1.3 * 10) / 10;

    const siteTargetDates: string[] = [];

    if (!site.last_cleaned_on) {
      let currentTarget = parseDateStr(monthStartStr);
      while (formatDateStr(currentTarget) <= monthEndStr) {
        siteTargetDates.push(formatDateStr(currentTarget));
        const inMonsoon = isMonsoonDate(
          currentTarget,
          rule.monsoon_start_md || "06-01",
          rule.monsoon_end_md || "09-30"
        );
        const activeInterval =
          inMonsoon && rule.monsoon_interval_days
            ? rule.monsoon_interval_days
            : rule.normal_interval_days || 15;

        currentTarget.setDate(currentTarget.getDate() + activeInterval);
      }
    } else {
      let currentTarget = parseDateStr(site.last_cleaned_on);
      while (true) {
        // Evaluate monsoon based on the target date we are moving towards (at least 1 day after currentTarget)
        const nextStepDate = new Date(currentTarget.getTime() + 86400_000);
        const inMonsoon = isMonsoonDate(
          nextStepDate,
          rule.monsoon_start_md || "06-01",
          rule.monsoon_end_md || "09-30"
        );
        const activeInterval =
          inMonsoon && rule.monsoon_interval_days
            ? rule.monsoon_interval_days
            : rule.normal_interval_days || 15;

        currentTarget.setDate(currentTarget.getDate() + activeInterval);
        const targetStr = formatDateStr(currentTarget);

        if (targetStr >= monthStartStr) {
          break;
        }
      }

      while (formatDateStr(currentTarget) <= monthEndStr) {
        siteTargetDates.push(formatDateStr(currentTarget));
        const inMonsoon = isMonsoonDate(
          currentTarget,
          rule.monsoon_start_md || "06-01",
          rule.monsoon_end_md || "09-30"
        );
        const activeInterval =
          inMonsoon && rule.monsoon_interval_days
            ? rule.monsoon_interval_days
            : rule.normal_interval_days || 15;

        currentTarget.setDate(currentTarget.getDate() + activeInterval);
      }
    }

    auditItems.push({
      site_id: site.id,
      site_name: site.name,
      cluster_id: cluster.cluster_id,
      cluster_name: cluster.cluster_name,
      required_visits_count: siteTargetDates.length,
      target_due_dates: siteTargetDates,
      eligible_teams: activeTeams.map((t) => t.name),
    });

    siteTargetDates.forEach((targetDateStr, idx) => {
      const validCandidateDates = allMonthDates.filter((dStr) => {
        const dObj = parseDateStr(dStr);
        const isoWk = getIsoWeekday(dObj);

        if (!workforceAllowedWeekdays.includes(isoWk)) return false;
        if (rule.allowed_weekdays && rule.allowed_weekdays.length > 0) {
          if (!rule.allowed_weekdays.includes(isoWk)) return false;
        }
        if (rule.blackout_dates && rule.blackout_dates.includes(dStr)) return false;

        return true;
      });

      visitsToSchedule.push({
        visitId: `visit-${site.id}-${idx}`,
        site,
        cluster,
        rule,
        targetDateStr,
        visitSequenceInMonth: idx + 1,
        cleaningMins,
        travelMins: minTravelMins,
        travelKm: minTravelKm,
        preferredTeam,
        validCandidateDates,
      });
    });
  }

  const auditReport: PreScheduleAuditReport = {
    total_sites: configuredSites.length,
    total_required_visits: visitsToSchedule.length,
    total_clusters: clusters.length,
    audit_items: auditItems,
  };

  // Tracking daily workload per team, daily sequence order, daily sites per team, and location-day team lock
  const teamWorkloadMap = new Map<string, number>();
  const teamDaySequenceMap = new Map<string, number>();
  const teamDaySitesMap = new Map<string, Site[]>();
  // HARD RULE 1 LOCK: key = `${dateStr}:${cluster_id}`, value = assigned_team_id
  const locationDayTeamLockMap = new Map<string, string>();

  // Group visits by (cluster_id, visitSequenceInMonth) to batch same-location work for each cycle
  const clusterCycleMap = new Map<string, RequiredVisitItem[]>();
  visitsToSchedule.forEach((v) => {
    const key = `${v.cluster.cluster_id}:seq-${v.visitSequenceInMonth}`;
    const list = clusterCycleMap.get(key) || [];
    list.push(v);
    clusterCycleMap.set(key, list);
  });

  // Process each cluster cycle group
  clusterCycleMap.forEach((cycleVisits, groupKey) => {
    if (cycleVisits.length === 0) return;

    const cluster = cycleVisits[0].cluster;
    const preferredTeam = cycleVisits[0].preferredTeam;

    // Find best COMMON VALID DATE across sites in this cluster cycle group
    const avgTargetMs = cycleVisits.reduce((acc, v) => acc + parseDateStr(v.targetDateStr).getTime(), 0) / cycleVisits.length;
    const avgTargetStr = formatDateStr(new Date(avgTargetMs));

    // Intersection of valid candidate dates across ALL sites in this cycle group
    let candidateDates = allMonthDates.filter((dStr) => {
      return cycleVisits.every((v) => v.validCandidateDates.includes(dStr));
    });

    if (candidateDates.length === 0) {
      // Fallback: union of valid candidate dates if strict intersection is empty
      const unionSet = new Set<string>();
      cycleVisits.forEach((v) => v.validCandidateDates.forEach((d) => unionSet.add(d)));
      candidateDates = Array.from(unionSet);
    }

    // Rank candidate dates by proximity to average target date
    candidateDates.sort((a, b) => {
      const diffA = Math.abs(parseDateStr(a).getTime() - avgTargetMs);
      const diffB = Math.abs(parseDateStr(b).getTime() - avgTargetMs);
      if (diffA !== diffB) return diffA - diffB;
      const prefA = a >= avgTargetStr ? 0 : 1;
      const prefB = b >= avgTargetStr ? 0 : 1;
      if (prefA !== prefB) return prefA - prefB;
      return a.localeCompare(b);
    });

    const totalCleaningMins = cycleVisits.reduce((sum, v) => sum + v.cleaningMins, 0);
    const baseTravelMins = cycleVisits[0].travelMins;

    // DETERMINISTIC RULE: If total location cycle cleaning + 1 travel stop <= 480m, force SINGLE SERVICE DATE for entire cycle!
    const totalCycleSingleDayWorkload = totalCleaningMins + baseTravelMins;

    let cycleScheduled = false;

    // Step 1: Try assigning the ENTIRE Location Service Cycle to a SINGLE date across available teams (preferred team first)
    const teamsToTry = preferredTeam
      ? [preferredTeam, ...activeTeams.filter((t) => t.id !== preferredTeam.id)]
      : activeTeams;

    if (totalCycleSingleDayWorkload <= planningCapacityMins) {
      for (const team of teamsToTry) {
        if (cycleScheduled) break;

        for (const candidateStr of candidateDates) {
          const lockKey = `${candidateStr}:${cluster.cluster_id}`;
          const existingLockedTeam = locationDayTeamLockMap.get(lockKey);

          if (existingLockedTeam && existingLockedTeam !== team.id) continue;

          const dayKey = `${team.id}:${candidateStr}`;
          const existingSitesOnDay = teamDaySitesMap.get(dayKey) || [];

          let geoSanityPassed = true;
          for (const exSite of existingSitesOnDay) {
            const dist = haversineDistanceKm(exSite.latitude, exSite.longitude, cluster.center_lat, cluster.center_lng);
            if (dist > 100 || !isCompatibleRegion(exSite.location, cluster.sites[0]?.location)) {
              geoSanityPassed = false;
              break;
            }
          }
          if (!geoSanityPassed) continue;

          const currentWorkload = teamWorkloadMap.get(dayKey) || 0;
          const isFirstLocVisit = !existingSitesOnDay.some((s) => cluster.sites.some((cs) => cs.id === s.id));
          const travelCost = isFirstLocVisit ? baseTravelMins : 0;
          const neededWorkload = totalCleaningMins + travelCost;

          if (currentWorkload + neededWorkload <= planningCapacityMins) {
            // Schedule ALL sites of this location cycle TOGETHER on candidateStr!
            let newWorkload = currentWorkload + neededWorkload;
            teamWorkloadMap.set(dayKey, newWorkload);
            locationDayTeamLockMap.set(lockKey, team.id);

            cycleVisits.forEach((vItem, idx) => {
              const seq = (teamDaySequenceMap.get(dayKey) || 0) + 1;
              teamDaySequenceMap.set(dayKey, seq);
              existingSitesOnDay.push(vItem.site);
              teamDaySitesMap.set(dayKey, existingSitesOnDay);

              const constraintValidation = validateAssignmentConstraint(
                vItem.site,
                vItem.rule,
                vItem.targetDateStr,
                candidateStr,
                newWorkload,
                planningCapacityMins
              );

              let rationale = `Location Cycle batched for ${team.name} on single date ${candidateStr}. Target due: ${vItem.targetDateStr}.`;

              assignments.push({
                site_id: vItem.site.id,
                team_id: team.id,
                target_date: vItem.targetDateStr,
                scheduled_date: candidateStr,
                sequence_order: seq,
                estimated_cleaning_mins: vItem.cleaningMins,
                estimated_travel_mins: idx === 0 && isFirstLocVisit ? baseTravelMins : 0,
                estimated_distance_km: idx === 0 && isFirstLocVisit ? vItem.travelKm : 0,
                constraint_state: constraintValidation.state,
                constraint_notes: constraintValidation.notes,
                scheduler_rationale: rationale,
              });

              proposedVisits.push({
                site_id: vItem.site.id,
                cycle_period: cyclePeriod,
                visit_sequence_in_month: vItem.visitSequenceInMonth,
                target_due_date: vItem.targetDateStr,
                scheduled_date: candidateStr,
                assigned_team_id: team.id,
                status: "planned",
                constraint_state: constraintValidation.state,
                constraint_notes: constraintValidation.notes,
                unscheduled_reason: null,
                planner_rationale: rationale,
                estimated_cleaning_mins: vItem.cleaningMins,
                estimated_travel_mins: idx === 0 && isFirstLocVisit ? baseTravelMins : 0,
                estimated_distance_km: idx === 0 && isFirstLocVisit ? vItem.travelKm : 0,
              });
            });

            cycleScheduled = true;
            break;
          }
        }
      }
    }

    // Step 2: Multi-day split ONLY if location total cleaning > 480m (e.g. Alcove) or single-day full across all teams
    if (!cycleScheduled) {
      let visitIdx = 0;
      const totalVisits = cycleVisits.length;

      // First pass: try candidate dates
      for (const candidateStr of candidateDates) {
        if (visitIdx >= totalVisits) break;

        for (const team of teamsToTry) {
          if (visitIdx >= totalVisits) break;

          const lockKey = `${candidateStr}:${cluster.cluster_id}`;
          const existingLockedTeam = locationDayTeamLockMap.get(lockKey);
          if (existingLockedTeam && existingLockedTeam !== team.id) continue;

          const dayKey = `${team.id}:${candidateStr}`;
          const existingSitesOnDay = teamDaySitesMap.get(dayKey) || [];

          let geoSanityPassed = true;
          for (const exSite of existingSitesOnDay) {
            const dist = haversineDistanceKm(exSite.latitude, exSite.longitude, cluster.center_lat, cluster.center_lng);
            if (dist > 100 || !isCompatibleRegion(exSite.location, cluster.sites[0]?.location)) {
              geoSanityPassed = false;
              break;
            }
          }
          if (!geoSanityPassed) continue;

          let currentWorkload = teamWorkloadMap.get(dayKey) || 0;

          while (visitIdx < totalVisits) {
            const vItem = cycleVisits[visitIdx];
            if (!vItem.validCandidateDates.includes(candidateStr)) {
              visitIdx++;
              continue;
            }

            const isFirstLocVisit = !existingSitesOnDay.some((s) => cluster.sites.some((cs) => cs.id === s.id));
            const travelCost = isFirstLocVisit ? baseTravelMins : 0;
            const neededMins = vItem.cleaningMins + travelCost;

            if (currentWorkload + neededMins <= planningCapacityMins) {
              currentWorkload += neededMins;
              teamWorkloadMap.set(dayKey, currentWorkload);
              locationDayTeamLockMap.set(lockKey, team.id);

              const seq = (teamDaySequenceMap.get(dayKey) || 0) + 1;
              teamDaySequenceMap.set(dayKey, seq);
              existingSitesOnDay.push(vItem.site);
              teamDaySitesMap.set(dayKey, existingSitesOnDay);

              const constraintValidation = validateAssignmentConstraint(
                vItem.site,
                vItem.rule,
                vItem.targetDateStr,
                candidateStr,
                currentWorkload,
                planningCapacityMins
              );

              let rationale = `Multi-day Location Cycle split for ${team.name} on ${candidateStr}.`;

              assignments.push({
                site_id: vItem.site.id,
                team_id: team.id,
                target_date: vItem.targetDateStr,
                scheduled_date: candidateStr,
                sequence_order: seq,
                estimated_cleaning_mins: vItem.cleaningMins,
                estimated_travel_mins: travelCost,
                estimated_distance_km: isFirstLocVisit ? vItem.travelKm : 0,
                constraint_state: constraintValidation.state,
                constraint_notes: constraintValidation.notes,
                scheduler_rationale: rationale,
              });

              proposedVisits.push({
                site_id: vItem.site.id,
                cycle_period: cyclePeriod,
                visit_sequence_in_month: vItem.visitSequenceInMonth,
                target_due_date: vItem.targetDateStr,
                scheduled_date: candidateStr,
                assigned_team_id: team.id,
                status: "planned",
                constraint_state: constraintValidation.state,
                constraint_notes: constraintValidation.notes,
                unscheduled_reason: null,
                planner_rationale: rationale,
                estimated_cleaning_mins: vItem.cleaningMins,
                estimated_travel_mins: travelCost,
                estimated_distance_km: isFirstLocVisit ? vItem.travelKm : 0,
              });

              visitIdx++;
            } else {
              break;
            }
          }
        }
      }

      // Second pass for remaining visits in this cycle: search ALL valid working dates in the month
      if (visitIdx < totalVisits) {
        for (const candidateStr of allMonthDates) {
          if (visitIdx >= totalVisits) break;

          for (const team of activeTeams) {
            if (visitIdx >= totalVisits) break;

            const vItem = cycleVisits[visitIdx];
            if (!vItem.validCandidateDates.includes(candidateStr)) continue;

            const lockKey = `${candidateStr}:${cluster.cluster_id}`;
            const existingLockedTeam = locationDayTeamLockMap.get(lockKey);
            if (existingLockedTeam && existingLockedTeam !== team.id) continue;

            const dayKey = `${team.id}:${candidateStr}`;
            const existingSitesOnDay = teamDaySitesMap.get(dayKey) || [];

            let currentWorkload = teamWorkloadMap.get(dayKey) || 0;
            const isFirstLocVisit = !existingSitesOnDay.some((s) => cluster.sites.some((cs) => cs.id === s.id));
            const travelCost = isFirstLocVisit ? baseTravelMins : 0;
            const neededMins = vItem.cleaningMins + travelCost;

            if (currentWorkload + neededMins <= planningCapacityMins) {
              currentWorkload += neededMins;
              teamWorkloadMap.set(dayKey, currentWorkload);
              locationDayTeamLockMap.set(lockKey, team.id);

              const seq = (teamDaySequenceMap.get(dayKey) || 0) + 1;
              teamDaySequenceMap.set(dayKey, seq);
              existingSitesOnDay.push(vItem.site);
              teamDaySitesMap.set(dayKey, existingSitesOnDay);

              const constraintValidation = validateAssignmentConstraint(
                vItem.site,
                vItem.rule,
                vItem.targetDateStr,
                candidateStr,
                currentWorkload,
                planningCapacityMins
              );

              let rationale = `Extended calendar placement for ${team.name} on ${candidateStr}.`;

              assignments.push({
                site_id: vItem.site.id,
                team_id: team.id,
                target_date: vItem.targetDateStr,
                scheduled_date: candidateStr,
                sequence_order: seq,
                estimated_cleaning_mins: vItem.cleaningMins,
                estimated_travel_mins: travelCost,
                estimated_distance_km: isFirstLocVisit ? vItem.travelKm : 0,
                constraint_state: constraintValidation.state,
                constraint_notes: constraintValidation.notes,
                scheduler_rationale: rationale,
              });

              proposedVisits.push({
                site_id: vItem.site.id,
                cycle_period: cyclePeriod,
                visit_sequence_in_month: vItem.visitSequenceInMonth,
                target_due_date: vItem.targetDateStr,
                scheduled_date: candidateStr,
                assigned_team_id: team.id,
                status: "planned",
                constraint_state: constraintValidation.state,
                constraint_notes: constraintValidation.notes,
                unscheduled_reason: null,
                planner_rationale: rationale,
                estimated_cleaning_mins: vItem.cleaningMins,
                estimated_travel_mins: travelCost,
                estimated_distance_km: isFirstLocVisit ? vItem.travelKm : 0,
              });

              visitIdx++;
            }
          }
        }
      }

      // If any visits still remain in this cycle group, record them for the Repair / Rebalance Pass below
      while (visitIdx < totalVisits) {
        const vItem = cycleVisits[visitIdx];
        let unscheduledReason: UnscheduledReason = "team_capacity";
        let rationale = `Unscheduled (team_capacity): Exhausted available capacity.`;

        unscheduledSites.push({ site: vItem.site, targetDate: vItem.targetDateStr, reason: rationale });
        proposedVisits.push({
          site_id: vItem.site.id,
          cycle_period: cyclePeriod,
          visit_sequence_in_month: vItem.visitSequenceInMonth,
          target_due_date: vItem.targetDateStr,
          scheduled_date: null,
          assigned_team_id: null,
          status: "unscheduled",
          constraint_state: "blocking",
          constraint_notes: rationale,
          unscheduled_reason: unscheduledReason,
          planner_rationale: rationale,
          estimated_cleaning_mins: vItem.cleaningMins,
          estimated_travel_mins: vItem.travelMins,
          estimated_distance_km: vItem.travelKm,
        });

        visitIdx++;
      }
    }
  });

  // STEP 3: REPAIR / REBALANCE PASS (GENERATE -> PLACE -> VALIDATE -> REPAIR -> REBALANCE -> VALIDATE AGAIN)
  const unplacedVisits = proposedVisits.filter((pv) => pv.status === "unscheduled");

  if (unplacedVisits.length > 0) {
    for (const pv of unplacedVisits) {
      const site = configuredSites.find((s) => s.id === pv.site_id);
      if (!site) continue;
      const rule = effectiveRuleMap.get(site.id)!;
      const cluster = clusterMap.get(site.id)!;
      const baseTravelMins = cluster.sites.length > 1 ? 10 : 30;

      let repaired = false;

      // Find any valid working date in the month where ANY team has capacity
      for (const dStr of allMonthDates) {
        if (repaired) break;

        const dObj = parseDateStr(dStr);
        const isoWk = getIsoWeekday(dObj);
        if (!workforceAllowedWeekdays.includes(isoWk)) continue;
        if (rule.allowed_weekdays && rule.allowed_weekdays.length > 0 && !rule.allowed_weekdays.includes(isoWk)) continue;
        if (rule.blackout_dates && rule.blackout_dates.includes(dStr)) continue;

        for (const team of activeTeams) {
          const lockKey = `${dStr}:${cluster.cluster_id}`;
          const existingLockedTeam = locationDayTeamLockMap.get(lockKey);
          if (existingLockedTeam && existingLockedTeam !== team.id) continue;

          const dayKey = `${team.id}:${dStr}`;
          const existingSitesOnDay = teamDaySitesMap.get(dayKey) || [];
          const currentWorkload = teamWorkloadMap.get(dayKey) || 0;
          const isFirstLocVisit = !existingSitesOnDay.some((s) => cluster.sites.some((cs) => cs.id === s.id));
          const travelCost = isFirstLocVisit ? baseTravelMins : 0;
          const neededMins = pv.estimated_cleaning_mins + travelCost;

          if (currentWorkload + neededMins <= planningCapacityMins) {
            const newWorkload = currentWorkload + neededMins;
            teamWorkloadMap.set(dayKey, newWorkload);
            locationDayTeamLockMap.set(lockKey, team.id);

            const seq = (teamDaySequenceMap.get(dayKey) || 0) + 1;
            teamDaySequenceMap.set(dayKey, seq);
            existingSitesOnDay.push(site);
            teamDaySitesMap.set(dayKey, existingSitesOnDay);

            const constraintValidation = validateAssignmentConstraint(
              site,
              rule,
              pv.target_due_date,
              dStr,
              newWorkload,
              planningCapacityMins
            );

            const rationale = `Repair Pass: Scheduled for ${team.name} on ${dStr}.`;

            pv.scheduled_date = dStr;
            pv.assigned_team_id = team.id;
            pv.status = "planned";
            pv.constraint_state = constraintValidation.state;
            pv.constraint_notes = constraintValidation.notes;
            pv.unscheduled_reason = null;
            pv.planner_rationale = rationale;
            pv.estimated_travel_mins = travelCost;

            assignments.push({
              site_id: site.id,
              team_id: team.id,
              target_date: pv.target_due_date,
              scheduled_date: dStr,
              sequence_order: seq,
              estimated_cleaning_mins: pv.estimated_cleaning_mins,
              estimated_travel_mins: travelCost,
              estimated_distance_km: isFirstLocVisit ? pv.estimated_distance_km : 0,
              constraint_state: constraintValidation.state,
              constraint_notes: constraintValidation.notes,
              scheduler_rationale: rationale,
            });

            // Remove from unscheduledSites array
            const unschIdx = unscheduledSites.findIndex((u) => u.site.id === site.id && u.targetDate === pv.target_due_date);
            if (unschIdx >= 0) unscheduledSites.splice(unschIdx, 1);

            repaired = true;
            break;
          }
        }
      }
    }
  }

  return {
    assignments,
    proposedVisits,
    unconfiguredSites,
    unscheduledSites,
    rationaleLog,
    clusters,
    auditReport,
  };
}
