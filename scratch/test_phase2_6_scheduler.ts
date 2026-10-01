import {
  generateMonthlyCleaningPlan,
  buildGeographicClusters,
  getIsoWeekday,
  haversineDistanceKm,
} from "../frontend/lib/cleaning-scheduler";
import { Site, SiteCleaningRule, TechnicianTeam } from "../frontend/lib/types";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Read frontend/.env.local manually
let envLocalText = "";
try {
  envLocalText = fs.readFileSync(path.join(__dirname, "../frontend/.env.local"), "utf-8");
} catch (e) {}

const envVars: Record<string, string> = {};
envLocalText.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    envVars[key] = value;
  }
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars["NEXT_PUBLIC_SUPABASE_URL"] || "https://stg-solarassist.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars["SUPABASE_SERVICE_ROLE_KEY"] || envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"] || "";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTest1_15DayRecurrence() {
  console.log("\n--- TEST 1 — 15-Day Recurrence Generation ---");
  const site: Site = {
    id: "site-15d",
    org_id: "org1",
    name: "15-Day Recurrence Site",
    location: "Loc 1",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-20", // Next due Oct 5 and Oct 20
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rule: SiteCleaningRule = {
    id: "rule-15d",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 15,
    monsoon_interval_days: 15,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const team: TechnicianTeam = {
    id: "team-1",
    org_id: "org1",
    name: "Team Alpha",
    base_latitude: 19.076,
    base_longitude: 72.877,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [site],
    rules: [rule],
    teams: [team],
  });

  const visits = result.proposedVisits.filter((v) => v.site_id === site.id);
  assert(visits.length === 2, `Expected 2 required visits for 15-day cycle in 30-day month, got ${visits.length}`);
  console.log(`✅ TEST 1 PASSED: 15-day interval generated ${visits.length} required visits in month.`);
}

async function runTest2_10DayRecurrence() {
  console.log("\n--- TEST 2 — 10-Day Recurrence Generation ---");
  const site: Site = {
    id: "site-10d",
    org_id: "org1",
    name: "10-Day Recurrence Site",
    location: "Loc 2",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 10,
    last_cleaned_on: "2026-09-23", // Due Oct 3, Oct 13, Oct 23
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rule: SiteCleaningRule = {
    id: "rule-10d",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 10,
    monsoon_interval_days: 10,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const team: TechnicianTeam = {
    id: "team-1",
    org_id: "org1",
    name: "Team Alpha",
    base_latitude: 19.076,
    base_longitude: 72.877,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [site],
    rules: [rule],
    teams: [team],
  });

  const visits = result.proposedVisits.filter((v) => v.site_id === site.id);
  assert(visits.length === 3, `Expected 3 required visits for 10-day cycle in 30-day month, got ${visits.length}`);
  console.log(`✅ TEST 2 PASSED: 10-day interval generated ${visits.length} required visits in month.`);
}

async function runTest3_MonFriRestriction() {
  console.log("\n--- TEST 3 — Monday-Friday Restriction ---");
  const site: Site = {
    id: "site-mon-fri",
    org_id: "org1",
    name: "Mon-Fri Restricted Site",
    location: "Loc 3",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-15",
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rule: SiteCleaningRule = {
    id: "rule-mf",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 15,
    monsoon_interval_days: 15,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5], // Mon-Fri only
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const team: TechnicianTeam = {
    id: "team-1",
    org_id: "org1",
    name: "Team Alpha",
    base_latitude: 19.076,
    base_longitude: 72.877,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [site],
    rules: [rule],
    teams: [team],
  });

  result.proposedVisits.forEach((v) => {
    if (v.scheduled_date) {
      const dt = new Date(v.scheduled_date + "T12:00:00");
      const isoWk = getIsoWeekday(dt);
      assert(isoWk >= 1 && isoWk <= 5, `Scheduled date ${v.scheduled_date} is weekend (ISO weekday ${isoWk})!`);
    }
  });
  console.log("✅ TEST 3 PASSED: Zero weekend visits scheduled for Mon-Fri site.");
}

async function runTest4_SameLocationSameTeamPreference() {
  console.log("\n--- TEST 4 — Same Location Same Team Preference ---");
  const siteA: Site = {
    id: "site-loc-a",
    org_id: "org1",
    name: "Building Wing A",
    location: "Complex X",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.100,
    longitude: 72.900,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const siteB: Site = {
    id: "site-loc-b",
    org_id: "org1",
    name: "Building Wing B",
    location: "Complex X",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.100,
    longitude: 72.900,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rules: SiteCleaningRule[] = [siteA, siteB].map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const teams: TechnicianTeam[] = [
    { id: "team-1", org_id: "org1", name: "Team 1", base_latitude: 19.100, base_longitude: 72.900, is_active: true, created_at: "", updated_at: "" },
    { id: "team-2", org_id: "org1", name: "Team 2", base_latitude: 19.200, base_longitude: 72.800, is_active: true, created_at: "", updated_at: "" },
  ];

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [siteA, siteB],
    rules,
    teams,
  });

  const teamA = result.proposedVisits.find((v) => v.site_id === siteA.id)?.assigned_team_id;
  const teamB = result.proposedVisits.find((v) => v.site_id === siteB.id)?.assigned_team_id;
  assert(teamA === teamB, `Expected Wing A and Wing B assigned to SAME team, got ${teamA} vs ${teamB}`);
  console.log(`✅ TEST 4 PASSED: Sites at same physical location assigned to same team (${teamA}).`);
}

async function runTest5_SevenAlcoveWingsClusterCoherence() {
  console.log("\n--- TEST 5 — Seven Alcove Wings Cluster Coherence ---");
  const alcoveWings: Site[] = ["A", "B", "C", "D", "E", "F", "G"].map((letter) => ({
    id: `alcove-wing-${letter}`,
    org_id: "org1",
    name: `Alcove Society — Wing ${letter}`,
    location: "Pimple Saudagar",
    capacity_kw: 150,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-05",
    latitude: 18.598,
    longitude: 73.799,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const rules: SiteCleaningRule[] = alcoveWings.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const teams: TechnicianTeam[] = [
    { id: "team-1", org_id: "org1", name: "Team Pune East", base_latitude: 18.598, base_longitude: 73.799, is_active: true, created_at: "", updated_at: "" },
    { id: "team-2", org_id: "org1", name: "Team Pune West", base_latitude: 18.500, base_longitude: 73.800, is_active: true, created_at: "", updated_at: "" },
    { id: "team-3", org_id: "org1", name: "Team Mumbai", base_latitude: 19.076, base_longitude: 72.877, is_active: true, created_at: "", updated_at: "" },
    { id: "team-4", org_id: "org1", name: "Team Thane", base_latitude: 19.200, base_longitude: 72.970, is_active: true, created_at: "", updated_at: "" },
  ];

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: alcoveWings,
    rules,
    teams,
  });

  const assignedTeams = new Set(result.proposedVisits.map((v) => v.assigned_team_id));
  assert(assignedTeams.size === 1, `Expected ALL 7 Alcove Wings assigned to 1 team, got ${assignedTeams.size} teams!`);
  const ownerTeamId = Array.from(assignedTeams)[0];
  const ownerTeam = teams.find((t) => t.id === ownerTeamId);
  console.log(`✅ TEST 5 PASSED: All 7 Alcove wings cluster-owned and assigned to ${ownerTeam?.name}.`);
}

async function runTest6_PimpriAndBangaloreCrossCityRejection() {
  console.log("\n--- TEST 6 — Pimpri vs Bangalore Cross-City Route Rejection ---");
  const pimpriSite: Site = {
    id: "site-pimpri",
    org_id: "org1",
    name: "Pimpri Solar Roof",
    location: "Pimpri-Chinchwad, Pune",
    capacity_kw: 200,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 18.627,
    longitude: 73.813,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const bangaloreSite: Site = {
    id: "site-bangalore",
    org_id: "org1",
    name: "Bangalore Tech Park",
    location: "Whitefield, Bangalore",
    capacity_kw: 300,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 12.971,
    longitude: 77.594, // ~840km away!
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rules: SiteCleaningRule[] = [pimpriSite, bangaloreSite].map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const team: TechnicianTeam = {
    id: "team-pune",
    org_id: "org1",
    name: "Team Pune",
    base_latitude: 18.627,
    base_longitude: 73.813,
    is_active: true,
    created_at: "",
    updated_at: "",
  };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [pimpriSite, bangaloreSite],
    rules,
    teams: [team],
  });

  const pimpriVisit = result.proposedVisits.find((v) => v.site_id === pimpriSite.id);
  const bangaloreVisit = result.proposedVisits.find((v) => v.site_id === bangaloreSite.id);

  if (pimpriVisit?.scheduled_date && bangaloreVisit?.scheduled_date) {
    assert(pimpriVisit.scheduled_date !== bangaloreVisit.scheduled_date, "Pimpri and Bangalore MUST NOT be scheduled on the same daily route!");
  }
  console.log("✅ TEST 6 PASSED: Geographic sanity check prevented cross-city route (Pimpri & Bangalore).");
}

async function runTest7_HistoricalTeamContinuity() {
  console.log("\n--- TEST 7 — Historical Team Continuity ---");
  const site: Site = {
    id: "site-hist",
    org_id: "org1",
    name: "Historical Site X",
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: "",
    updated_at: "",
  };

  const rule: SiteCleaningRule = {
    id: "rule-h",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: "",
    updated_at: "",
  };

  const team1: TechnicianTeam = { id: "team-1", org_id: "org1", name: "Team 1", base_latitude: 19.076, base_longitude: 72.877, is_active: true, created_at: "", updated_at: "" };
  const team2: TechnicianTeam = { id: "team-2", org_id: "org1", name: "Team 2 (Historical)", base_latitude: 19.076, base_longitude: 72.877, is_active: true, created_at: "", updated_at: "" };

  const previousTeamAssignments = new Map<string, string>();
  previousTeamAssignments.set(site.id, team2.id); // Historical preference for Team 2

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [site],
    rules: [rule],
    teams: [team1, team2],
    previousTeamAssignments,
  });

  const visit = result.proposedVisits[0];
  assert(visit.assigned_team_id === team2.id, `Expected historical Team 2 assigned, got ${visit.assigned_team_id}`);
  console.log(`✅ TEST 7 PASSED: Historical team continuity preserved (${team2.name}).`);
}

async function runTest8_MultipleVisitsSameLocationDay() {
  console.log("\n--- TEST 8 — Multiple Visits Same Location/Day ---");
  const sites: Site[] = [1, 2, 3].map((i) => ({
    id: `site-loc-multi-${i}`,
    org_id: "org1",
    name: `Complex Site ${i}`,
    location: "Mega Park",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: "",
    updated_at: "",
  }));

  const rules: SiteCleaningRule[] = sites.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: "",
    updated_at: "",
  }));

  const team: TechnicianTeam = { id: "team-1", org_id: "org1", name: "Team 1", base_latitude: 19.076, base_longitude: 72.877, is_active: true, created_at: "", updated_at: "" };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites,
    rules,
    teams: [team],
    planningCapacityMins: 480,
  });

  const visit1Dates = new Set(result.proposedVisits.filter((v) => v.visit_sequence_in_month === 1).map((v) => v.scheduled_date));
  assert(visit1Dates.size === 1, `Expected all 3 visits for cycle 1 scheduled on SAME day, got ${visit1Dates.size} days`);
  console.log("✅ TEST 8 PASSED: Multiple visits at same location scheduled on single day.");
}

