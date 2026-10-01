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

// GENERAL INVARIANT 1: Daily Workload <= 480 Minutes including Travel
function assertWorkloadCapacityInvariant(result: ReturnType<typeof generateMonthlyCleaningPlan>, capacityCap = 480) {
  const dailyWorkloadMap = new Map<string, number>();
  result.proposedVisits.forEach((v) => {
    if (v.scheduled_date && v.assigned_team_id && v.status === "planned") {
      const key = `${v.assigned_team_id}:${v.scheduled_date}`;
      const work = (v.estimated_cleaning_mins || 0) + (v.estimated_travel_mins || 0);
      dailyWorkloadMap.set(key, (dailyWorkloadMap.get(key) || 0) + work);
    }
  });

  dailyWorkloadMap.forEach((totalWork, key) => {
    const [teamId, dateStr] = key.split(":");
    assert(
      totalWork <= capacityCap,
      `INVARIANT VIOLATION: Team ${teamId} on date ${dateStr} has total workload of ${totalWork} mins (exceeds ${capacityCap}m cap!)`
    );
  });
}

// GENERAL INVARIANT 2: Location Exclusivity (One Team per location per day)
function assertLocationExclusivity(result: ReturnType<typeof generateMonthlyCleaningPlan>, sites: Site[]) {
  const clusters = buildGeographicClusters(sites);
  const siteClusterMap = new Map<string, string>();
  clusters.forEach((c) => {
    c.sites.forEach((s) => siteClusterMap.set(s.id, c.cluster_id));
  });

  const locationDateTeamsMap = new Map<string, Set<string>>();

  result.proposedVisits.forEach((v) => {
    if (v.scheduled_date && v.assigned_team_id) {
      const clusterId = siteClusterMap.get(v.site_id) || v.site_id;
      const key = `${v.scheduled_date}:${clusterId}`;
      const set = locationDateTeamsMap.get(key) || new Set<string>();
      set.add(v.assigned_team_id);
      locationDateTeamsMap.set(key, set);
    }
  });

  locationDateTeamsMap.forEach((teamSet, key) => {
    const [dateStr, clusterId] = key.split(":");
    const cluster = clusters.find((c) => c.cluster_id === clusterId);
    const clusterName = cluster ? cluster.cluster_name : clusterId;
    assert(
      teamSet.size <= 1,
      `HARD RULE 1 VIOLATION: Location '${clusterName}' on date ${dateStr} has ${teamSet.size} teams assigned! (Teams: ${Array.from(teamSet).join(", ")})`
    );
  });
}

// REGRESSION TEST 1: Dosti Jade A + B (Same Physical Location -> Same Team, Same Day)
function runTest_DostiJade() {
  console.log("\n--- TEST: Dosti Jade A + B Batching ---");
  const dostiWings: Site[] = ["A", "B"].map((letter) => ({
    id: `dosti-wing-${letter}`,
    org_id: "org1",
    name: `Dosti Jade Wing ${letter}`,
    location: "Thane",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-05",
    latitude: 19.200,
    longitude: 72.970,
    created_at: "",
    updated_at: "",
  }));

  const rules: SiteCleaningRule[] = dostiWings.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 120,
    created_at: "",
    updated_at: "",
  }));

  const teams: TechnicianTeam[] = [
    { id: "team-1", org_id: "org1", name: "Team Thane", base_latitude: 19.200, base_longitude: 72.970, is_active: true, created_at: "", updated_at: "" },
  ];

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: dostiWings,
    rules,
    teams,
    planningCapacityMins: 480,
  });

  const dates = new Set(result.proposedVisits.map((v) => v.scheduled_date));
  const assignedTeams = new Set(result.proposedVisits.map((v) => v.assigned_team_id));
  assert(dates.size === 1, `Expected Dosti Jade A+B on 1 date, got ${dates.size}`);
  assert(assignedTeams.size === 1, `Expected Dosti Jade A+B with 1 team, got ${assignedTeams.size}`);
  assertWorkloadCapacityInvariant(result);
  console.log(`✅ Dosti Jade A+B test passed: Batched on ${Array.from(dates)[0]} (Total workload: 240m + travel <= 480m).`);
}

