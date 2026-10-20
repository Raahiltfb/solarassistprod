import { 
  sanitizeServiceEvents, 
  formatClientServiceRequests, 
  getMacroTechnicalDescription 
} from "../lib/client-sanitizer";

async function runVerificationTests() {
  console.log("================================================================================");
  console.log("VERIFYING: CLEANING POPUPS (2-DAYS IN ADVANCE & COMPLETED) + CLIENT ERROR LOG");
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

  const now = new Date();
  // Scheduled exactly 2 days from now (48 hours)
  const twoDaysAhead = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const tenDaysAhead = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // --- TEST 1: Scheduled Cleaning 2 Days in Advance produces Pop-up Event ---
  const mockWorkOrdersScheduled = [
    {
      id: "wo-sched-2days",
      site_id: "site-1",
      type: "cleaning",
      status: "scheduled",
      scheduled_date: twoDaysAhead,
      client_acknowledged_at: null,
      sites: { name: "Alcove Society A wing" },
    },
    {
      id: "wo-sched-10days",
      site_id: "site-2",
      type: "cleaning",
      status: "scheduled",
      scheduled_date: tenDaysAhead,
      client_acknowledged_at: null,
      sites: { name: "Vijay Vatika Solar" },
    }
  ];

  const events1 = sanitizeServiceEvents([], mockWorkOrdersScheduled, [], []);
  const prompt2Days = events1.find((e) => e.id === "wo-active-wo-sched-2days");
  const prompt10Days = events1.find((e) => e.id === "wo-active-wo-sched-10days");

  assert(
    prompt2Days !== undefined &&
    prompt2Days.actionable === "cleaning_schedule_ack" &&
    prompt2Days.actionableStatus === "pending" &&
    prompt2Days.title === "Solar Panel Cleaning Scheduled",
    "Test 1a: Work Order scheduled 2 days in advance generates pending cleaning_schedule_ack popup event",
    prompt2Days
  );

  assert(
    prompt10Days !== undefined &&
    prompt10Days.actionable === "cleaning_schedule_ack" &&
    prompt10Days.actionableStatus === "pending" &&
    prompt10Days.actionableContext?.isWithin2Days === false,
    "Test 1b: Work Order scheduled 10 days in advance is actionable notification with isWithin2Days=false",
    prompt10Days
  );

  // --- TEST 2: Canonical Cleaning Visit (from cleaning_visits table) 2 Days in Advance ---
  const mockCleaningVisits = [
    {
      id: "cv-visit-2days",
      site_id: "site-3",
      scheduled_date: twoDaysAhead,
      status: "published",
      acknowledged_at: null,
      sites: { name: "Crestia Solar" },
    }
  ];

  const events2 = sanitizeServiceEvents([], [], [], [], mockCleaningVisits);
  const visitPrompt = events2.find((e) => e.id === "visit-active-cv-visit-2days");

  assert(
    visitPrompt !== undefined &&
    visitPrompt.actionable === "cleaning_schedule_ack" &&
    visitPrompt.actionableStatus === "pending" &&
    visitPrompt.actionableContext?.entityType === "cleaning_visit",
    "Test 2: Canonical cleaning visit scheduled 2 days in advance generates cleaning_schedule_ack popup event",
    visitPrompt
  );

  // --- TEST 3: Completed Cleaning Acknowledgment ---
  const mockCleaningLogs = [
    {
      id: "log-completed-1",
      site_id: "site-1",
      performed_at: new Date(now.getTime() - 3600000).toISOString(),
      before_photo_url: "https://example.com/before.jpg",
      after_photo_url: "https://example.com/after.jpg",
      safety_photo_url: "https://example.com/safety.jpg",
      damage_observed: true,
      damage_type: "Minor glass surface scratch noted on String 2 panel 4",
      client_acknowledged: false,
      client_acknowledged_at: null,
      sites: { name: "Alcove Society A wing" },
    }
  ];

  const events3 = sanitizeServiceEvents([], [], mockCleaningLogs, []);
  const completedAckPrompt = events3.find((e) => e.id === "cln-log-completed-1");

  assert(
    completedAckPrompt !== undefined &&
    completedAckPrompt.actionable === "cleaning_ack" &&
    completedAckPrompt.actionableStatus === "pending" &&
    completedAckPrompt.title === "Solar Panel Cleaning Completed" &&
    completedAckPrompt.safety_photo_url === "https://example.com/safety.jpg" &&
    completedAckPrompt.actionableContext?.damage_observed === true,
    "Test 3: Completed cleaning log generates pending cleaning_ack popup event with inspection evidence",
    completedAckPrompt
  );

  // --- TEST 4: Client Error Log includes all alerts with semi-technical explanations ---
  const mockAlerts = [
    {
      id: "alt-grid-ovf",
      site_id: "site-1",
      code: "1015",
      title: "Grid Over Frequency (OV-G-F)",
      severity: "medium",
      status: "resolved",
      triggered_at: new Date(now.getTime() - 7200000).toISOString(),
      resolved_at: new Date(now.getTime() - 1800000).toISOString(),
    },
    {
      id: "alt-wifi-loss",
      site_id: "site-1",
      code: "1D4C2",
      title: "Loss of internet connection",
      severity: "medium",
      status: "open",
      triggered_at: new Date(now.getTime() - 3600000).toISOString(),
    },
    {
      id: "alt-string-dev",
      site_id: "site-2",
      code: "STRING_PERFORMANCE_DEVIATION",
      title: "STRING PERFORMANCE DEVIATION",
      severity: "medium",
      status: "open",
      triggered_at: new Date(now.getTime() - 5400000).toISOString(),
    },
    {
      id: "alt-ineff",
      site_id: "site-2",
      code: "1D4C3",
      title: "Inefficient Power Plants",
      severity: "medium",
      status: "open",
      triggered_at: new Date(now.getTime() - 9000000).toISOString(),
    }
  ];

  const sitesMap = new Map([
    ["site-1", { id: "site-1", name: "Alcove Society A wing" }],
    ["site-2", { id: "site-2", name: "Vijay Vatika Solar" }],
  ]);

  const errorLogs = formatClientServiceRequests([], [], sitesMap, mockAlerts);

  assert(
    errorLogs.length === 4,
    "Test 4a: formatClientServiceRequests incorporates all alerts directly into the Client Operational Error Log",
    `count: ${errorLogs.length}`
  );

  const gridLog = errorLogs.find((l) => l.id === "alt-grid-ovf");
  assert(
    gridLog !== undefined &&
    gridLog.macroCategory === "Grid Outage" &&
    gridLog.title.includes("Grid") &&
    Boolean(gridLog.whatIsGoingOn) &&
    Boolean(gridLog.whatSaIsDoing) &&
    gridLog.whatIsGoingOn.includes("DISCOM") &&
    gridLog.whatSaIsDoing.includes("SolarAssist automated safety controls"),
    "Test 4b: Grid frequency fluctuation error contains semi-technical 'What is going on' and 'What SA is doing'",
    gridLog
  );

  const wifiLog = errorLogs.find((l) => l.id === "alt-wifi-loss");
  assert(
    wifiLog !== undefined &&
    wifiLog.macroCategory === "Connectivity & Gateway" &&
    wifiLog.title.includes("Data Gateway") &&
    wifiLog.whatIsGoingOn.includes("continuing to generate solar electricity normally") &&
    wifiLog.whatSaIsDoing.includes("diagnostic ping retries"),
    "Test 4c: Wi-Fi gateway loss explains normal solar power generation and SA buffering/retries",
    wifiLog
  );

  const stringLog = errorLogs.find((l) => l.id === "alt-string-dev");
  assert(
    stringLog !== undefined &&
    stringLog.macroCategory === "String Optimization" &&
    stringLog.whatIsGoingOn.includes("minor current or voltage variance") &&
    stringLog.whatSaIsDoing.includes("SolarAssist algorithmic performance engine"),
    "Test 4d: String variance explains row current variation and algorithmic isolation by SA",
    stringLog
  );

  // --- TEST 5: Site Table next_cleaning_date 2 Days in Advance generates Pop-up Event ---
  const mockSites = [
    {
      id: "site-cilantro-1",
      name: "Cilantro",
      next_cleaning_date: twoDaysAhead,
      cleaning_schedule_type: "manual",
      cleaning_schedule_acknowledged_at: null,
    },
    {
      id: "site-alcove-far",
      name: "Alcove society A wing",
      next_cleaning_date: tenDaysAhead,
      cleaning_schedule_type: "approved",
      cleaning_schedule_acknowledged_at: null,
    },
    {
      id: "site-acked",
      name: "Dosti Jade CHS",
      next_cleaning_date: twoDaysAhead,
      cleaning_schedule_type: "manual",
      cleaning_schedule_acknowledged_at: new Date().toISOString(),
    }
  ];

  const events5 = sanitizeServiceEvents([], [], [], [], [], mockSites);
  const sitePrompt2Days = events5.find((e) => e.id === "site-clean-site-cilantro-1");
  const sitePrompt10Days = events5.find((e) => e.id === "site-clean-site-alcove-far");
  const sitePromptAcked = events5.find((e) => e.id === "site-clean-site-acked");

  assert(
    sitePrompt2Days !== undefined &&
    sitePrompt2Days.actionable === "cleaning_schedule_ack" &&
    sitePrompt2Days.actionableStatus === "pending" &&
    sitePrompt2Days.actionableContext?.site_name === "Cilantro" &&
    sitePrompt2Days.actionableContext?.entityType === "site",
    "Test 5a: Site manual cleaning date scheduled 2 days in advance generates pending cleaning_schedule_ack popup event",
    sitePrompt2Days
  );

  assert(
    sitePrompt10Days !== undefined &&
    sitePrompt10Days.actionable === "cleaning_schedule_ack" &&
    sitePrompt10Days.actionableStatus === "pending" &&
    sitePrompt10Days.actionableContext?.isWithin2Days === false,
    "Test 5b: Site cleaning date scheduled 10 days in advance is actionable notification with isWithin2Days=false",
    sitePrompt10Days
  );

  assert(
    sitePromptAcked !== undefined &&
    sitePromptAcked.actionableStatus === "completed",
    "Test 5c: Acknowledged site cleaning schedule marks actionableStatus as completed",
    sitePromptAcked
  );

  console.log("================================================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runVerificationTests().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});