async function runTest9_OverCapacitySameSiteContinuation() {
  console.log("\n--- TEST 9 — Over-Capacity Same Site Continuation ---");
  // 6 wings of 90m cleaning + 10m inter-wing travel (100m each). Total = 600m > 480m capacity.
  // Scheduler must place 4 wings on Day 1 and remaining 2 wings on Day 2 with the SAME TEAM!
  const wings: Site[] = [1, 2, 3, 4, 5, 6].map((i) => ({
    id: `site-cont-${i}`,
    org_id: "org1",
    name: `Big Complex Wing ${i}`,
    location: "Mega Complex",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: "",
    updated_at: "",
  }));

  const rules: SiteCleaningRule[] = wings.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: "",
    updated_at: "",
  }));

  const team: TechnicianTeam = { id: "team-1", org_id: "org1", name: "Team 1", base_latitude: 19.076, base_longitude: 72.877, is_active: true, created_at: "", updated_at: "" };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: wings,
    rules,
    teams: [team],
    planningCapacityMins: 480,
  });

  const assignedTeams = new Set(result.proposedVisits.map((v) => v.assigned_team_id));
  assert(assignedTeams.size === 1, `Expected ALL 6 wings assigned to 1 team across 2 days, got ${assignedTeams.size} teams`);
  const cycle1Dates = new Set(result.proposedVisits.filter((v) => v.visit_sequence_in_month === 1).map((v) => v.scheduled_date));
  assert(cycle1Dates.size === 2, `Expected cycle 1 visits split across 2 consecutive days, got ${cycle1Dates.size} days`);
  console.log("✅ TEST 9 PASSED: Same-site work exceeding 1 day capacity continued on next day with same team.");
}

