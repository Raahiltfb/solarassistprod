import { generateMonthlyCleaningPlan, validateAssignmentConstraint, getMinimumPermittedInterval } from "../frontend/lib/cleaning-scheduler";
import { Site, SiteCleaningRule, TechnicianTeam } from "../frontend/lib/types";

// Mock Data
const teams: TechnicianTeam[] = [
  { id: "t1", name: "Alpha", base_latitude: 19.1, base_longitude: 73.1, is_active: true }
];

const createSite = (id: string, name: string, lat: number, lng: number, last_cleaned_on: string | null = null): Site => ({
  id, name, location: "MMR", latitude: lat, longitude: lng, address: "Test",
  client_id: "c1", portfolio_id: "p1", is_active: true, created_at: "", updated_at: "", last_cleaned_on
});

const createRule = (siteId: string, normal_interval_days: number): SiteCleaningRule => ({
  id: `rule-${siteId}`, site_id: siteId, is_configured: true, is_override: false,
  normal_interval_days, monsoon_interval_days: normal_interval_days,
  monsoon_start_md: "06-01", monsoon_end_md: "09-30",
  allowed_weekdays: [1, 2, 3, 4, 5, 6], blackout_dates: [],
  estimated_cleaning_mins: 90, created_at: "", updated_at: ""
});

async function runTests() {
  console.log("Running Phase 4 Scheduler Regression Tests...");
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    } else {
      console.log(`✅ PASS: ${message}`);
    }
  }

  // 1. Min Gap Tests (10-day cycle)
  let rule10 = createRule("s1", 10);
  let minGap10 = getMinimumPermittedInterval(10);
  assert(minGap10 === 9, "Test A: 10-day cycle min gap is 9 days");

  let res1 = validateAssignmentConstraint(createSite("s1", "S1", 19, 73), rule10, "2026-10-15", "2026-10-15", 90, 480, 1, "2026-10-06");
  assert(res1.state === "valid", "Test B: 9-day gap on 10-day cycle is valid (earliest permitted)");

  let res2 = validateAssignmentConstraint(createSite("s1", "S1", 19, 73), rule10, "2026-10-15", "2026-10-14", 90, 480, 1, "2026-10-06");
  assert(res2.state === "blocking", "Test C: 8-day gap on 10-day cycle is BLOCKED");

  // 2. Min Gap Tests (15-day cycle)
  let rule15 = createRule("s2", 15);
  let minGap15 = getMinimumPermittedInterval(15);
  assert(minGap15 === 13, "Test D: 15-day cycle min gap is 13 days");
  
  let res3 = validateAssignmentConstraint(createSite("s2", "S2", 19, 73), rule15, "2026-10-20", "2026-10-20", 90, 480, 1, "2026-10-07");
  assert(res3.state === "valid", "Test E: 13-day gap on 15-day cycle is valid");

  let res4 = validateAssignmentConstraint(createSite("s2", "S2", 19, 73), rule15, "2026-10-20", "2026-10-19", 90, 480, 1, "2026-10-07");
  assert(res4.state === "blocking", "Test F: 12-day gap on 15-day cycle is BLOCKED");

  // 3. Min Gap Tests (30-day cycle)
  let rule30 = createRule("s3", 30);
  let minGap30 = getMinimumPermittedInterval(30);
  assert(minGap30 === 28, "Test G: 30-day cycle min gap is 28 days");
  
  let res5 = validateAssignmentConstraint(createSite("s3", "S3", 19, 73), rule30, "2026-10-30", "2026-10-30", 90, 480, 1, "2026-10-02");
  assert(res5.state === "valid", "Test H: 28-day gap on 30-day cycle is valid");

  let res6 = validateAssignmentConstraint(createSite("s3", "S3", 19, 73), rule30, "2026-10-30", "2026-10-29", 90, 480, 1, "2026-10-02");
  assert(res6.state === "blocking", "Test I: 27-day gap on 30-day cycle is BLOCKED");

  // 4. Monthly Max Visit Limits
  let res7 = validateAssignmentConstraint(createSite("s3", "S3", 19, 73), rule10, "2026-10-30", "2026-10-30", 90, 480, 4, null);
  assert(res7.state === "blocking", "Test J: Exceeding 3 visits in a calendar month is always BLOCKED");

  // Run a mini schedule to ensure minimum gaps are respected in generated candidate dates
  const sites = [createSite("s4", "Test Site", 19, 73, "2026-09-25")]; // Last cleaned 25th Sept
  const rules = [createRule("s4", 10)]; // 10-day cycle
  
  const scheduleRes = generateMonthlyCleaningPlan({
    year: 2026, month: 10, sites, rules, teams, planningCapacityMins: 480
  });

  const site4Assigns = scheduleRes.assignments.filter(a => a.site_id === "s4").sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date));
  
  let prevDate = "2026-09-25";
  let gapOk = true;
  for (const a of site4Assigns) {
    const gap = Math.round((new Date(a.scheduled_date).getTime() - new Date(prevDate).getTime()) / 86400_000);
    if (gap < 9) gapOk = false;
    prevDate = a.scheduled_date;
  }
  assert(gapOk, "Test R: generateMonthlyCleaningPlan respects minimum gap constraints between visits");

  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED");
  } else {
    console.error(`\n❌ ${failed} TESTS FAILED`);
    process.exit(1);
  }
}

runTests();
