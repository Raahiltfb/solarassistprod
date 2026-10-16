import { calculateClientHealthScore } from "../lib/client-health-score";
import { 
  getMacroTechnicalDescription, 
  getSanitizedInverterStatus, 
  calculateFinancialSavings, 
  sanitizeServiceEvents, 
  formatClientServiceRequests 
} from "../lib/client-sanitizer";

async function runPhase7Tests() {
  console.log("==================================================");
  console.log("RUNNING PHASE 7: PREMIUM CLIENT EXPERIENCE TESTS");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
      failed++;
    }
  }

  // --- Test 1: Explainable Health Score Baseline ---
  const health1 = calculateClientHealthScore({
    inverters: [
      { id: "inv-1", status: "online", last_seen_at: new Date().toISOString() },
      { id: "inv-2", status: "online", last_seen_at: new Date().toISOString() },
    ],
    alerts: [],
    sites: [{ cleaning_cycle_days: 30, last_cleaned_on: new Date().toISOString() }],
  });

  assert(
    health1.score === 100 &&
    health1.status === "NORMAL" &&
    health1.breakdown.inverterScore === 40 &&
    health1.breakdown.incidentScore === 35 &&
    health1.breakdown.cleaningScore === 25 &&
    health1.breakdown.factors.length === 3,
    "Test 1: Health score returns perfect 100 with all 3 optimal factor breakdowns when systems are nominal",
    JSON.stringify(health1)
  );

  // --- Test 2: Health Score Factors in Verification Engine States ---
  const health2 = calculateClientHealthScore({
    inverters: [
      { id: "inv-1", status: "online", last_seen_at: new Date().toISOString() },
    ],
    alerts: [
      { id: "alt-1", site_id: "site-1", inverter_id: "inv-1", code: "SOLIS_ERR_01", severity: "high", status: "open" }
    ],
    sites: [{ cleaning_cycle_days: 30, last_cleaned_on: new Date().toISOString() }],
    tickets: [
      {
        id: "tkt-1",
        site_id: "site-1",
        status: "resolved",
        verification_status: "under_verification",
        reopened_count: 0,
      }
    ]
  });

  assert(
    health2.breakdown.factors[1].detail.includes("under active telemetry verification") &&
    health2.score >= 80,
    "Test 2: Health score integrates Phase 6 'under_verification' state with explainable factor explanation",
    JSON.stringify(health2)
  );

  // --- Test 3: Macro-Technical Sanitization for String Diagnostics & Inverters ---
  const macroString = getMacroTechnicalDescription(
    { code: "STRING_UNDERPERFORM", title: "[String Diagnostic] SUSTAINED UNDERPERFORMANCE - INV-01 String #3" },
    "Cilantro Solar"
  );

  const macroInverter = getMacroTechnicalDescription(
    { code: "SOLIS_ERR_01_HEX_0x44", title: "ALARM: INVERTER DC ISOLATION FAULT 0x01" },
    "Cilantro Solar"
  );

  const macroGateway = getMacroTechnicalDescription(
    { code: "COMMS_TIMEOUT", title: "[Internet/WiFi Down] Site Gateway Disconnected" },
    "Cilantro Solar"
  );

  assert(
    !macroString.title.includes("HEX") &&
    !macroString.description.includes("ERR_") &&
    macroString.category === "String Optimization" &&
    macroString.title.includes("String Performance Optimization"),
    "Test 3a: String underperformance alarm is converted into reassuring macro-technical copy",
    JSON.stringify(macroString)
  );

  assert(
    !macroInverter.title.includes("0x") &&
    macroInverter.category === "Inverter Service" &&
    macroInverter.title.includes("Inverter Safety Inspection Underway"),
    "Test 3b: Inverter isolation error is converted into safety inspection copy",
    JSON.stringify(macroInverter)
  );

  assert(
    macroGateway.category === "Connectivity & Gateway" &&
    macroGateway.description.includes("Inverters continue generating solar electricity normally"),
    "Test 3c: Connectivity loss explains continuous generation while gateway is checked",
    JSON.stringify(macroGateway)
  );

  // --- Test 4: Financial Savings Accuracy with Tariff Fallback ---
  const savingsConfigured = calculateFinancialSavings(1000, 7.5);
  const savingsUnconfigured = calculateFinancialSavings(1000, null);
  const savingsZero = calculateFinancialSavings(1000, undefined);

  assert(
    savingsConfigured !== null &&
    savingsConfigured.amount === 7500 &&
    savingsConfigured.formatted.includes("7,500"),
    "Test 4a: Financial savings accurately calculated when grid tariff is configured (₹7.50/kWh)",
    JSON.stringify(savingsConfigured)
  );

  assert(
    savingsUnconfigured === null && savingsZero === null,
    "Test 4b: Financial savings safely returns null when tariff is not configured (preventing misleading zero/fake estimates)",
    `unconfigured: ${savingsUnconfigured}`
  );

  // --- Test 5: Service Request Lifecycle Mapping & Verification States ---
  const mockTickets = [
    {
      id: "tkt-001",
      site_id: "site-100",
      title: "[String Diagnostic] SUSTAINED UNDERPERFORMANCE - String 2",
      status: "resolved",
      verification_status: "under_verification",
      verification_notes: "Technician checked MC4 connector and replaced string fuse.",
      pre_repair_metric: "0.4A string current under 700 W/m2",
      post_repair_metric: "5.1A nominal current confirmed",
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "tkt-002",
      site_id: "site-100",
      title: "Inverter Communication Loss",
      status: "closed",
      verification_status: "verified_recovered",
      post_repair_metric: "Inverter Online & Telemetry Active",
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  const mockWorkOrders = [
    {
      id: "wo-001",
      ticket_id: "tkt-001",
      site_id: "site-100",
      status: "completed",
      completed_at: new Date(Date.now() - 3600000).toISOString(),
      before_photo_url: "https://example.com/before.jpg",
      after_photo_url: "https://example.com/after.jpg",
    }
  ];

  const sitesMap = new Map([["site-100", { id: "site-100", name: "Cilantro Solar" }]]);

  const serviceRequests = formatClientServiceRequests(mockTickets, mockWorkOrders, sitesMap);

  assert(
    serviceRequests.length === 2 &&
    serviceRequests[0].id === "tkt-001" &&
    serviceRequests[0].status === "verifying" &&
    serviceRequests[0].statusLabel === "Telemetry Verifying" &&
    serviceRequests[0].beforePhotoUrl === "https://example.com/before.jpg" &&
    Boolean(serviceRequests[0].technicianFindings?.includes("replaced string fuse")),
    "Test 5a: Ticket in under_verification maps to 'Telemetry Verifying' status with photos and technician findings",
    JSON.stringify(serviceRequests[0])
  );

  assert(
    serviceRequests[1].id === "tkt-002" &&
    serviceRequests[1].status === "resolved" &&
    serviceRequests[1].statusLabel === "Verified Resolved",
    "Test 5b: Ticket in verified_recovered maps to 'Verified Resolved' status",
    JSON.stringify(serviceRequests[1])
  );

  // --- Test 6: Inverter Equipment Status Sanitization ---
  const invNormal = getSanitizedInverterStatus("online", "INV-SN-123", false);
  const invStale = getSanitizedInverterStatus("online", "INV-SN-123", true);
  const invFault = getSanitizedInverterStatus("fault", "INV-SN-123", false);

  assert(
    invNormal.badgeVariant === "success" && invNormal.badgeText === "Operating Normally",
    "Test 6a: Inverter online returns Operating Normally badge",
    JSON.stringify(invNormal)
  );

  assert(
    invStale.badgeVariant === "warning" && invStale.badgeText === "Attention Needed",
    "Test 6b: Stale telemetry inverters (>30m) return Attention Needed",
    JSON.stringify(invStale)
  );

  assert(
    invFault.badgeVariant === "warning" && invFault.badgeText === "Service Check",
    "Test 6c: Inverter fault returns reassuring Service Check rather than alarm scare",
    JSON.stringify(invFault)
  );

  console.log("==================================================");
  console.log(`PHASE 7 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