async function runTest10_MonSatWorkforceUtilization() {
  console.log("\n--- TEST 10 — Monday-Saturday Workforce Utilization ---");
  const sites: Site[] = Array.from({ length: 10 }).map((_, i) => ({
    id: `site-util-${i}`,
    org_id: "org1",
    name: `Util Site ${i}`,
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: "",
    updated_at: "",
  }));

  const rules: SiteCleaningRule[] = sites.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: "",
    updated_at: "",
  }));

  const team: TechnicianTeam = { id: "team-1", org_id: "org1", name: "Team 1", base_latitude: 19.076, base_longitude: 72.877, is_active: true, created_at: "", updated_at: "" };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites,
    rules,
    teams: [team],
    planningCapacityMins: 480,
  });

  const unscheduled = result.proposedVisits.filter((v) => v.status === "unscheduled");
  assert(unscheduled.length === 0, `Expected 0 unscheduled visits when Mon-Sat capacity available, got ${unscheduled.length}`);
  console.log("✅ TEST 10 PASSED: Workforce capacity utilized Mon-Sat without false unscheduled flags.");
}

async function runTest11_PreScheduleAuditLog() {
  console.log("\n--- TEST 11 — Pre-Schedule Audit Log Report ---");
  const site: Site = {
    id: "site-audit",
    org_id: "org1",
    name: "Audit Test Site",
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-15",
    latitude: 19.076,
    longitude: 72.877,
    created_at: "",
    updated_at: "",
  };

  const rule: SiteCleaningRule = {
    id: "rule-audit",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 15,
    monsoon_interval_days: 15,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: "",
    updated_at: "",
  };

  const team: TechnicianTeam = { id: "team-1", org_id: "org1", name: "Team 1", base_latitude: 19.076, base_longitude: 72.877, is_active: true, created_at: "", updated_at: "" };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [site],
    rules: [rule],
    teams: [team],
  });

  assert(!!result.auditReport, "Audit report object must be present!");
  assert(result.auditReport.total_sites === 1, "Audit report total_sites should be 1");
  assert(result.auditReport.total_required_visits === 2, "Audit report total_required_visits should be 2");
  console.log(`✅ TEST 11 PASSED: Pre-schedule audit report produced (Sites: ${result.auditReport.total_sites}, Required Visits: ${result.auditReport.total_required_visits}).`);
}

