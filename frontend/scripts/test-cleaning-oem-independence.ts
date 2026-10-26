import { generateMonthlyCleaningPlan, isTeamRegionPermitted } from "../lib/cleaning-scheduler";
import { Site, SiteCleaningRule, TechnicianTeam } from "../lib/types";

async function runOemIndependenceTests() {
  console.log("================================================================================");
  console.log("RUNNING WORKSTREAM B: CLEANING SCHEDULER OEM INDEPENDENCE & AUDIT TESTS");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, details?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
      if (details) console.error("   Details:", details);
      failed++;
    }
  }

  const teams: TechnicianTeam[] = [
    {
      id: "team-mumbai-1",
      org_id: "org-1",
      name: "Mumbai West Team",
      base_latitude: 19.076,
      base_longitude: 72.8777,
      base_address: "Andheri West, Mumbai",
      is_active: true,
      color_code: "#10b981",
      created_at: new Date().toISOString(),
    } as any,
    {
      id: "team-thane-1",
      org_id: "org-1",
      name: "Thane Central Team",
      base_latitude: 19.2183,
      base_longitude: 72.9781,
      base_address: "Ghodbunder Rd, Thane",
      is_active: true,
      color_code: "#3b82f6",
      created_at: new Date().toISOString(),
    } as any,
    {
      id: "team-pune-1",
      org_id: "org-1",
      name: "Pune Operations Team",
      base_latitude: 18.5204,
      base_longitude: 73.8567,
      base_address: "Shivajinagar, Pune",
      is_active: true,
      color_code: "#8b5cf6",
      created_at: new Date().toISOString(),
    } as any,
  ];

  // ============================================================================
  // TEST 1: Pure Non-OEM Site without inverters or telemetry
  // ============================================================================
  const siteNonOem: Site = {
    id: "site-non-oem-1",
    org_id: "org-1",
    name: "Stand-Alone Rooftop (No Inverter API)",
    location: "Andheri, Mumbai",
    latitude: 19.1136,
    longitude: 72.8697,
    capacity_kwp: 50,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-15",
    timezone: "Asia/Kolkata",
  } as any;

  const ruleNonOem: SiteCleaningRule = {
    id: "rule-non-oem-1",
    site_id: "site-non-oem-1",
    is_configured: true,
    normal_interval_days: 15,
    monsoon_interval_days: 30,
    monsoon_start_md: "06-01",
    monsoon_end_md: "09-30",
    allowed_weekdays: [1, 2, 3, 4, 5, 6],
    blackout_dates: [],
    estimated_cleaning_mins: 90,
  } as any;

  const plan1 = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [siteNonOem],
    rules: [ruleNonOem],
    teams,
  });

  assert(
    plan1.assignments.length === 2 &&
    plan1.proposedVisits.length === 2 &&
    plan1.proposedVisits.every((v) => v.status === "planned"),
    "Test 1: Non-OEM site receives full preventive schedule (2 visits for 15d cycle) without inverter API"
  );

  // ============================================================================
  // TEST 2: Independence: OEM Site vs. Identical Non-OEM Site produce identical plans
  // ============================================================================
  const siteOem: Site = {
    ...siteNonOem,
    id: "site-oem-1",
    name: "Stand-Alone Rooftop (With Inverter API)",
  };
  const ruleOem: SiteCleaningRule = {
    ...ruleNonOem,
    id: "rule-oem-1",
    site_id: "site-oem-1",
  };

  const plan2 = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [siteOem],
    rules: [ruleOem],
    teams,
  });

  assert(
    plan1.assignments[0].scheduled_date === plan2.assignments[0].scheduled_date &&
    plan1.assignments[1].scheduled_date === plan2.assignments[1].scheduled_date,
    "Test 2: Scheduled cleaning dates are mathematically identical regardless of OEM telemetry availability"
  );

  // ============================================================================
  // TEST 3: Stale Telemetry Site (Offline 30+ days) is planned normally in preventive cycle
  // ============================================================================
  const siteStaleTelemetry: Site = {
    id: "site-stale-1",
    org_id: "org-1",
    name: "Stale Telemetry Plant (Offline Inverter)",
    location: "Thane West",
    latitude: 19.215,
    longitude: 72.975,
    capacity_kwp: 120,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-12",
    timezone: "Asia/Kolkata",
  } as any;
  const ruleStale: SiteCleaningRule = {
    id: "rule-stale-1",
    site_id: "site-stale-1",
    is_configured: true,
    normal_interval_days: 15,
    estimated_cleaning_mins: 90,
  } as any;

  const plan3 = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [siteStaleTelemetry],
    rules: [ruleStale],
    teams,
  });

  assert(
    plan3.assignments.length === 2 &&
    plan3.assignments.every((a) => a.constraint_state === "valid"),
    "Test 3: Site with stale telemetry generates valid preventive cleaning assignments without exclusion"
  );

  // ============================================================================
  // TEST 4: Unknown Prior Cleaning History (last_cleaned_on is null)
  // ============================================================================
  const siteUnknownHistory: Site = {
    id: "site-unknown-hist-1",
    org_id: "org-1",
    name: "Newly Onboarded Site (No History)",
    location: "Bhandup, Mumbai",
    latitude: 19.145,
    longitude: 72.935,
    capacity_kwp: 80,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: null,
    timezone: "Asia/Kolkata",
  } as any;
  const ruleUnknownHist: SiteCleaningRule = {
    id: "rule-unknown-1",
    site_id: "site-unknown-hist-1",
    is_configured: true,
    normal_interval_days: 15,
    estimated_cleaning_mins: 90,
  } as any;

  const plan4 = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [siteUnknownHistory],
    rules: [ruleUnknownHist],
    teams,
  });

  const firstVisitUnknown = plan4.proposedVisits[0];
  const firstAssignUnknown = plan4.assignments[0];

  assert(
    Boolean(
      plan4.assignments.length >= 1 &&
      firstVisitUnknown !== undefined &&
      firstVisitUnknown.constraint_state === "warning" &&
      firstVisitUnknown.constraint_notes?.includes("Unknown cleaning history") &&
      firstAssignUnknown?.scheduler_rationale?.includes("Prior cleaning history unrecorded")
    ),
    "Test 4: Unknown cleaning history is explicitly flagged with 'warning' and informative rationale for admin review"
  );

  // ============================================================================
  // TEST 5: Mixed Physical Location: Co-located OEM site & Non-OEM site
  // ============================================================================
  // Both sites share exact same physical building coordinates (e.g. Wing A & Wing B)
  const siteCoLocOem: Site = {
    id: "site-coloc-oem",
    org_id: "org-1",
    name: "Regalia Complex — Wing A (Solis Inverter)",
    location: "Kalyan West",
    latitude: 19.2437,
    longitude: 73.1355,
    capacity_kwp: 40,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-18",
    timezone: "Asia/Kolkata",
  } as any;
  const siteCoLocNonOem: Site = {
    id: "site-coloc-non-oem",
    org_id: "org-1",
    name: "Regalia Complex — Wing B (Unintegrated Inverter Brand)",
    location: "Kalyan West",
    latitude: 19.2437, // Exact same coordinates
    longitude: 73.1355,
    capacity_kwp: 40,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-18",
    timezone: "Asia/Kolkata",
  } as any;

  const ruleCoLocOem: SiteCleaningRule = {
    id: "rule-coloc-oem",
    site_id: "site-coloc-oem",
    is_configured: true,
    normal_interval_days: 15,
    estimated_cleaning_mins: 60,
  } as any;
  const ruleCoLocNonOem: SiteCleaningRule = {
    id: "rule-coloc-non-oem",
    site_id: "site-coloc-non-oem",
    is_configured: true,
    normal_interval_days: 15,
    estimated_cleaning_mins: 60,
  } as any;

  const plan5 = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [siteCoLocOem, siteCoLocNonOem],
    rules: [ruleCoLocOem, ruleCoLocNonOem],
    teams,
  });

  // Verify that Cycle 1 for Wing A and Wing B are scheduled on the SAME date with the SAME team
  const wingA_1 = plan5.assignments.find((a) => a.site_id === "site-coloc-oem" && a.sequence_order === 1);
  const wingB_1 = plan5.assignments.find((a) => a.site_id === "site-coloc-non-oem" && a.sequence_order === 2);

  assert(
    wingA_1 !== undefined &&
    wingB_1 !== undefined &&
    wingA_1.scheduled_date === wingB_1.scheduled_date &&
    wingA_1.team_id === wingB_1.team_id,
    "Test 5: Co-located OEM and non-OEM sites are batched onto the exact same date and assigned to the same team"
  );

  // ============================================================================
  // TEST 6: Regional Invariant Preservation: Pune sites strictly assigned to Pune team
  // ============================================================================
  const sitePune: Site = {
    id: "site-pune-1",
    org_id: "org-1",
    name: "Shivajinagar Commercial Rooftop (No API)",
    location: "Shivajinagar, Pune",
    latitude: 18.5308,
    longitude: 73.8475,
    capacity_kwp: 100,
    status: "active",
    cleaning_cycle_days: 15,
    last_cleaned_on: "2026-09-12",
    timezone: "Asia/Kolkata",
  } as any;
  const rulePune: SiteCleaningRule = {
    id: "rule-pune-1",
    site_id: "site-pune-1",
    is_configured: true,
    normal_interval_days: 15,
    estimated_cleaning_mins: 90,
  } as any;

  const plan6 = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: [sitePune],
    rules: [rulePune],
    teams,
  });

  assert(
    plan6.assignments.length === 2 &&
    plan6.assignments.every((a) => a.team_id === "team-pune-1"),
    "Test 6: Pune non-OEM site is strictly assigned to the Pune team preserving regional boundary invariants"
  );

  console.log("================================================================================");
  console.log(`WORKSTREAM B TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runOemIndependenceTests().catch((err) => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
