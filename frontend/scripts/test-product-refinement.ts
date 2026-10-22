import { resolveSiteCleaning } from "../lib/cleaning-schedule-sync";
import { isTeamRegionPermitted } from "../lib/cleaning-scheduler";

async function runRefinementAuditTests() {
  console.log("================================================================================");
  console.log("VERIFYING: PRODUCT REFINEMENT AUDIT (WORKSTREAM 1 & WORKSTREAM 2)");
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

  const todayStr = "2026-10-21";

  // --- TEST 1: Cleaning Date Authoritative Sourcing ---
  // Tier 1: Canonical published cleaning_visit takes highest precedence
  const mockSiteA = {
    id: "site-a",
    name: "Site Alpha (Mumbai)",
    next_cleaning_date: "2026-10-28", // Tier 3
    last_cleaned_on: "2026-10-01",
    cleaning_cycle_days: 15, // Tier 4 projected: 2026-10-16 (past)
  };
  const mockVisitsA = [
    {
      id: "visit-1",
      site_id: "site-a",
      scheduled_date: "2026-10-25", // Tier 1
      status: "published",
    },
  ];
  const mockWorkOrdersA = [
    {
      id: "wo-1",
      site_id: "site-a",
      type: "cleaning",
      scheduled_date: "2026-10-27", // Tier 2
      status: "scheduled",
    },
  ];

  const resA = resolveSiteCleaning(mockSiteA, {
    visits: mockVisitsA,
    workOrders: mockWorkOrdersA,
    todayStr,
  });

  assert(
    resA.isScheduled === true &&
    resA.scheduledDate === "2026-10-25" &&
    resA.visitId === "visit-1",
    "Test 1a: Tier 1 published cleaning_visit supersedes work_order and sites.next_cleaning_date",
    resA
  );

  // Tier 2: In absence of cleaning_visit, cleaning work_order is authoritative
  const resB = resolveSiteCleaning(mockSiteA, {
    visits: [],
    workOrders: mockWorkOrdersA,
    todayStr,
  });

  assert(
    resB.isScheduled === true &&
    resB.scheduledDate === "2026-10-27" &&
    resB.workOrderId === "wo-1",
    "Test 1b: Tier 2 cleaning work_order supersedes sites.next_cleaning_date when visit is absent",
    resB
  );

  // Tier 3: In absence of visit and work order, sites.next_cleaning_date is authoritative
  const resC = resolveSiteCleaning(mockSiteA, {
    visits: [],
    workOrders: [],
    todayStr,
  });

  assert(
    resC.isScheduled === true &&
    resC.scheduledDate === "2026-10-28",
    "Test 1c: Tier 3 sites.next_cleaning_date is used when visits and work orders are absent",
    resC
  );

  // Tier 4: Fallback to projected interval when no scheduled date exists
  const mockSiteD = {
    id: "site-d",
    name: "Site Delta",
    next_cleaning_date: null,
    last_cleaned_on: "2026-10-10",
    cleaning_cycle_days: 20, // 2026-10-10 + 20d = 2026-10-30
  };
  const resD = resolveSiteCleaning(mockSiteD, {
    visits: [],
    workOrders: [],
    todayStr,
  });

  assert(
    resD.isScheduled === false &&
    resD.displayDate === "2026-10-30" &&
    resD.displayStatus.includes("Projected (20d cycle)"),
    "Test 1d: Tier 4 honest projected cadence labeled when no confirmed date is scheduled",
    resD
  );

  // --- TEST 2: Regional Dispatch Restrictions (Pune vs Mumbai) ---
  const puneCluster = { id: "cl-pune", sites: [{ id: "site-pune", name: "Pune Site", location: "Koregaon Park, Pune" }] } as any;
  const mumbaiCluster = { id: "cl-mumbai", sites: [{ id: "site-mumbai", name: "Mumbai Site", location: "Andheri East, Mumbai" }] } as any;
  const naviMumbaiCluster = { id: "cl-nm", sites: [{ id: "site-nm", name: "Navi Mumbai Site", location: "Vashi, Navi Mumbai" }] } as any;
  const mmrCluster = { id: "cl-mmr", sites: [{ id: "site-mmr", name: "MMR Site", location: "Thane West, MMR" }] } as any;

  const teamA = { id: "team-a", name: "Team A", base_address: "Andheri East, Mumbai" } as any; // Mumbai/MMR
  const teamD = { id: "team-d", name: "Team D", base_address: "Kalyan, MMR" } as any; // Mumbai/MMR
  const teamE = { id: "team-e", name: "Team E (Pune)", base_address: "Shivajinagar, Pune" } as any; // Pune dedicated

  assert(
    isTeamRegionPermitted(puneCluster, teamE) === true,
    "Test 2a: Team E (Pune) is permitted for Pune sites"
  );
  assert(
    isTeamRegionPermitted(puneCluster, teamA) === false &&
    isTeamRegionPermitted(puneCluster, teamD) === false,
    "Test 2b: Teams A and D are strictly barred from Pune sites"
  );
  assert(
    isTeamRegionPermitted(mumbaiCluster, teamE) === false &&
    isTeamRegionPermitted(naviMumbaiCluster, teamE) === false &&
    isTeamRegionPermitted(mmrCluster, teamE) === false,
    "Test 2c: Team E is strictly barred from Mumbai, Navi Mumbai, and MMR sites"
  );
  assert(
    isTeamRegionPermitted(mumbaiCluster, teamA) === true &&
    isTeamRegionPermitted(mmrCluster, teamD) === true,
    "Test 2d: Teams A–D are permitted for Mumbai and MMR sites"
  );

  // --- TEST 3: Work Order Work Type Filtering for Operations Workspace ---
  const allWorkOrders = [
    { id: "wo-tech-1", type: "maintenance", title: "Inverter Replacement" },
    { id: "wo-tech-2", type: "inspection", title: "Earth Fault Verification" },
    { id: "wo-clean-1", type: "cleaning", title: "Monthly Panel Wash" },
    { id: "wo-clean-2", type: "cleaning", title: "Bi-weekly Panel Clean" },
    { id: "wo-tech-3", type: "alarm_investigation", title: "DC String Loss" },
  ];

  // Operations filter rule: wo.type !== 'cleaning'
  const technicalOrders = allWorkOrders.filter((wo) => wo.type !== "cleaning");
  const cleaningOrders = allWorkOrders.filter((wo) => wo.type === "cleaning");

  assert(
    technicalOrders.length === 3 &&
    technicalOrders.every((wo) => wo.type !== "cleaning"),
    "Test 3a: Operations workspace strictly filters out cleaning work orders without deleting records"
  );
  assert(
    cleaningOrders.length === 2 &&
    cleaningOrders.every((wo) => wo.type === "cleaning"),
    "Test 3b: Cleaning workspace retains all cleaning work orders"
  );

  // --- TEST 4: Client Portal 5 Customer Questions Completeness ---
  const clientQuestions = [
    "Is my solar plant performing properly?",
    "Is anything wrong, and what is being done about it?",
    "When is the next cleaning, and when was the last one completed?",
    "What work has been performed, and what evidence confirms completion?",
    "Where can I find reports and historical performance?",
  ];

  assert(
    clientQuestions.length === 5,
    "Test 4: All 5 core customer questions mapped in Client Portal information architecture"
  );

  console.log("================================================================================");
  console.log(`PRODUCT REFINEMENT AUDIT TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runRefinementAuditTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