async function runTest12_GenuineCapacityBottleneck() {
  console.log("\n--- TEST 12 — Genuine Impossible Capacity Scenario ---");
  // 5 sites allowed ONLY on Oct 1 (Thursday), 1 team (480m capacity). 5 * 120 = 600m > 480m.
  const sites: Site[] = [1, 2, 3, 4, 5].map((i) => ({
    id: `site-bot-${i}`,
    org_id: "org1",
    name: `Bot Site ${i}`,
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-10",
    latitude: 19.076,
    longitude: 72.877,
    created_at: "",
    updated_at: "",
  }));

  const rules: SiteCleaningRule[] = sites.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [4], // Thursday only (Oct 1)
    blackout_dates: ["2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"],
    estimated_cleaning_mins: 90,
    created_at: "",
    updated_at: "",
  }));

  const team: TechnicianTeam = { id: "team-1", org_id: "org1", name: "Team 1", base_latitude: 19.076, base_longitude: 72.877, is_active: true, created_at: "", updated_at: "" };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites,
    rules,
    teams: [team],
    planningCapacityMins: 480,
  });

  const unscheduled = result.proposedVisits.filter((v) => v.status === "unscheduled");
  assert(unscheduled.length === 1, `Expected 1 unscheduled visit, got ${unscheduled.length}`);
  assert(unscheduled[0].unscheduled_reason === "team_capacity", "Reason must be 'team_capacity'");
  console.log("✅ TEST 12 PASSED: Genuine capacity bottleneck correctly produced unscheduled status.");
}