// REGRESSION TEST 2: Madhukosh A1 + A2 (Same Physical Location -> Same Team, Same Day)
function runTest_Madhukosh() {
  console.log("\n--- TEST: Madhukosh A1 + A2 Batching ---");
  const madhukoshSites: Site[] = ["A1", "A2"].map((name) => ({
    id: `madhukosh-${name}`,
    org_id: "org1",
    name: `Madhukosh society ${name}`,
    location: "Airoli",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-05",
    latitude: 19.150,
    longitude: 72.990,
    created_at: "",
    updated_at: "",
  }));

  const rules: SiteCleaningRule[] = madhukoshSites.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 120,
    created_at: "",
    updated_at: "",
  }));

  const teams: TechnicianTeam[] = [
    { id: "team-1", org_id: "org1", name: "Team Vashi", base_latitude: 19.150, base_longitude: 72.990, is_active: true, created_at: "", updated_at: "" },
  ];

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: madhukoshSites,
    rules,
    teams,
    planningCapacityMins: 480,
  });

  const dates = new Set(result.proposedVisits.map((v) => v.scheduled_date));
  assert(dates.size === 1, `Expected Madhukosh A1+A2 on 1 date, got ${dates.size}`);
  assertWorkloadCapacityInvariant(result);
  console.log(`✅ Madhukosh A1+A2 test passed: Batched on ${Array.from(dates)[0]}.`);
}

// REGRESSION TEST 3: MK Thakur ABCD + EFGH + IJK (360m cleaning + travel <= 480m -> ONE TEAM, ONE DAY)
function runTest_MKThakur() {
  console.log("\n--- TEST: MK Thakur 3-Wing Batching (360m total <= 480m) ---");
  const mkWings: Site[] = ["ABCD", "EFGH", "IJK"].map((name) => ({
    id: `mk-thakur-${name}`,
    org_id: "org1",
    name: `MK Thakur Wing ${name}`,
    location: "Ulwe",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-05",
    latitude: 18.970,
    longitude: 73.020,
    created_at: "",
    updated_at: "",
  }));

  const rules: SiteCleaningRule[] = mkWings.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 120,
    created_at: "",
    updated_at: "",
  }));

  const teams: TechnicianTeam[] = [
    { id: "team-1", org_id: "org1", name: "Team Panvel", base_latitude: 18.970, base_longitude: 73.020, is_active: true, created_at: "", updated_at: "" },
  ];

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: mkWings,
    rules,
    teams,
    planningCapacityMins: 480,
  });

  const dates = new Set(result.proposedVisits.map((v) => v.scheduled_date));
  assert(dates.size === 1, `Expected MK Thakur all 3 wings on 1 date, got ${dates.size}`);
  assertWorkloadCapacityInvariant(result);
  console.log(`✅ MK Thakur test passed: All 3 wings (360m cleaning) batched on ONE date (${Array.from(dates)[0]}).`);
}

// REGRESSION TEST 4: Alcove Explicit Reconciliation (8 Sites x 120m = 960m -> Split into min days, <=480m/day, SAME team)
function runTest_AlcoveReconciliation() {
  console.log("\n--- TEST: Alcove 8-Site Explicit Reconciliation ---");
  const alcoveSites: Site[] = ["A wing", "B Wing", "C Wing", "D Wing", "E wing", "F Wing", "G Wing", "Club House"].map((name) => ({
    id: `alcove-${name.replace(/\s+/g, "-").toLowerCase()}`,
    org_id: "org1",
    name: `Alcove society ${name}`,
    location: "Kharghar",
    capacity_kw: 100,
    status: "active",
    cleaning_cycle_days: 30,
    last_cleaned_on: "2026-09-05",
    latitude: 19.040,
    longitude: 73.070,
    created_at: "",
    updated_at: "",
  }));

  const rules: SiteCleaningRule[] = alcoveSites.map((s) => ({
    id: `rule-${s.id}`,
    site_id: s.id,
    is_configured: true,
    normal_interval_days: 30,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 120,
    created_at: "",
    updated_at: "",
  }));

  const teams: TechnicianTeam[] = [
    { id: "team-1", org_id: "org1", name: "Team Vashi", base_latitude: 19.040, base_longitude: 73.070, is_active: true, created_at: "", updated_at: "" },
    { id: "team-2", org_id: "org1", name: "Team Thane", base_latitude: 19.200, base_longitude: 72.970, is_active: true, created_at: "", updated_at: "" },
  ];

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: alcoveSites,
    rules,
    teams,
    planningCapacityMins: 480,
  });

  const visitsByDate = new Map<string, typeof result.proposedVisits>();
  result.proposedVisits.forEach((v) => {
    const list = visitsByDate.get(v.scheduled_date!) || [];
    list.push(v);
    visitsByDate.set(v.scheduled_date!, list);
  });

  const assignedTeams = new Set(result.proposedVisits.map((v) => v.assigned_team_id));
  assert(assignedTeams.size === 1, `Expected Alcove split across days with SAME team, got ${assignedTeams.size} teams`);
  assert(visitsByDate.size === 3, `Expected 960m cleaning split across 3 days (3+3+2 sites), got ${visitsByDate.size} days`);

  console.log("   Alcove Scheduled Allocations:");
  visitsByDate.forEach((vList, dateStr) => {
    const cleanMins = vList.reduce((sum, v) => sum + v.estimated_cleaning_mins, 0);
    const travelMins = vList.reduce((sum, v) => sum + v.estimated_travel_mins, 0);
    const tot = cleanMins + travelMins;
    const names = vList.map((v) => alcoveSites.find((s) => s.id === v.site_id)?.name).join(", ");
    console.log(`     - Date: ${dateStr} | Sites (${vList.length}): ${names} | Clean: ${cleanMins}m | Travel: ${travelMins}m | Total: ${tot}m (<=480m OK)`);
    assert(tot <= 480, `Alcove team-day on ${dateStr} exceeds 480m cap!`);
  });

  assertWorkloadCapacityInvariant(result);
  console.log("✅ Alcove explicit reconciliation test passed.");
}

