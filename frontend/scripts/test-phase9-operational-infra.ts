import { 
  validateOnboardingPayload, 
  generateDefaultSlaPolicy, 
  calculateContractEndDate, 
  calculateBillingAmountPerCycle,
  OnboardingRequest 
} from "../lib/onboarding/onboarding-engine";

import { 
  calculateStockStatus, 
  calculateInventoryValuation, 
  getLowStockAlerts, 
  validateStockTransaction 
} from "../lib/inventory/inventory-engine";

import { 
  calculateSlaPerformance, 
  calculateInvoiceBreakdown, 
  calculatePortfolioContractStats 
} from "../lib/contracts/contracts-engine";

import { InventoryItem, Contract, Ticket } from "../lib/types";

async function runPhase9Tests() {
  console.log("==================================================");
  console.log("RUNNING PHASE 9: OPERATIONAL INFRASTRUCTURE TESTS");
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

  // =========================================================================
  // PILLAR 1: AUTOMATED ONBOARDING WORKFLOWS & PRE-FLIGHT VALIDATION
  // =========================================================================

  // Test 1: Valid Onboarding Payload
  const validPayload: OnboardingRequest = {
    site: {
      name: "SolarEdge Green Park",
      capacity_kwp: 150.5,
      location: "Industrial Area Phase 2, Pune, Maharashtra",
      latitude: 18.5204,
      longitude: 73.8567,
      grid_tariff_inr_per_kwh: 7.25,
      service_tier: "full_om",
    },
    inverters: [
      {
        oem: "solis",
        model: "Solis-50K-LV",
        serial_number: "SOL-50K-001",
        capacity_kw: 50,
        string_count: 8,
        datalogger_sn: "DLG-001",
      },
      {
        oem: "solis",
        model: "Solis-50K-LV",
        serial_number: "SOL-50K-002",
        capacity_kw: 50,
        string_count: 8,
        datalogger_sn: "DLG-002",
      },
    ],
    cleaning: {
      cleaning_cycle_days: 15,
      water_source_notes: "Borewell with RO softening unit on site",
    },
    contract: {
      contract_number: "AMC-2026-SEGP-01",
      contract_type: "comprehensive",
      start_date: "2026-04-01",
      duration_months: 12,
      annual_value_inr: 240000,
      billing_frequency: "quarterly",
      sla_tier: "premium",
      auto_renew: true,
    },
  };

  const validationResult1 = validateOnboardingPayload(validPayload);
  assert(
    validationResult1.isValid && validationResult1.errors.length === 0,
    "Test 1: Pre-flight validator approves fully compliant plant onboarding payload"
  );

  // Test 2: Validation detects duplicate inverter serial numbers & invalid coordinates
  const invalidPayload: OnboardingRequest = {
    ...validPayload,
    site: {
      ...validPayload.site,
      latitude: 195.0, // Invalid latitude > 90
    },
    inverters: [
      {
        oem: "solis",
        model: "Solis-50K-LV",
        serial_number: "SOL-DUP-001",
        capacity_kw: 50,
        string_count: 8,
      },
      {
        oem: "solis",
        model: "Solis-50K-LV",
        serial_number: "sol-dup-001", // Duplicate case-insensitive
        capacity_kw: 50,
        string_count: 8,
      },
    ],
  };

  const validationResult2 = validateOnboardingPayload(invalidPayload);
  assert(
    !validationResult2.isValid &&
    validationResult2.errors.some((e) => e.includes("latitude")) &&
    validationResult2.errors.some((e) => e.includes("Duplicate serial number")),
    "Test 2: Pre-flight validator detects out-of-bound coordinates and duplicate inverter serials",
    JSON.stringify(validationResult2.errors)
  );

  // Test 3: SLA Policy Generation & Lifecycle Date Math
  const premiumSla = generateDefaultSlaPolicy("cnt-01", "org-01", "premium");
  const standardSla = generateDefaultSlaPolicy("cnt-02", "org-01", "standard");
  const basicSla = generateDefaultSlaPolicy("cnt-03", "org-01", "basic");

  const endDate = calculateContractEndDate("2026-01-01", 12);
  const cycleBilling = calculateBillingAmountPerCycle(120000, "quarterly");

  assert(
    premiumSla.p1_resolution_hours === 8.0 &&
    standardSla.p1_resolution_hours === 12.0 &&
    basicSla.p1_resolution_hours === 24.0 &&
    premiumSla.uptime_guarantee_percent === 99.0 &&
    endDate === "2026-12-31" &&
    cycleBilling === 30000,
    "Test 3: Contract lifecycle date math and tiered SLA policy generator compute accurately"
  );

  // =========================================================================
  // PILLAR 2: INVENTORY & SPARES MANAGEMENT
  // =========================================================================

  const mockInventory: InventoryItem[] = [
    {
      id: "item-1",
      org_id: "org-01",
      sku: "FUSE-1000V-15A",
      name: "Solar PV String Fuse 15A 1000V DC",
      category: "electrical_fuses",
      quantity_on_hand: 50,
      min_reorder_level: 15,
      unit_cost_inr: 350,
      oem_compatibility: ["solis", "growatt"],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "item-2",
      org_id: "org-01",
      sku: "CONN-MC4-PAIR",
      name: "MC4 Solar Connector Pair",
      category: "connectors_cables",
      quantity_on_hand: 8,
      min_reorder_level: 20, // Low stock (8 <= 20)
      unit_cost_inr: 120,
      oem_compatibility: ["universal"],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "item-3",
      org_id: "org-01",
      sku: "SPD-TYPE2-1000V",
      name: "DC Surge Protection Device Type II",
      category: "switchgear_relays",
      quantity_on_hand: 0, // Out of stock
      min_reorder_level: 5,
      unit_cost_inr: 2800,
      oem_compatibility: ["universal"],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  // Test 4: Inventory Stock Health States & Low Stock Identification
  const status1 = calculateStockStatus(mockInventory[0]);
  const status2 = calculateStockStatus(mockInventory[1]);
  const status3 = calculateStockStatus(mockInventory[2]);
  const lowAlerts = getLowStockAlerts(mockInventory);

  assert(
    status1 === "optimal" &&
    status2 === "low_stock" &&
    status3 === "out_of_stock" &&
    lowAlerts.length === 2 &&
    lowAlerts.map((i) => i.sku).includes("CONN-MC4-PAIR") &&
    lowAlerts.map((i) => i.sku).includes("SPD-TYPE2-1000V"),
    "Test 4: Stock health state categorizer accurately identifies optimal, low stock, and zero-inventory SKUs"
  );

  // Test 5: Valuation and Aggregation
  // Item 1: 50 * 350 = 17500
  // Item 2: 8 * 120 = 960
  // Item 3: 0 * 2800 = 0
  // Total valuation: 18460, Total SKUs: 3, Total units: 58, low: 1, out: 1
  const valuation = calculateInventoryValuation(mockInventory);

  assert(
    valuation.totalValuationInr === 18460 &&
    valuation.totalSkus === 3 &&
    valuation.totalUnits === 58 &&
    valuation.lowStockCount === 1 &&
    valuation.outOfStockCount === 1,
    "Test 5: Portfolio spare parts valuation aggregates capital assets and replenish alerts correctly",
    JSON.stringify(valuation)
  );

  // Test 6: Transaction Quantity Validation Guard
  const validConsumption = validateStockTransaction(mockInventory[0], "consumed", 10);
  const overdrawConsumption = validateStockTransaction(mockInventory[1], "consumed", 15); // only 8 available
  const invalidNegative = validateStockTransaction(mockInventory[0], "received", -5);

  assert(
    validConsumption.isValid &&
    !overdrawConsumption.isValid &&
    overdrawConsumption.error?.includes("Insufficient stock") &&
    !invalidNegative.isValid,
    "Test 6: Transaction quantity guard blocks negative entries and prevents stock overdrawing on consumption"
  );

  // =========================================================================
  // PILLAR 3: CONTRACTS, LIVE SLA MTTR TRACKING & BILLING INTEGRATIONS
  // =========================================================================

  const mockContract: Contract = {
    id: "cnt-test-01",
    org_id: "org-01",
    site_id: "site-anoopam",
    contract_number: "AMC-2026-ANOOPAM-01",
    contract_type: "comprehensive",
    status: "active",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    contract_value_inr: 360000,
    billing_frequency: "quarterly",
    billing_amount_per_cycle_inr: 90000,
    sla_tier: "premium",
    auto_renew: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockTickets: Ticket[] = [
    // P1 resolved in 4 hours (SLA target is 8h) -> Compliant
    {
      id: "tkt-01",
      org_id: "org-01",
      site_id: "site-anoopam",
      ticket_number: "TKT-001",
      title: "Inverter Trip",
      description: "Grid fault",
      status: "resolved",
      priority: "p1",
      category: "inverter",
      reopened_count: 0,
      created_at: "2026-05-10T08:00:00Z",
      resolved_at: "2026-05-10T12:00:00Z",
      updated_at: "2026-05-10T12:00:00Z",
    },
    // P1 resolved in 14 hours (target is 8h) -> 6 hours breach
    {
      id: "tkt-02",
      org_id: "org-01",
      site_id: "site-anoopam",
      ticket_number: "TKT-002",
      title: "DC Ground Fault",
      description: "Cable insulation breakdown",
      status: "resolved",
      priority: "p1",
      category: "inverter",
      reopened_count: 0,
      created_at: "2026-05-15T06:00:00Z",
      resolved_at: "2026-05-15T20:00:00Z",
      updated_at: "2026-05-15T20:00:00Z",
    },
    // P2 resolved in 10 hours (target is 16h) -> Compliant
    {
      id: "tkt-03",
      org_id: "org-01",
      site_id: "site-anoopam",
      ticket_number: "TKT-003",
      title: "String Underperformance",
      description: "Blown fuse",
      status: "resolved",
      priority: "p2",
      category: "string",
      reopened_count: 0,
      created_at: "2026-05-18T07:00:00Z",
      resolved_at: "2026-05-18T17:00:00Z",
      updated_at: "2026-05-18T17:00:00Z",
    },
  ];

  // Test 7: SLA MTTR Tracking, Breach Identification, and Penalty Credits
  // Premium SLA has 1000 INR/hour penalty for P1 resolution breach
  // 6 hours breach * 1000 = 6000 INR penalty
  const slaReport = calculateSlaPerformance({
    contract: mockContract,
    tickets: mockTickets,
    actualUptimePct: 99.5, // > 99.0% target
  });

  assert(
    slaReport.total_incidents === 3 &&
    slaReport.p1_count === 2 &&
    slaReport.p1_breaches === 1 &&
    slaReport.total_breaches === 1 &&
    slaReport.penalty_credit_inr === 6000 &&
    slaReport.compliance_status === "AT_RISK" && // 1 breach makes it AT_RISK
    slaReport.avg_mttr_hours > 0,
    "Test 7: SLA tracking engine evaluates incident MTTR, flags P1 breach, and calculates financial penalty credit",
    JSON.stringify(slaReport)
  );

  // Test 8: Uptime Shortfall Penalty Trigger
  const uptimeBreachedReport = calculateSlaPerformance({
    contract: mockContract,
    tickets: mockTickets,
    actualUptimePct: 97.0, // < 99.0% target (2% shortfall)
  });

  assert(
    uptimeBreachedReport.uptime_breached === true &&
    uptimeBreachedReport.compliance_status === "BREACHED" &&
    uptimeBreachedReport.penalty_credit_inr > 6000,
    "Test 8: System triggers BREACHED status and applies uptime deficit penalty when availability dips below SLA guarantee",
    JSON.stringify(uptimeBreachedReport)
  );

  // Test 9: Automated Billing Statement Breakdown with GST
  // Base: 90,000 INR
  // Consumed Spares: 4,500 INR
  // Penalty Credit: 6,000 INR
  // Subtotal = 90,000 + 4,500 - 6,000 = 88,500 INR
  // 18% GST = 15,930 INR
  // Total = 104,430 INR
  const invoiceBreakdown = calculateInvoiceBreakdown({
    contract: mockContract,
    sparesAmountInr: 4500,
    penaltyCreditInr: 6000,
    taxRatePercent: 18,
  });

  assert(
    invoiceBreakdown.base_amount_inr === 90000 &&
    invoiceBreakdown.spares_amount_inr === 4500 &&
    invoiceBreakdown.penalty_credit_inr === 6000 &&
    invoiceBreakdown.subtotal_inr === 88500 &&
    invoiceBreakdown.tax_amount_inr === 15930 &&
    invoiceBreakdown.total_amount_inr === 104430,
    "Test 9: Automated billing breakdown applies AMC charges, links spare parts, deducts penalty credits, and applies 18% GST",
    JSON.stringify(invoiceBreakdown)
  );

  // Test 10: Portfolio Contract Stats & ARR Aggregation
  const portfolioContracts: Contract[] = [
    mockContract, // active, 360,000
    {
      ...mockContract,
      id: "cnt-02",
      contract_number: "AMC-2026-CYRUS-01",
      status: "active",
      contract_value_inr: 180000,
    },
    {
      ...mockContract,
      id: "cnt-03",
      contract_number: "AMC-2025-OLD-01",
      status: "expired",
      contract_value_inr: 120000,
    },
  ];

  const portfolioStats = calculatePortfolioContractStats(portfolioContracts);
  assert(
    portfolioStats.totalContracts === 3 &&
    portfolioStats.activeCount === 2 &&
    portfolioStats.expiredCount === 1 &&
    portfolioStats.totalPortfolioValueInr === 660000 &&
    portfolioStats.annualRecurringRevenueInr === 540000, // 360,000 + 180,000
    "Test 10: Contract portfolio aggregator computes total contracts, active ARR, and renewal statuses",
    JSON.stringify(portfolioStats)
  );

  console.log("==================================================");
  console.log(`PHASE 9 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase9Tests().catch((err) => {
  console.error("Unhandled error during Phase 9 tests:", err);
  process.exit(1);
});