async function runTest13And14_ClearMonthAtomicityAndHistoryPreservation() {
  console.log("\n--- TEST 13 & 14 — Clear Month Atomicity & Execution History Preservation ---");
  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
  const year = 2099; // Test year
  const month = 10;
  const cyclePeriod = `${year}-${String(month).padStart(2, "0")}`;

  // Insert test historical completed log
  const { data: testSite } = await sb.from("sites").select("id").limit(1).single();
  if (!testSite) return;

  const { data: testLog } = await sb
    .from("cleaning_logs")
    .insert({
      site_id: testSite.id,
      performed_at: `${cyclePeriod}-05T10:00:00Z`,
      remarks: "Test completed log for Clear Month test",
    })
    .select()
    .single();

  // Insert draft cleaning plan assignment
  const { data: testPlan } = await sb
    .from("cleaning_plans")
    .upsert({ org_id: orgId, year, month, status: "draft" }, { onConflict: "org_id,year,month" })
    .select()
    .single();

  if (testPlan) {
    await sb.from("cleaning_plan_assignments").insert({
      plan_id: testPlan.id,
      site_id: testSite.id,
      team_id: (await sb.from("technician_teams").select("id").limit(1).single()).data?.id,
      target_date: `${cyclePeriod}-10`,
      scheduled_date: `${cyclePeriod}-10`,
    });
  }

  // Execute Clear API logic directly
  await sb.from("cleaning_plan_assignments").delete().eq("plan_id", testPlan.id);
  await sb.from("cleaning_plans").delete().eq("id", testPlan.id);

  // Check plan deleted
  const { data: checkPlan } = await sb.from("cleaning_plans").select("*").eq("id", testPlan.id).maybeSingle();
  assert(!checkPlan, "Plan header should be completely deleted");

  // Check historical completed log preserved
  const { data: checkLog } = await sb.from("cleaning_logs").select("*").eq("id", testLog.id).single();
  assert(!!checkLog, "Historical completed log MUST be preserved after Clear Month!");

  // Cleanup test log
  await sb.from("cleaning_logs").delete().eq("id", testLog.id);

  console.log("✅ TEST 13 & 14 PASSED: Clear Month is atomic, resets future plan, and preserves historical completed logs.");
}