async function runRealFleetSimulation() {
  console.log("\n=========================================================================");
  console.log("   READ-ONLY SIMULATION: OCTOBER 2026 REAL FLEET (35 SITES AUDIT)        ");
  console.log("=========================================================================");

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

  assertWorkloadCapacityInvariant(result);
  assertLocationExclusivity(result, sites);

  const scheduled = result.proposedVisits.filter((v) => v.status === "planned");
  const unscheduled = result.proposedVisits.filter((v) => v.status === "unscheduled");

  const clusters = buildGeographicClusters(sites);

  // Group visits by physical location
  const tableData: Array<{
    location: string;
    sites: string[];
    reqVisits: number;
    team: string;
    dates: string[];
    sitesPerDate: string;
    cleanMins: number;
    travelMins: number;
    totalMins: number;
  }> = [];

  let batchingViolations = 0;

  clusters.forEach((c) => {
    const cVisits = scheduled.filter((v) => c.sites.some((s) => s.id === v.site_id));
    const dates = Array.from(new Set(cVisits.map((v) => v.scheduled_date!))).sort();
    const teamIds = Array.from(new Set(cVisits.map((v) => v.assigned_team_id!)));
    const teamNames = teamIds.map((id) => teams.find((t) => t.id === id)?.name || id).join(", ");

    const sitesCount = c.sites.length;
    const cycleMins = c.sites.reduce((sum, s) => {
      const r = rules.find((rule) => rule.site_id === s.id);
      return sum + (r?.estimated_duration_mins || 120);
    }, 0);

    // Batching Violation Check: If total cycle mins <= 480m and site fits on 1 day, but was split across >1 day per cycle!
    const cycle1Visits = cVisits.filter((v) => v.visit_sequence_in_month === 1);
    const cycle1Dates = new Set(cycle1Visits.map((v) => v.scheduled_date));
    if (cycleMins <= 480 && cycle1Dates.size > 1) {
      batchingViolations++;
    }

    const sitesPerDateStr = dates.map((d) => {
      const dVisits = cVisits.filter((v) => v.scheduled_date === d);
      return `${d}: ${dVisits.length} site(s)`;
    }).join("; ");

    const totClean = cVisits.reduce((sum, v) => sum + v.estimated_cleaning_mins, 0);
    const totTravel = cVisits.reduce((sum, v) => sum + v.estimated_travel_mins, 0);

    tableData.push({
      location: c.cluster_name,
      sites: c.sites.map((s) => s.name),
      reqVisits: cVisits.length,
      team: teamNames || "Unassigned",
      dates,
      sitesPerDate: sitesPerDateStr,
      cleanMins: totClean,
      travelMins: totTravel,
      totalMins: totClean + totTravel,
    });
  });

  const totalTeamDays = new Set(scheduled.map((v) => `${v.assigned_team_id}:${v.scheduled_date}`)).size;

  console.log(`A. Test Suite Status                 : ALL PASSED`);
  console.log(`B. Total Physical Locations          : ${clusters.length}`);
  console.log(`C. Total Sites                       : ${sites.length}`);
  console.log(`D. Required October Visits           : ${result.auditReport.total_required_visits}`);
  console.log(`E. Scheduled October Visits          : ${scheduled.length}`);
  console.log(`F. Unscheduled Visits                : ${unscheduled.length}`);
  console.log(`G. Total Team-Days                   : ${totalTeamDays}`);
  console.log(`H. Capacity Violations (>480m)       : 0 (HARD INVARIANT PASSED)`);
  console.log(`I. Physical-Location Batching Violations: ${batchingViolations}`);
  console.log("=========================================================================\n");

  fs.writeFileSync(path.join(__dirname, "read_only_october_simulation_report.json"), JSON.stringify(tableData, null, 2));
}

async function main() {
  try {
    runTest_DostiJade();
    runTest_Madhukosh();
    runTest_MKThakur();
    runTest_AlcoveReconciliation();
    await runRealFleetSimulation();
    console.log("🎉 ALL PHASE 2.8 REGRESSION & INVARIANT TESTS PASSED CLEANLY!");
  } catch (err: any) {
    console.error("❌ TEST FAILURE:", err?.message || err);
    process.exit(1);
  }
}

main();
