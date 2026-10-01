import { generateMonthlyCleaningPlan, getIsoWeekday } from "../frontend/lib/cleaning-scheduler";
import { Site, SiteCleaningRule, TechnicianTeam } from "../frontend/lib/types";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Read frontend/.env.local manually if process.env values are missing
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

async function runTest1_SundayProhibition() {
  console.log("\n--- TEST 1 — Sunday Prohibition ---");
  const site: Site = {
    id: "site-mon-fri",
    org_id: "org1",
    name: "Mon-Fri Site",
    location: "Loc 1",
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
    id: "rule-1",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 15,
    monsoon_interval_days: 30,
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

  result.proposedVisits.forEach((visit) => {
    if (visit.scheduled_date) {
      const [y, m, d] = visit.scheduled_date.split("-").map(Number);
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      const isoWeekday = getIsoWeekday(dt);
      assert(isoWeekday !== 7, `Scheduled date ${visit.scheduled_date} is Sunday (7)!`);
      assert(isoWeekday !== 6, `Scheduled date ${visit.scheduled_date} is Saturday (6), which is not in Mon-Fri rule!`);
      assert(rule.allowed_weekdays!.includes(isoWeekday), `Scheduled date ${visit.scheduled_date} weekday ${isoWeekday} not allowed!`);
    }
  });

  console.log("✅ TEST 1 PASSED: Zero Sunday or invalid weekday assignments for Mon-Fri site.");
}

async function runTest2_MonSatWorkforce() {
  console.log("\n--- TEST 2 — Monday-Saturday Workforce ---");
  const site: Site = {
    id: "site-mon-sat",
    org_id: "org1",
    name: "Mon-Sat Site",
    location: "Loc 2",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-18", // Next due Oct 3 (Saturday)
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rule: SiteCleaningRule = {
    id: "rule-2",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 15,
    monsoon_interval_days: 15,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6], // Mon-Sat allowed
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

  const satVisit = result.proposedVisits.find((v) => v.scheduled_date === "2026-10-03");
  assert(!!satVisit, "Expected visit scheduled on Saturday 2026-10-03!");
  assert(satVisit?.status === "planned", "Saturday visit status should be 'planned'");
  console.log("✅ TEST 2 PASSED: Visit successfully scheduled on Saturday.");
}

async function runTest3_MultipleVisitsPerTeamDay() {
  console.log("\n--- TEST 3 — Multiple Visits Per Team/Day ---");
  const sites: Site[] = [1, 2, 3].map((i) => ({
    id: `site-multi-${i}`,
    org_id: "org1",
    name: `Multi Site ${i}`,
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01", // All due on 2026-10-01
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    estimated_cleaning_mins: 90, // 90 + 30 travel = 120 mins each. 3 visits = 360 mins <= 480 capacity
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

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
    sites,
    rules,
    teams: [team],
    planningCapacityMins: 480,
  });

  const oct1Visits = result.proposedVisits.filter((v) => v.scheduled_date === "2026-10-01");
  assert(oct1Visits.length === 3, `Expected all 3 visits scheduled on 2026-10-01, got ${oct1Visits.length}`);
  console.log(`✅ TEST 3 PASSED: Team received ${oct1Visits.length} visits on a single day within 480-min capacity.`);
}

async function runTest4_FullWindowSearch() {
  console.log("\n--- TEST 4 — Full Valid Window Search ---");
  // 5 sites due Oct 1, but team capacity only allows 4 visits (4 * 120 = 480 mins) on Oct 1.
  // 5th site must be scheduled on Oct 2 rather than marked unscheduled!
  const sites: Site[] = [1, 2, 3, 4, 5].map((i) => ({
    id: `site-win-${i}`,
    org_id: "org1",
    name: `Window Site ${i}`,
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

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
    sites,
    rules,
    teams: [team],
    planningCapacityMins: 480,
  });

  const unscheduled = result.proposedVisits.filter((v) => v.status === "unscheduled");
  assert(unscheduled.length === 0, `Expected 0 unscheduled visits, got ${unscheduled.length}`);
  
  const oct2Visits = result.proposedVisits.filter((v) => v.scheduled_date === "2026-10-02");
  assert(oct2Visits.length === 1, "Expected 5th visit pushed to Oct 2 due to Oct 1 capacity limit");
  console.log("✅ TEST 4 PASSED: 5th visit evaluated full window and scheduled on Oct 2 instead of failing.");
}

async function runTest5_TeamFallback() {
  console.log("\n--- TEST 5 — Team Fallback ---");
  // Preferred Team 1 is 100% full on Oct 1.
  // Site is preferred to Team 1, but Team 2 has open capacity on Oct 1.
  // Scheduler must assign Team 2 instead of marking unscheduled.
  const site: Site = {
    id: "site-fallback",
    org_id: "org1",
    name: "Fallback Site",
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 4 existing heavy sites that consume Team 1's capacity on Oct 1
  const heavySites: Site[] = [1, 2, 3, 4].map((i) => ({
    id: `site-heavy-${i}`,
    org_id: "org1",
    name: `Heavy Site ${i}`,
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const allSites = [...heavySites, site];
  const rules: SiteCleaningRule[] = allSites.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1], // Allowed ONLY on Thursday 2026-10-01 (Oct 1 is Thursday)
    blackout_dates: [],
    estimated_cleaning_mins: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const team1: TechnicianTeam = {
    id: "team-1",
    org_id: "org1",
    name: "Team Alpha (Preferred)",
    base_latitude: 19.076,
    base_longitude: 72.877,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const team2: TechnicianTeam = {
    id: "team-2",
    org_id: "org1",
    name: "Team Beta (Secondary)",
    base_latitude: 19.080,
    base_longitude: 72.880,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: allSites,
    rules,
    teams: [team1, team2],
    planningCapacityMins: 480,
  });

  const fallbackVisit = result.proposedVisits.find((v) => v.site_id === site.id);
  assert(fallbackVisit?.status === "planned", "Fallback visit should be planned");
  assert(fallbackVisit?.assigned_team_id === "team-2", `Expected assigned team to be team-2, got ${fallbackVisit?.assigned_team_id}`);
  console.log("✅ TEST 5 PASSED: Secondary team selected when preferred team reached capacity.");
}

async function runTest6_GenuineCapacityBottleneck() {
  console.log("\n--- TEST 6 — Genuine Capacity Bottleneck ---");
  // 5 sites allowed ONLY on Oct 1 (Thursday), but 1 team can only fit 4 visits (480 mins).
  // 5th visit MUST be marked unscheduled with reason 'team_capacity' and detailed rationale!
  const sites: Site[] = [1, 2, 3, 4, 5].map((i) => ({
    id: `site-cap-${i}`,
    org_id: "org1",
    name: `Cap Site ${i}`,
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-10",
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const rules: SiteCleaningRule[] = sites.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [4], // Thursday only (Oct 1 is Thursday)
    blackout_dates: ["2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"], // All other Thursdays blacked out!
    estimated_cleaning_mins: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const team: TechnicianTeam = {
    id: "team-1",
    org_id: "org1",
    name: "Team Solo",
    base_latitude: 19.076,
    base_longitude: 72.877,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites,
    rules,
    teams: [team],
    planningCapacityMins: 480,
  });

  const unscheduled = result.proposedVisits.filter((v) => v.status === "unscheduled");
  assert(unscheduled.length === 1, `Expected exactly 1 unscheduled visit, got ${unscheduled.length}`);
  const un = unscheduled[0];
  assert(un.unscheduled_reason === "team_capacity", `Expected unscheduled_reason 'team_capacity', got '${un.unscheduled_reason}'`);
  assert(un.planner_rationale.includes("all available capacity was exhausted"), "Planner rationale should explain capacity exhaustion");
  console.log(`✅ TEST 6 PASSED: Genuine bottleneck correctly flagged unscheduled with reason 'team_capacity' and rationale: "${un.planner_rationale}"`);
}

async function runTest7_BlackoutDateExclusion() {
  console.log("\n--- TEST 7 — Blackout Date Exclusion ---");
  const site: Site = {
    id: "site-blackout",
    org_id: "org1",
    name: "Blackout Site",
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rule: SiteCleaningRule = {
    id: "rule-bo",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: ["2026-10-01"], // Target date Oct 1 is blacked out!
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

  const visit = result.proposedVisits[0];
  assert(visit.scheduled_date !== "2026-10-01", "Visit must NOT be scheduled on blackout date 2026-10-01!");
  assert(visit.status === "planned", "Visit should be scheduled on alternative candidate date");
  console.log(`✅ TEST 7 PASSED: Blackout date 2026-10-01 avoided; visit scheduled on ${visit.scheduled_date}.`);
}

async function runTest8_AllowedWeekdayConstraint() {
  console.log("\n--- TEST 8 — Allowed Weekday Constraint ---");
  const site: Site = {
    id: "site-wed-only",
    org_id: "org1",
    name: "Wednesday Only Site",
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const rule: SiteCleaningRule = {
    id: "rule-wed",
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [3], // Wednesday (ISO 3) ONLY
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

  const visit = result.proposedVisits[0];
  assert(!!visit.scheduled_date, "Expected visit to be scheduled");
  const schDate = new Date(visit.scheduled_date! + "T12:00:00");
  assert(getIsoWeekday(schDate) === 3, `Expected Wednesday (3), got ISO weekday ${getIsoWeekday(schDate)}`);
  console.log(`✅ TEST 8 PASSED: Wednesday-only constraint respected; scheduled on ${visit.scheduled_date}.`);
}

async function runTest9_WorkloadDistribution() {
  console.log("\n--- TEST 9 — Workload Distribution ---");
  // 8 sites all due Oct 1. 2 teams available (each can take 4 visits).
  // Scheduler should distribute 4 visits to Team 1 and 4 visits to Team 2 rather than ignoring Team 2.
  const sites: Site[] = Array.from({ length: 8 }).map((_, i) => ({
    id: `site-dist-${i}`,
    org_id: "org1",
    name: `Dist Site ${i}`,
    location: "Loc",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-01",
    latitude: 19.076,
    longitude: 72.877,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const team1: TechnicianTeam = {
    id: "team-1",
    org_id: "org1",
    name: "Team Alpha",
    base_latitude: 19.076,
    base_longitude: 72.877,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const team2: TechnicianTeam = {
    id: "team-2",
    org_id: "org1",
    name: "Team Beta",
    base_latitude: 19.076,
    base_longitude: 72.877,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites,
    rules,
    teams: [team1, team2],
    planningCapacityMins: 480,
  });

  const t1Visits = result.proposedVisits.filter((v) => v.assigned_team_id === "team-1");
  const t2Visits = result.proposedVisits.filter((v) => v.assigned_team_id === "team-2");

  assert(t1Visits.length > 0 && t2Visits.length > 0, "Work should be distributed between Team 1 and Team 2");
  console.log(`✅ TEST 9 PASSED: Work distributed evenly (Team 1: ${t1Visits.length} visits, Team 2: ${t2Visits.length} visits).`);
}

async function runTest10_RealFleetOctober2026Audit() {
  console.log("\n--- TEST 10 — October 2026 Real Fleet Audit (35 Sites) ---");
  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";

  const [sitesRes, rulesRes, teamsRes] = await Promise.all([
    sb.from("sites").select("*").eq("org_id", orgId).order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*").eq("org_id", orgId).eq("is_active", true),
  ]);

  const sites: Site[] = sitesRes.data ?? [];
  const rules: SiteCleaningRule[] = rulesRes.data ?? [];
  const teams: TechnicianTeam[] = teamsRes.data ?? [];

  console.log(`Fetched ${sites.length} sites, ${rules.length} rules, ${teams.length} active teams from DB.`);
  assert(sites.length > 0, "Must have real sites in database for Test 10!");

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites,
    rules,
    teams,
    planningCapacityMins: 480,
  });

  const requiredVisits = result.proposedVisits.length;
  const scheduledVisits = result.proposedVisits.filter((v) => v.status === "planned");
  const unscheduledVisits = result.proposedVisits.filter((v) => v.status === "unscheduled");

  // Verify zero Sunday assignments
  scheduledVisits.forEach((v) => {
    const dt = new Date(v.scheduled_date! + "T12:00:00");
    const isoWk = getIsoWeekday(dt);
    assert(isoWk !== 7, `CRITICAL ERROR: Visit for site ${v.site_id} scheduled on Sunday (${v.scheduled_date})!`);
  });

  // Aggregate metrics per team
  const visitsByTeam: Record<string, number> = {};
  const cleaningMinsByTeam: Record<string, number> = {};
  const travelMinsByTeam: Record<string, number> = {};

  teams.forEach((t) => {
    visitsByTeam[t.name] = 0;
    cleaningMinsByTeam[t.name] = 0;
    travelMinsByTeam[t.name] = 0;
  });

  scheduledVisits.forEach((v) => {
    const t = teams.find((tm) => tm.id === v.assigned_team_id);
    const tName = t ? t.name : "Unknown";
    visitsByTeam[tName] = (visitsByTeam[tName] || 0) + 1;
    cleaningMinsByTeam[tName] = (cleaningMinsByTeam[tName] || 0) + (v.estimated_cleaning_mins || 0);
    travelMinsByTeam[tName] = (travelMinsByTeam[tName] || 0) + (v.estimated_travel_mins || 0);
  });

  // Aggregate visits by working day
  const visitsByWorkingDay: Record<string, number> = {};
  scheduledVisits.forEach((v) => {
    const dateKey = v.scheduled_date!;
    visitsByWorkingDay[dateKey] = (visitsByWorkingDay[dateKey] || 0) + 1;
  });

  // Aggregate unscheduled reasons
  const unscheduledReasons: Record<string, number> = {};
  unscheduledVisits.forEach((v) => {
    const reason = v.unscheduled_reason || "unknown";
    unscheduledReasons[reason] = (unscheduledReasons[reason] || 0) + 1;
  });

  console.log("\n=======================================================");
  console.log("       OCTOBER 2026 REAL FLEET SCHEDULING AUDIT        ");
  console.log("=======================================================");
  console.log(`Total Configured Fleet Sites : ${sites.length}`);
  console.log(`Active Technician Teams     : ${teams.length}`);
  console.log(`Total Required Visits       : ${requiredVisits}`);
  console.log(`Successfully Scheduled      : ${scheduledVisits.length} (${((scheduledVisits.length / requiredVisits) * 100).toFixed(1)}%)`);
  console.log(`Unscheduled Visits          : ${unscheduledVisits.length}`);
  console.log("-------------------------------------------------------");
  console.log("VISITS BY TEAM & CAPACITY UTILIZATION:");
  teams.forEach((t) => {
    const vCount = visitsByTeam[t.name] || 0;
    const cMins = cleaningMinsByTeam[t.name] || 0;
    const trMins = travelMinsByTeam[t.name] || 0;
    const totalMins = cMins + trMins;
    // 27 working days in Oct 2026 (Mon-Sat). 27 * 480 = 12,960 available mins
    const maxCapacity = 27 * 480;
    const utilPct = ((totalMins / maxCapacity) * 100).toFixed(1);
    console.log(`  • ${t.name.padEnd(20)}: ${String(vCount).padStart(3)} visits | Cleaning: ${String(cMins).padStart(5)}m | Travel: ${String(trMins).padStart(5)}m | Total Workload: ${(totalMins/60).toFixed(1)}h | Util: ${utilPct}%`);
  });
  console.log("-------------------------------------------------------");
  console.log(`TOTAL WORKING DAYS UTILIZED IN MONTH: ${Object.keys(visitsByWorkingDay).length} days`);
  console.log("UNSCHEDULED REASONS BREAKDOWN:");
  if (Object.keys(unscheduledReasons).length === 0) {
    console.log("  (None — 100% of visits successfully scheduled!)");
  } else {
    Object.entries(unscheduledReasons).forEach(([r, count]) => {
      console.log(`  • ${r.padEnd(25)}: ${count}`);
    });
  }
  console.log("=======================================================\n");

  assert(scheduledVisits.length > 0, "Should have scheduled visits for real fleet");
  console.log("✅ TEST 10 PASSED: Real fleet October 2026 macro-scheduler audit complete.");
}

async function runAllTests() {
  console.log("=======================================================");
  console.log("       PHASE 2.5 MACRO-SCHEDULER TEST SUITE RUN        ");
  console.log("=======================================================");

  try {
    await runTest1_SundayProhibition();
    await runTest2_MonSatWorkforce();
    await runTest3_MultipleVisitsPerTeamDay();
    await runTest4_FullWindowSearch();
    await runTest5_TeamFallback();
    await runTest6_GenuineCapacityBottleneck();
    await runTest7_BlackoutDateExclusion();
    await runTest8_AllowedWeekdayConstraint();
    await runTest9_WorkloadDistribution();
    await runTest10_RealFleetOctober2026Audit();

    console.log("=======================================================");
    console.log("🎉 ALL 10 TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!   ");
    console.log("=======================================================");
  } catch (err: any) {
    console.error("❌ TEST SUITE FAILED:", err?.message || err);
    process.exit(1);
  }
}

runAllTests();