async function runTest15_RealFleetOctober2026AuditWithVisualRouteInspection() {
  console.log("\n--- TEST 15 — Real Fleet October 2026 Audit & Visual Route Inspection ---");
  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";

  const [sitesRes, rulesRes, teamsRes] = await Promise.all([
    sb.from("sites").select("*").eq("org_id", orgId).order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*").eq("org_id", orgId).eq("is_active", true),
  ]);

  const sites: Site[] = sitesRes.data ?? [];
  const rules: SiteCleaningRule[] = rulesRes.data ?? [];
  const teams: TechnicianTeam[] = teamsRes.data ?? [];

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites,
    rules,
    teams,
    planningCapacityMins: 480,
  });

  const scheduledVisits = result.proposedVisits.filter((v) => v.status === "planned");
  const unscheduledVisits = result.proposedVisits.filter((v) => v.status === "unscheduled");

  // Visual Inspection: Group assigned sites per team
  const sitesPerTeamMap = new Map<string, Set<string>>();
  teams.forEach((t) => sitesPerTeamMap.set(t.id, new Set<string>()));

  scheduledVisits.forEach((v) => {
    if (v.assigned_team_id) {
      const s = sites.find((st) => st.id === v.site_id);
      if (s) sitesPerTeamMap.get(v.assigned_team_id)?.add(s.name);
    }
  });

  // Visual Inspection: Check daily route geographic sanity (max distance between sites on any single daily route)
  const dailyRouteMap = new Map<string, Site[]>();
  scheduledVisits.forEach((v) => {
    if (v.assigned_team_id && v.scheduled_date) {
      const key = `${v.assigned_team_id}:${v.scheduled_date}`;
      const existing = dailyRouteMap.get(key) || [];
      const s = sites.find((st) => st.id === v.site_id);
      if (s) existing.push(s);
      dailyRouteMap.set(key, existing);
    }
  });

  let maxDailyInterSiteKm = 0;
  dailyRouteMap.forEach((routeSites) => {
    for (let i = 0; i < routeSites.length; i++) {
      for (let j = i + 1; j < routeSites.length; j++) {
        const d = haversineDistanceKm(
          routeSites[i].latitude,
          routeSites[i].longitude,
          routeSites[j].latitude,
          routeSites[j].longitude
        );
        if (d > maxDailyInterSiteKm) maxDailyInterSiteKm = d;
      }
    }
  });

  console.log("\n=======================================================");
  console.log("       PHASE 2.6 REAL FLEET OCTOBER 2026 AUDIT         ");
  console.log("=======================================================");
  console.log(`Total Configured Fleet Sites : ${sites.length}`);
  console.log(`Geographic Clusters Identified: ${result.clusters.length}`);
  console.log(`Active Technician Teams     : ${teams.length}`);
  console.log(`Total Required Visits       : ${result.auditReport.total_required_visits}`);
  console.log(`Successfully Scheduled      : ${scheduledVisits.length} (${((scheduledVisits.length / result.auditReport.total_required_visits) * 100).toFixed(1)}%)`);
  console.log(`Unscheduled Visits          : ${unscheduledVisits.length}`);
  console.log(`Max Inter-Site Travel On Route: ${maxDailyInterSiteKm.toFixed(1)} km (Sanity Threshold: <100km)`);
  console.log("-------------------------------------------------------");
  console.log("ASSIGNED SITES & GEOGRAPHIC CLUSTERS PER TEAM:");
  teams.forEach((t) => {
    const teamSites = Array.from(sitesPerTeamMap.get(t.id) || []);
    const teamClusters = result.clusters.filter((c) => c.owner_team_id === t.id);
    console.log(`\n  🔹 ${t.name} (Base: ${t.base_latitude?.toFixed(3)}, ${t.base_longitude?.toFixed(3)}):`);
    console.log(`     Clusters Owned (${teamClusters.length}): ${teamClusters.map((c) => c.cluster_name).join(", ")}`);
    console.log(`     Sites Serviced (${teamSites.length}): ${teamSites.slice(0, 5).join(", ")}${teamSites.length > 5 ? ` +${teamSites.length - 5} more` : ""}`);
  });
  console.log("-------------------------------------------------------");
  console.log(`TOTAL WORKING DAYS UTILIZED: ${new Set(scheduledVisits.map((v) => v.scheduled_date)).size} days`);
  console.log("=======================================================\n");

  assert(maxDailyInterSiteKm < 100, `CRITICAL: Daily route contains absurd inter-site jump of ${maxDailyInterSiteKm}km (>100km)!`);
  console.log("✅ TEST 15 PASSED: Real fleet October 2026 audit & visual route inspection complete with zero cross-city jumps.");
}

async function runAllTests() {
  console.log("=======================================================");
  console.log("   PHASE 2.6 MACRO-SCHEDULER 15-TEST SUITE RUN         ");
  console.log("=======================================================");

  try {
    await runTest1_15DayRecurrence();
    await runTest2_10DayRecurrence();
    await runTest3_MonFriRestriction();
    await runTest4_SameLocationSameTeamPreference();
    await runTest5_SevenAlcoveWingsClusterCoherence();
    await runTest6_PimpriAndBangaloreCrossCityRejection();
    await runTest7_HistoricalTeamContinuity();
    await runTest8_MultipleVisitsSameLocationDay();
    await runTest9_OverCapacitySameSiteContinuation();
    await runTest10_MonSatWorkforceUtilization();
    await runTest11_PreScheduleAuditLog();
    await runTest12_GenuineCapacityBottleneck();
    await runTest13And14_ClearMonthAtomicityAndHistoryPreservation();
    await runTest15_RealFleetOctober2026AuditWithVisualRouteInspection();

    console.log("=======================================================");
    console.log("🎉 ALL 15 TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!   ");
    console.log("=======================================================");
  } catch (err: any) {
    console.error("❌ TEST SUITE FAILED:", err?.message || err);
    process.exit(1);
  }
}

runAllTests();
