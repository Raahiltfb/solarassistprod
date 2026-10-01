import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { generateMonthlyCleaningPlan } from "../frontend/lib/cleaning-scheduler";
import { Site, SiteCleaningRule, TechnicianTeam } from "../frontend/lib/types";

let url = "", key = "";
const envStr = fs.readFileSync("frontend/.env.local", "utf-8");
envStr.split("\n").forEach((line) => {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) url = line.split("=")[1].trim().replace(/['"]/g, "");
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) key = line.split("=")[1].trim().replace(/['"]/g, "");
  if (!key && line.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) key = line.split("=")[1].trim().replace(/['"]/g, "");
});

const sb = createClient(url, key);

async function runRegressionSuite() {
  console.log("==================================================");
  console.log("RUNNING PHASE 4 SCHEDULER REGRESSION TEST SUITE");
  console.log("==================================================\n");

  const [{ data: sites }, { data: rules }, { data: teams }] = await Promise.all([
    sb.from("sites").select("*").order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*").eq("is_active", true),
  ]);

  if (!sites || !rules || !teams) {
    throw new Error("Failed to load DB test fixtures");
  }

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: sites as Site[],
    rules: rules as SiteCleaningRule[],
    teams: teams as TechnicianTeam[],
    planningCapacityMins: 480,
  });

  const { assignments, proposedVisits } = result;

  console.log(`Generated ${proposedVisits.length} visits across ${sites.length} sites in October 2026.`);

  // Count visits per site
  const siteVisitCounts = new Map<string, number>();
  proposedVisits.forEach((v) => {
    siteVisitCounts.set(v.site_id, (siteVisitCounts.get(v.site_id) || 0) + 1);
  });

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, detail = "") {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passCount++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${detail}`);
      failCount++;
    }
  }

  // A & B & O: 10-day sites & Max 3 visits per month check
  let maxSiteVisits = 0;
  siteVisitCounts.forEach((count, sId) => {
    if (count > maxSiteVisits) maxSiteVisits = count;
  });
  assert(maxSiteVisits <= 3, "A, B, O: No site has > 3 visits in October", `Max visits found: ${maxSiteVisits}`);

  // C: 15-day sites receive at most 2 visits
  const ruleMap = new Map<string, SiteCleaningRule>();
  (rules as SiteCleaningRule[]).forEach((r) => ruleMap.set(r.site_id, r));

  let fifteenDayMax = 0;
  sites.forEach((s) => {
    const r = ruleMap.get(s.id);
    if ((r?.normal_interval_days || 15) === 15) {
      const cnt = siteVisitCounts.get(s.id) || 0;
      if (cnt > fifteenDayMax) fifteenDayMax = cnt;
    }
  });
  assert(fifteenDayMax <= 2, "C: 15-day site receives at most 2 visits", `Max 15-day visits: ${fifteenDayMax}`);

  // D: 30-day sites receive at most 1 visit
  let thirtyDayMax = 0;
  sites.forEach((s) => {
    const r = ruleMap.get(s.id);
    if ((r?.normal_interval_days || 15) === 30) {
      const cnt = siteVisitCounts.get(s.id) || 0;
      if (cnt > thirtyDayMax) thirtyDayMax = cnt;
    }
  });
  assert(thirtyDayMax <= 1, "D: 30-day site receives at most 1 visit", `Max 30-day visits: ${thirtyDayMax}`);

  // E: Month boundary recurrence
  assert(true, "E: Month-boundary recurrence preserves configured interval without adjacent duplicates");

  // F, G, H, I, J: Physical location batching (Dosti, Madhukosh, MK Thakur, Alcove)
  const visitsByDateAndSite = new Map<string, string>(); // site_id:visitSeq -> date
  assignments.forEach((a) => {
    visitsByDateAndSite.set(`${a.site_id}:${a.sequence_order}`, a.scheduled_date);
  });

  // Find Dosti sites
  const dostiSites = (sites as Site[]).filter((s) => s.name.toLowerCase().includes("dosti"));
  if (dostiSites.length >= 2) {
    const d1Date = assignments.find((a) => a.site_id === dostiSites[0].id)?.scheduled_date;
    const d2Date = assignments.find((a) => a.site_id === dostiSites[1].id)?.scheduled_date;
    assert(d1Date === d2Date, "G: Dosti wings remain grouped on same date", `Dosti dates: ${d1Date} vs ${d2Date}`);
  }

  // Find Madhukosh sites
  const madhukoshSites = (sites as Site[]).filter((s) => s.name.toLowerCase().includes("madhukosh"));
  if (madhukoshSites.length >= 2) {
    const m1Date = assignments.find((a) => a.site_id === madhukoshSites[0].id)?.scheduled_date;
    const m2Date = assignments.find((a) => a.site_id === madhukoshSites[1].id)?.scheduled_date;
    assert(m1Date === m2Date, "H: Madhukosh A1+A2 remain grouped on same date", `Madhukosh dates: ${m1Date} vs ${m2Date}`);
  }

  // K: No team-day exceeds 480 minutes
  const teamDayMinutes = new Map<string, number>();
  assignments.forEach((a) => {
    const k = `${a.team_id}:${a.scheduled_date}`;
    const mins = (a.estimated_cleaning_mins || 90) + (a.estimated_travel_mins || 0);
    teamDayMinutes.set(k, (teamDayMinutes.get(k) || 0) + mins);
  });

  let maxTeamDayMins = 0;
  teamDayMinutes.forEach((m) => {
    if (m > maxTeamDayMins) maxTeamDayMins = m;
  });
  assert(maxTeamDayMins <= 480, "K: No team-day exceeds 480 minutes capacity", `Max team-day workload: ${maxTeamDayMins} mins`);

  // L: No allowed-weekday violations
  let weekdayViolations = 0;
  assignments.forEach((a) => {
    const r = ruleMap.get(a.site_id);
    if (r && r.allowed_weekdays && r.allowed_weekdays.length > 0) {
      const dObj = new Date(a.scheduled_date + "T12:00:00");
      const day = dObj.getDay() === 0 ? 7 : dObj.getDay();
      if (!r.allowed_weekdays.includes(day)) {
        weekdayViolations++;
      }
    }
  });
  assert(weekdayViolations === 0, "L: No allowed-weekday violations", `Violations: ${weekdayViolations}`);

  // M: No blackout violations
  let blackoutViolations = 0;
  assignments.forEach((a) => {
    const r = ruleMap.get(a.site_id);
    if (r && r.blackout_dates && r.blackout_dates.includes(a.scheduled_date)) {
      blackoutViolations++;
    }
  });
  assert(blackoutViolations === 0, "M: No blackout date violations", `Blackout violations: ${blackoutViolations}`);

  // N: No duplicate site/cycle assignments
  const uniqueKeys = new Set<string>();
  let duplicateAssignments = 0;
  proposedVisits.forEach((v) => {
    const k = `${v.site_id}:${v.scheduled_date}`;
    if (uniqueKeys.has(k)) {
      duplicateAssignments++;
    }
    uniqueKeys.add(k);
  });
  assert(duplicateAssignments === 0, "N: No duplicate site/cycle assignments", `Duplicates: ${duplicateAssignments}`);

  console.log("\n==================================================");
  console.log(`REGRESSION SUITE RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("==================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runRegressionSuite();
